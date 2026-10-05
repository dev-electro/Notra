import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import type { JWTVerifyGetKey } from 'jose';
import { createAdminApi } from './admin/api';
import type { AdminDeps } from './admin/auth';
import { verifyGoogleIdToken } from './auth/google';
import { normalizeIndianMobile } from './auth/phone';
import { startOtp, verifyOtp } from './auth/otp';
import type { SmsProvider } from './auth/sms';
import { ACCESS_TTL_S, issueRefreshToken, revokeFamilyOf, rotateRefreshToken, signAccessToken, verifyAccessToken } from './auth/tokens';
import { getMaintenance, publicConfig } from './appconfig';
import type { Config } from './config';
import { withUserTx, type Db } from './db';
import { deleteAccount } from './account';
import { ApiError } from './errors';
import { PAGE_HEADERS, renderPage } from './pages';
import { activeGrant, grantAccess, parseTicketInput, revokeAccess, submitFromApp } from './support';
import { enforceDirections, pullRows, pushRows } from './sync';
import { countSyncError, logError, parseClientInfo, touchActivity } from './telemetry';
import { authState, findOrCreateUser, getUser, linkIdentity, publicUser, type UserRow } from './users';
import { parsePull, validatePush } from './validate';

export interface Deps {
  db: Db;
  config: Config;
  sms: SmsProvider;
  googleKeys: JWTVerifyGetKey;
  now?: () => Date;
  /** Admin panel settings. Without it /admin/api is not mounted. */
  admin?: AdminDeps;
}

type Vars = { Variables: { userId: string; role: string } };
const MAX_BODY = 1_000_000; // ~1 MB: a 500-row batch is far smaller
export const SUSPENDED_MESSAGE_HI = 'आपका खाता अस्थायी रूप से रोका गया है। सहायता से संपर्क करें।';

export function createApp(deps: Deps): Hono<Vars> {
  const app = new Hono<Vars>();
  const now = () => (deps.now ?? (() => new Date()))();
  const suspended = () => new ApiError(403, 'account_suspended', { message_hi: SUSPENDED_MESSAGE_HI });

  app.onError(async (err, c) => {
    if (err instanceof ApiError) {
      const headers: Record<string, string> = {};
      const retry = err.extra?.retryAfter;
      if (typeof retry === 'number') headers['retry-after'] = String(retry);
      if (err.status >= 500) await logError(deps.db, { method: c.req.method, path: c.req.path, status: err.status, error: err });
      return c.json({ error: err.code, ...err.extra }, err.status, headers);
    }
    const pg = err as { code?: string; message?: string };
    // A token that outlives its account (deleted meanwhile) fails the user_id foreign key: that is "signed out", not a crash.
    if (pg.code === '23503') return c.json({ error: 'unauthorized' }, 401);
    // Database refusals raised on purpose: Row Level Security / role checks, "not found" and "last owner" from SQL functions.
    if (pg.code === '42501') return c.json({ error: 'forbidden' }, 403);
    if (pg.code === 'P0002') return c.json({ error: 'not_found' }, 404);
    if (pg.message === 'last_owner') return c.json({ error: 'last_owner' }, 409);
    console.error('unhandled', err instanceof Error ? err.message : err);
    await logError(deps.db, { method: c.req.method, path: c.req.path, status: 500, error: err });
    return c.json({ error: 'internal' }, 500);
  });
  app.notFound((c) => c.json({ error: 'not_found' }, 404));

  // Counts a failed sync request against the user's day (aggregate counter, no content).
  app.use('/v1/sync/*', async (c, next) => {
    await next();
    const uid = c.get('userId');
    if (uid && (c.error || c.res.status >= 400)) {
      try {
        await withUserTx(deps.db, uid, 'user', (q) => countSyncError(q, uid));
      } catch { /* bookkeeping only */ }
    }
  });

  // Maintenance mode (remote config): sign-in and sync answer 503 with the message. Health, config and the admin API stay up.
  const maintenance = async (_c: Context, next: () => Promise<void>) => {
    const m = await getMaintenance(deps.db);
    if (m.enabled) throw new ApiError(503, 'maintenance', { message_hi: m.message_hi, message_en: m.message_en, retryAfter: 300 });
    await next();
  };
  app.use('/v1/auth/*', maintenance);
  app.use('/v1/sync/*', maintenance);

  if (deps.admin?.allowedOrigin) {
    // The admin web app signs in through the normal auth endpoints from its own origin.
    app.use('/v1/auth/*', cors({ origin: deps.admin.allowedOrigin, allowHeaders: ['authorization', 'content-type', 'x-app-version', 'x-platform'], maxAge: 600 }));
  }

  async function body(c: Context): Promise<unknown> {
    const len = Number(c.req.header('content-length') ?? 0);
    if (len > MAX_BODY) throw new ApiError(413, 'too_large');
    const text = await c.req.text();
    if (text.length > MAX_BODY) throw new ApiError(413, 'too_large');
    try {
      return JSON.parse(text);
    } catch {
      throw new ApiError(400, 'invalid_json');
    }
  }
  const field = (b: unknown, k: string): unknown => (typeof b === 'object' && b !== null ? (b as Record<string, unknown>)[k] : undefined);
  const info = (c: Context) => parseClientInfo((n) => c.req.header(n));

  /** Issue tokens and note the sign-in (device + activity). A suspended account gets 403 here: no new session. */
  async function session(c: Context, user: UserRow) {
    if (user.status === 'suspended') throw suspended();
    const refresh = await withUserTx(deps.db, user.id, 'user', async (q) => {
      await touchActivity(q, user.id, info(c), false);
      return issueRefreshToken(q, user.id);
    });
    return {
      accessToken: await signAccessToken(user.id, deps.config.jwtSecret, now()),
      refreshToken: refresh.token,
      expiresIn: ACCESS_TTL_S,
      user: publicUser(user),
    };
  }

  /** Verifies the access token, then asks the database (not the token) whether the account is suspended and what staff role it has. */
  const requireAuth = async (c: Context<Vars>, next: () => Promise<void>) => {
    const h = c.req.header('authorization') ?? '';
    const m = /^Bearer (\S+)$/.exec(h);
    if (!m) throw new ApiError(401, 'unauthorized');
    const userId = await verifyAccessToken(m[1]!, deps.config.jwtSecret, now());
    const st = await authState(deps.db, userId);
    // A token for a deleted account is "signed out" (401), except that deleting an already-deleted account stays idempotent (200).
    if (!st && !(c.req.method === 'DELETE' && c.req.path === '/v1/account')) throw new ApiError(401, 'unauthorized');
    if (st?.status === 'suspended') throw suspended();
    c.set('userId', userId);
    c.set('role', st?.role ?? 'user');
    if (c.req.path.startsWith('/v1/sync/')) await withUserTx(deps.db, userId, 'user', (q) => touchActivity(q, userId, info(c), true));
    await next();
  };

  app.get('/v1/health', (c) => c.json({ ok: true }));

  // Remote config for the app: public subset only, no auth, cached for 5 minutes.
  app.get('/v1/config', async (c) => c.json(await publicConfig(deps.db, now()), 200, { 'cache-control': 'public, max-age=300' }));

  // ---- sign-in ----
  app.post('/v1/auth/google', async (c) => {
    const g = await verifyGoogleIdToken(field(await body(c), 'idToken'), deps.config.googleClientIds, deps.googleKeys, now());
    const user = await findOrCreateUser(deps.db, { googleSub: g.sub, name: g.name, email: g.email });
    return c.json(await session(c, user));
  });

  const phoneOf = (b: unknown) => {
    const p = normalizeIndianMobile(field(b, 'phone'));
    if (!p) throw new ApiError(400, 'invalid_phone');
    return p;
  };
  const clientIp = (c: Context) => c.req.header('cf-connecting-ip') ?? 'unknown';

  app.post('/v1/auth/otp/start', async (c) => {
    const phone = phoneOf(await body(c));
    return c.json({ ok: true, ...(await startOtp(deps.db, deps.sms, deps.config.otpPepper, phone, clientIp(c))) });
  });

  app.post('/v1/auth/otp/verify', async (c) => {
    const b = await body(c);
    const phone = phoneOf(b);
    await verifyOtp(deps.db, deps.config.otpPepper, phone, field(b, 'code'), clientIp(c));
    return c.json(await session(c, await findOrCreateUser(deps.db, { phone })));
  });

  app.post('/v1/auth/refresh', async (c) => {
    const token = field(await body(c), 'refreshToken');
    if (typeof token !== 'string' || token.length < 20 || token.length > 200) throw new ApiError(401, 'invalid_refresh_token');
    // The reuse-detection revocation must commit even though we answer 401, so rotate in its own transaction and
    // return a value instead of throwing inside it.
    const r = await deps.db.tx((q) => rotateRefreshToken(q, token));
    if (!r.ok) throw new ApiError(401, 'invalid_refresh_token');
    const user = await withUserTx(deps.db, r.userId, 'user', async (q) => {
      await touchActivity(q, r.userId, info(c), false);
      return getUser(q, r.userId);
    });
    if (!user) throw new ApiError(401, 'invalid_refresh_token');
    if (user.status === 'suspended') throw suspended();
    return c.json({
      accessToken: await signAccessToken(user.id, deps.config.jwtSecret, now()),
      refreshToken: r.token,
      expiresIn: ACCESS_TTL_S,
      user: publicUser(user),
    });
  });

  app.post('/v1/auth/logout', async (c) => {
    const token = field(await body(c), 'refreshToken');
    if (typeof token === 'string' && token.length <= 200) await revokeFamilyOf(deps.db, token);
    return c.json({ ok: true });
  });

  // ---- link a second sign-in method to the signed-in user ----
  app.post('/v1/auth/link/google', requireAuth, async (c) => {
    const g = await verifyGoogleIdToken(field(await body(c), 'idToken'), deps.config.googleClientIds, deps.googleKeys, now());
    const uid = c.get('userId');
    return c.json({ user: publicUser(await withUserTx(deps.db, uid, 'user', (q) => linkIdentity(q, uid, { googleSub: g.sub, name: g.name, email: g.email }))) });
  });

  app.post('/v1/auth/link/phone', requireAuth, async (c) => {
    const b = await body(c);
    const phone = phoneOf(b);
    await verifyOtp(deps.db, deps.config.otpPepper, phone, field(b, 'code'), clientIp(c));
    const uid = c.get('userId');
    return c.json({ user: publicUser(await withUserTx(deps.db, uid, 'user', (q) => linkIdentity(q, uid, { phone }))) });
  });

  // ---- sync (every query is scoped by the token's user id, and by Row Level Security) ----
  app.post('/v1/sync/push', requireAuth, async (c) => {
    const validated = validatePush(await body(c));
    const userId = c.get('userId');
    // Bad rows are reported one by one (`rejected`) and the good rows are stored: one poison row never blocks the batch.
    const { batch, rejected: wrongDirection } = await enforceDirections(deps.db, userId, validated.batch);
    return c.json({ ok: true, accepted: await pushRows(deps.db, userId, batch), rejected: [...validated.rejected, ...wrongDirection] });
  });

  app.get('/v1/sync/pull', requireAuth, async (c) => {
    const { since, limit } = parsePull(c.req.query());
    return c.json(await pullRows(deps.db, c.get('userId'), since, limit));
  });

  // ---- delete my account and all my data (Play Store + DPDP) ----
  app.delete('/v1/account', requireAuth, async (c) => {
    await deleteAccount(deps.db, c.get('userId'));
    return c.json({ ok: true });
  });

  // ---- support: send a ticket / grievance (rate limited), and consented support access to my data ----
  app.post('/v1/support', requireAuth, async (c) => {
    const input = parseTicketInput(await body(c));
    const uid = c.get('userId');
    const t = await withUserTx(deps.db, uid, 'user', (q) => submitFromApp(q, uid, input));
    return c.json({ ok: true, id: t.id, dueAt: t.due_at }, 201);
  });

  // Body: { action: "grant", hours?: 1..168, ticketId? } or { action: "revoke" }. Only the user can create a grant (RLS), max 7 days.
  app.post('/v1/support/access', requireAuth, async (c) => {
    const b = await body(c);
    const uid = c.get('userId');
    const action = field(b, 'action');
    if (action === 'revoke') {
      const n = await withUserTx(deps.db, uid, 'user', (q) => revokeAccess(q, uid));
      return c.json({ ok: true, revoked: n });
    }
    if (action !== 'grant') throw new ApiError(400, 'invalid_input');
    const hours = field(b, 'hours') === undefined ? 168 : Number(field(b, 'hours'));
    if (!Number.isFinite(hours) || hours < 1 || hours > 168) throw new ApiError(400, 'invalid_hours');
    const ticketId = field(b, 'ticketId');
    if (ticketId !== undefined && ticketId !== null && (typeof ticketId !== 'string' || !/^[0-9a-f-]{36}$/i.test(ticketId))) throw new ApiError(400, 'invalid_input');
    const g = await withUserTx(deps.db, uid, 'user', (q) => grantAccess(q, uid, hours, (ticketId as string | null | undefined) ?? null));
    return c.json({ ok: true, ...g }, 201);
  });

  app.get('/v1/support/access', requireAuth, async (c) => {
    const uid = c.get('userId');
    return c.json({ grant: await withUserTx(deps.db, uid, 'user', (q) => activeGrant(q, uid)) });
  });

  // ---- admin API (staff only; see server/src/admin) ----
  if (deps.admin) app.route('/admin/api', createAdminApi(deps, deps.admin).app as unknown as Hono<Vars>);

  // ---- public pages the Play listing links to ----
  const page = (path: string, id: Parameters<typeof renderPage>[0]) =>
    app.get(path, (c) => c.body(renderPage(id), 200, PAGE_HEADERS));
  page('/privacy', 'privacy');
  page('/terms', 'terms');
  page('/grievance', 'grievance');
  page('/delete-account', 'delete-account');

  return app;
}

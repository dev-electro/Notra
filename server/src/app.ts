import { Hono, type Context } from 'hono';
import type { JWTVerifyGetKey } from 'jose';
import { verifyGoogleIdToken } from './auth/google';
import { normalizeIndianMobile } from './auth/phone';
import { startOtp, verifyOtp } from './auth/otp';
import type { SmsProvider } from './auth/sms';
import { ACCESS_TTL_S, issueRefreshToken, revokeFamilyOf, rotateRefreshToken, signAccessToken, verifyAccessToken } from './auth/tokens';
import type { Config } from './config';
import type { Db } from './db';
import { ApiError } from './errors';
import { pullRows, pushRows } from './sync';
import { findOrCreateUser, getUser, linkIdentity, publicUser, type UserRow } from './users';
import { parsePull, validatePush } from './validate';

export interface Deps {
  db: Db;
  config: Config;
  sms: SmsProvider;
  googleKeys: JWTVerifyGetKey;
  now?: () => Date;
}

type Vars = { Variables: { userId: string } };
const MAX_BODY = 1_000_000; // ~1 MB: a 500-row batch is far smaller

export function createApp(deps: Deps): Hono<Vars> {
  const app = new Hono<Vars>();
  const now = () => (deps.now ?? (() => new Date()))();

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      const headers: Record<string, string> = {};
      const retry = err.extra?.retryAfter;
      if (typeof retry === 'number') headers['retry-after'] = String(retry);
      return c.json({ error: err.code, ...err.extra }, err.status, headers);
    }
    console.error('unhandled', err instanceof Error ? err.message : err);
    return c.json({ error: 'internal' }, 500);
  });
  app.notFound((c) => c.json({ error: 'not_found' }, 404));

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

  async function session(user: UserRow) {
    const refresh = await issueRefreshToken(deps.db, user.id);
    return {
      accessToken: await signAccessToken(user.id, deps.config.jwtSecret, now()),
      refreshToken: refresh.token,
      expiresIn: ACCESS_TTL_S,
      user: publicUser(user),
    };
  }

  const requireAuth = async (c: Context<Vars>, next: () => Promise<void>) => {
    const h = c.req.header('authorization') ?? '';
    const m = /^Bearer (\S+)$/.exec(h);
    if (!m) throw new ApiError(401, 'unauthorized');
    c.set('userId', await verifyAccessToken(m[1]!, deps.config.jwtSecret, now()));
    await next();
  };

  app.get('/v1/health', (c) => c.json({ ok: true }));

  // ---- sign-in ----
  app.post('/v1/auth/google', async (c) => {
    const g = await verifyGoogleIdToken(field(await body(c), 'idToken'), deps.config.googleClientIds, deps.googleKeys, now());
    const user = await findOrCreateUser(deps.db, { googleSub: g.sub, name: g.name });
    return c.json(await session(user));
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
    await verifyOtp(deps.db, deps.config.otpPepper, phone, field(b, 'code'));
    return c.json(await session(await findOrCreateUser(deps.db, { phone })));
  });

  app.post('/v1/auth/refresh', async (c) => {
    const token = field(await body(c), 'refreshToken');
    if (typeof token !== 'string' || token.length < 20 || token.length > 200) throw new ApiError(401, 'invalid_refresh_token');
    // The reuse-detection revocation must commit even though we answer 401, so rotate in its own transaction and
    // return a value instead of throwing inside it.
    const r = await deps.db.tx((q) => rotateRefreshToken(q, token));
    if (!r.ok) throw new ApiError(401, 'invalid_refresh_token');
    const user = await getUser(deps.db, r.userId);
    if (!user) throw new ApiError(401, 'invalid_refresh_token');
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
    return c.json({ user: publicUser(await linkIdentity(deps.db, c.get('userId'), { googleSub: g.sub, name: g.name })) });
  });

  app.post('/v1/auth/link/phone', requireAuth, async (c) => {
    const b = await body(c);
    const phone = phoneOf(b);
    await verifyOtp(deps.db, deps.config.otpPepper, phone, field(b, 'code'));
    return c.json({ user: publicUser(await linkIdentity(deps.db, c.get('userId'), { phone })) });
  });

  // ---- sync (every query is scoped by the token's user id) ----
  app.post('/v1/sync/push', requireAuth, async (c) => {
    const batch = validatePush(await body(c));
    return c.json({ ok: true, accepted: await pushRows(deps.db, c.get('userId'), batch) });
  });

  app.get('/v1/sync/pull', requireAuth, async (c) => {
    const { since, limit } = parsePull(c.req.query());
    return c.json(await pullRows(deps.db, c.get('userId'), since, limit));
  });

  return app;
}

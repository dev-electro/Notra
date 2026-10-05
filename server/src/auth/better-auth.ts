import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware, getSessionFromCtx, isAPIError } from 'better-auth/api';
import { bearer, phoneNumber } from 'better-auth/plugins';
import { decodeJwt, type JWTVerifyGetKey } from 'jose';
import type { Config } from '../config';
import { withUserTx, type Db } from '../db';
import { ApiError } from '../errors';
import { authState } from '../users';
import { parseClientInfo, touchActivity } from '../telemetry';
import { dbDialect } from './dialect';
import { verifyGoogleIdToken } from './google';
import { guardOtpSend, guardOtpVerify, OTP_LENGTH, OTP_MAX_ATTEMPTS, OTP_TTL_S, recordSendFail, recordVerify } from './otp-guard';
import { normalizeIndianMobile } from './phone';
import type { SmsProvider } from './sms';

export const AUTH_BASE_PATH = '/api/auth';
/** The app's URL scheme (app.json "scheme"): the Expo client sends it as Origin, so Better Auth's CSRF check must trust it. */
export const APP_SCHEME = 'notradiary';
export const SESSION_TTL_DAYS = 60;
const PLACEHOLDER_DOMAIN = 'phone.notra.invalid';

export interface AuthDeps {
  db: Db;
  config: Config;
  sms: SmsProvider;
  /** Google's signing keys (jose JWKS). Tests inject a local key set. */
  googleKeys: JWTVerifyGetKey;
}

/** Better Auth names fields in camelCase; our tables are snake_case. (Its `casing` option is not applied by the Kysely adapter, so every field is mapped.) */
const snake = (...names: string[]) => Object.fromEntries(names.map((n) => [n, n.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)]));

const ipOf = (h: Headers | undefined | null) => h?.get('cf-connecting-ip') ?? 'unknown';

/** Our ApiError (limits, blocklist) as the error type Better Auth turns into a response. */
function asAuthError(e: unknown): unknown {
  if (!(e instanceof ApiError)) return e;
  const { retryAfter, ...rest } = e.extra ?? {};
  return new APIError(e.status, { error: e.code, code: e.code.toUpperCase(), message: e.code, ...rest, ...(retryAfter !== undefined ? { retryAfter } : {}) },
    typeof retryAfter === 'number' ? { 'retry-after': String(retryAfter) } : undefined);
}

export function suspendedError(messageHi: string) {
  return new APIError('FORBIDDEN', { error: 'account_suspended', code: 'ACCOUNT_SUSPENDED', message: 'account_suspended', message_hi: messageHi });
}

/**
 * The Better Auth instance. It runs inside the Worker, on the same database connection as everything else, and its `user` model is
 * our own `users` table (same uuid ids), so RLS, foreign keys and the suspension / role checks are unchanged. docs/AUTH.md has the design.
 */
export function createAuth(deps: AuthDeps, suspendedMessage: string) {
  const { db, config } = deps;
  const googleOn = config.googleClientIds.length > 0;
  // Our `before` hook runs ahead of the bearer plugin's (Authorization -> cookie) one, so it resolves the session through the full API.
  const self: { auth?: { api: { getSession(o: { headers: Headers }): Promise<{ user: { id: string; phoneNumber?: string | null } } | null> } } } = {};
  const callerSession = (ctx: { request?: Request; headers?: Headers }) => {
    const headers = ctx.request?.headers ?? ctx.headers;
    return headers ? self.auth!.api.getSession({ headers }) : Promise.resolve(null);
  };

  const auth = betterAuth({
    baseURL: config.authUrl,
    basePath: AUTH_BASE_PATH,
    secret: config.authSecret,
    trustedOrigins: [config.authUrl, `${APP_SCHEME}://`, ...config.trustedOrigins],
    database: { dialect: dbDialect(db), type: 'postgres', transaction: false },
    advanced: {
      cookiePrefix: 'notra',
      // Explicit (Better Auth skips its CSRF / origin check by default under test runners): cookie-authenticated POSTs must come from a trusted origin.
      disableOriginCheck: false,
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
      database: { generateId: () => crypto.randomUUID(), validateSchema: false },
    },
    user: { modelName: 'users', fields: { name: 'display_name', ...snake('emailVerified', 'createdAt', 'updatedAt') } },
    session: { modelName: 'auth_sessions', fields: snake('expiresAt', 'createdAt', 'updatedAt', 'ipAddress', 'userAgent', 'userId'), expiresIn: SESSION_TTL_DAYS * 86_400, updateAge: 86_400 },
    account: {
      modelName: 'auth_accounts',
      fields: snake('accountId', 'providerId', 'userId', 'accessToken', 'refreshToken', 'idToken', 'accessTokenExpiresAt', 'refreshTokenExpiresAt', 'createdAt', 'updatedAt'),
      updateAccountOnSignIn: false,
      // A signed-in person adds Google to a phone account (or the other way round); the e-mail on a phone account is a placeholder.
      accountLinking: { enabled: true, trustedProviders: ['google'], allowDifferentEmails: true },
    },
    verification: { modelName: 'auth_verifications', fields: snake('expiresAt', 'createdAt', 'updatedAt') },
    rateLimit: {
      enabled: true,
      storage: 'database',
      modelName: 'auth_rate_limits',
      fields: snake('lastRequest'),
      window: 60,
      max: 60,
      customRules: { '/get-session': false },
    },
    socialProviders: googleOn
      ? {
          google: {
            clientId: config.googleClientIds,
            // The redirect flow is never used (native sign-in sends an ID token), so there is no client secret.
            clientSecret: 'not-used-id-token-only',
            verifyIdToken: async (token: string, nonce?: string) => {
              try {
                await verifyGoogleIdToken(token, config.googleClientIds, deps.googleKeys, new Date(), nonce);
                return true;
              } catch {
                return false;
              }
            },
          },
        }
      : {},
    plugins: [
      phoneNumber({
        otpLength: OTP_LENGTH,
        expiresIn: OTP_TTL_S,
        allowedAttempts: OTP_MAX_ATTEMPTS,
        phoneNumberValidator: (p) => normalizeIndianMobile(p) === p,
        signUpOnVerification: {
          getTempEmail: (p) => `p${p.replace(/^\+/, '')}@${PLACEHOLDER_DOMAIN}`,
          getTempName: () => '',
        },
        schema: { user: { fields: { phoneNumber: 'phone_e164', phoneNumberVerified: 'phone_verified' } } },
        sendOTP: async ({ phoneNumber: phone, code }, ctx) => {
          try {
            await deps.sms.sendOtp(phone, code);
          } catch {
            await recordSendFail(db, phone, ipOf(ctx?.request?.headers ?? ctx?.headers));
            throw asAuthError(new ApiError(502, 'sms_failed'));
          }
        },
      }),
      bearer(),
    ],
    // No password sign-in of any kind, and no password reset through the phone plugin.
    disabledPaths: [
      '/sign-in/email', '/sign-up/email', '/sign-in/phone-number', '/phone-number/request-password-reset', '/phone-number/reset-password',
      '/request-password-reset', '/reset-password', '/change-password', '/set-password', '/change-email', '/verify-email', '/send-verification-email',
    ],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const path = ctx.path;
        // Native Google sign-in only: an ID token from the Google Sign-In SDK. (The redirect flow is not configured.)
        if (path === '/sign-in/social' || path === '/link-social') {
          const idToken = (ctx.body as { idToken?: { token?: unknown } } | undefined)?.idToken;
          if (!idToken) throw new APIError('BAD_REQUEST', { error: 'invalid_google_token', code: 'ID_TOKEN_REQUIRED', message: 'ID token required' });
          if (path === '/link-social') {
            // One Google account per person (the app has always worked that way): refuse a different one on an account that has one.
            const s = await callerSession(ctx);
            if (s) {
              let sub: string;
              try {
                sub = (await verifyGoogleIdToken(idToken.token, config.googleClientIds, deps.googleKeys, new Date())).sub;
              } catch {
                throw new APIError('UNAUTHORIZED', { error: 'invalid_google_token', code: 'INVALID_TOKEN', message: 'invalid token' });
              }
              const have = await withUserTx(db, s.user.id, 'user', (q) =>
                q.query<{ account_id: string }>(`SELECT account_id FROM auth_accounts WHERE user_id = $1 AND provider_id = 'google'`, [s.user.id]));
              if (have.length && have[0]!.account_id !== sub) throw asAuthError(new ApiError(409, 'already_linked_to_different_identity'));
            }
          }
          return;
        }
        if (path !== '/phone-number/send-otp' && path !== '/phone-number/verify') return;
        const body = (ctx.body ?? {}) as { phoneNumber?: unknown; updatePhoneNumber?: unknown };
        const phone = normalizeIndianMobile(body.phoneNumber);
        if (!phone) throw new APIError('BAD_REQUEST', { error: 'invalid_phone', code: 'INVALID_PHONE', message: 'invalid_phone' });
        const ip = ipOf(ctx.request?.headers ?? ctx.headers);
        try {
          if (path === '/phone-number/send-otp') await guardOtpSend(db, phone, ip);
          else {
            await guardOtpVerify(db, phone, ip);
            if (body.updatePhoneNumber) {
              // Adding a number to the signed-in account: refuse if the account already has a different one.
              const s = await callerSession(ctx);
              const have = s?.user.phoneNumber;
              if (have && have !== phone) throw new ApiError(409, 'already_linked_to_different_identity');
            }
          }
        } catch (e) {
          throw asAuthError(e);
        }
        return { context: { ...ctx, body: { ...(ctx.body as object), phoneNumber: phone } } };
      }),
      after: createAuthMiddleware(async (ctx) => {
        const failed = isAPIError(ctx.context.returned);
        if (ctx.path === '/phone-number/verify') {
          const phone = normalizeIndianMobile((ctx.body as { phoneNumber?: unknown } | undefined)?.phoneNumber);
          if (phone) await recordVerify(db, !failed, phone, ipOf(ctx.request?.headers ?? ctx.headers));
        }
        if (ctx.path === '/link-social' && !failed) {
          // A phone account carries a placeholder e-mail: once Google is linked, show the real one (and name) to the person and to staff.
          try {
            const s = await getSessionFromCtx(ctx);
            const claims = decodeJwt((ctx.body as { idToken: { token: string } }).idToken.token);
            const email = typeof claims.email === 'string' ? claims.email : null;
            if (s && email) {
              await withUserTx(db, s.user.id, 'user', (q) =>
                q.query(`UPDATE users SET email = $2, display_name = COALESCE(display_name, $3) WHERE id = $1 AND email LIKE '%@${PLACEHOLDER_DOMAIN}'`,
                  [s.user.id, email.toLowerCase().slice(0, 254), typeof claims.name === 'string' ? claims.name.slice(0, 200) : null]),
              );
            }
          } catch (e) {
            console.error('link-social profile', e instanceof Error ? e.message : e);
          }
        }
      }),
    },
    databaseHooks: {
      // Privacy: never keep Google's tokens. The account row only needs (provider, subject).
      account: {
        create: { before: async (account) => ({ data: { ...account, accessToken: null, refreshToken: null, idToken: null, scope: null } as typeof account }) },
      },
      session: {
        create: {
          // A suspended account gets no new session (403, with the Hindi message the app shows).
          before: async (session) => {
            const st = await authState(db, session.userId);
            if (st?.status === 'suspended') throw suspendedError(suspendedMessage);
          },
          after: async (session, ctx) => {
            const h = ctx?.request?.headers ?? ctx?.headers;
            try {
              await withUserTx(db, session.userId, 'user', (q) => touchActivity(q, session.userId, parseClientInfo((n) => h?.get(n) ?? undefined), false));
            } catch (e) {
              console.error('touchActivity', e instanceof Error ? e.message : e);
            }
          },
        },
      },
    },
  });
  self.auth = auth as unknown as typeof self.auth;
  return auth;
}

export type Auth = ReturnType<typeof createAuth>;

/** The signed-in user id for a request (cookie or Bearer), or null. */
export async function sessionUserId(auth: Auth, headers: Headers): Promise<string | null> {
  const s = await auth.api.getSession({ headers });
  return s?.user.id ?? null;
}

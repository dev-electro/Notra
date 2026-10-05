import type { SmsProvider } from './auth/sms';
import { Msg91Provider, ConsoleSmsProvider } from './auth/sms';
import type { AdminDeps } from './admin/auth';

/** Worker bindings / environment variables. Secrets are set with `wrangler secret put`, never committed. */
export interface Env {
  DATABASE_URL?: string;
  HYPERDRIVE?: { connectionString: string };
  /** Better Auth signing/encryption secret (>= 32 chars). Rotating it signs everyone out. */
  BETTER_AUTH_SECRET: string;
  /** Public origin of this Worker, e.g. https://api.notra.app (Better Auth's baseURL; cookies and trusted origins derive from it). */
  BETTER_AUTH_URL: string;
  GOOGLE_CLIENT_IDS: string; // comma-separated OAuth client ids: the app's web + android + ios client ids, and the admin panel's web client id
  SMS_PROVIDER?: string; // "msg91" (default) | "dev"
  MSG91_AUTH_KEY?: string;
  MSG91_TEMPLATE_ID?: string;
  /** Reported on the admin health page. */
  ENVIRONMENT?: string;
  /** Cost of one OTP SMS in paise, for the admin cost estimate (default 25). */
  SMS_COST_PAISE?: string;
  /** Exact origin of the admin web app (e.g. https://admin.example.com) when it is served from a different origin than the API. */
  ADMIN_ORIGIN?: string;
  /** Shown on the admin health page (set by the deploy workflow). */
  SERVER_VERSION?: string;
}

export interface Config {
  authSecret: string;
  authUrl: string;
  googleClientIds: string[];
  /** Extra origins Better Auth accepts requests from (the admin panel); the app's own scheme is always trusted. */
  trustedOrigins: string[];
}

export function loadConfig(env: Env): Config {
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) throw new Error('BETTER_AUTH_SECRET must be set (>= 32 chars)');
  if (!env.BETTER_AUTH_URL || !/^https?:\/\//.test(env.BETTER_AUTH_URL)) throw new Error('BETTER_AUTH_URL must be set (https://...)');
  const admin = env.ADMIN_ORIGIN?.trim().replace(/\/+$/, '');
  return {
    authSecret: env.BETTER_AUTH_SECRET,
    authUrl: env.BETTER_AUTH_URL.replace(/\/+$/, ''),
    googleClientIds: (env.GOOGLE_CLIENT_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    trustedOrigins: admin ? [admin] : [],
  };
}

/** Built lazily: a missing MSG91 secret only fails when an OTP is actually sent, so health, config and Google sign-in keep working. */
export function smsFromEnv(env: Env): SmsProvider {
  const make = (): SmsProvider => {
    if (env.SMS_PROVIDER === 'dev') return new ConsoleSmsProvider();
    if (!env.MSG91_AUTH_KEY || !env.MSG91_TEMPLATE_ID) throw new Error('MSG91_AUTH_KEY and MSG91_TEMPLATE_ID are required');
    return new Msg91Provider(env.MSG91_AUTH_KEY, env.MSG91_TEMPLATE_ID);
  };
  return { sendOtp: async (phone, code) => make().sendOtp(phone, code) };
}

export const SERVER_VERSION = '1.0.0';

export function adminFromEnv(env: Env): AdminDeps {
  const cost = Number(env.SMS_COST_PAISE ?? 25);
  return {
    environment: env.ENVIRONMENT,
    smsCostPaise: Number.isFinite(cost) && cost >= 0 ? cost : 25,
    serverVersion: env.SERVER_VERSION ?? SERVER_VERSION,
    allowedOrigin: env.ADMIN_ORIGIN?.trim().replace(/\/+$/, '') || undefined,
  };
}

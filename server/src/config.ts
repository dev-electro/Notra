import type { SmsProvider } from './auth/sms';
import { Msg91Provider, ConsoleSmsProvider } from './auth/sms';

/** Worker bindings / environment variables. Secrets are set with `wrangler secret put`, never committed. */
export interface Env {
  DATABASE_URL?: string;
  HYPERDRIVE?: { connectionString: string };
  JWT_SECRET: string;
  OTP_PEPPER: string;
  GOOGLE_CLIENT_IDS: string; // comma-separated OAuth client ids (web client id used by the app, etc.)
  SMS_PROVIDER?: string; // "msg91" (default) | "dev"
  MSG91_AUTH_KEY?: string;
  MSG91_TEMPLATE_ID?: string;
}

export interface Config {
  jwtSecret: Uint8Array;
  otpPepper: string;
  googleClientIds: string[];
}

export function loadConfig(env: Env): Config {
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be set (>= 32 chars)');
  if (!env.OTP_PEPPER || env.OTP_PEPPER.length < 16) throw new Error('OTP_PEPPER must be set (>= 16 chars)');
  return {
    jwtSecret: new TextEncoder().encode(env.JWT_SECRET),
    otpPepper: env.OTP_PEPPER,
    googleClientIds: (env.GOOGLE_CLIENT_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  };
}

export function smsFromEnv(env: Env): SmsProvider {
  if (env.SMS_PROVIDER === 'dev') return new ConsoleSmsProvider();
  if (!env.MSG91_AUTH_KEY || !env.MSG91_TEMPLATE_ID) throw new Error('MSG91_AUTH_KEY and MSG91_TEMPLATE_ID are required');
  return new Msg91Provider(env.MSG91_AUTH_KEY, env.MSG91_TEMPLATE_ID);
}

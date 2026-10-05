import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { createApp } from '../src/app';
import type { SmsProvider } from '../src/auth/sms';
import type { Config } from '../src/config';
import type { Db } from '../src/db';

export const CLIENT_ID = 'test-client.apps.googleusercontent.com';
type Key = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
const MIGRATIONS = join(import.meta.dirname, '..', 'migrations');

/** In-process Postgres (pglite) with the real migration files applied, behind the same Db interface the Worker uses. */
let shared: PGlite | undefined; // one instance per test file; tables are truncated between tests (boot is slow)
export async function makeDb(): Promise<{ pg: PGlite; db: Db }> {
  let pg = shared;
  if (!pg) {
    pg = shared = new PGlite();
    for (const f of readdirSync(MIGRATIONS).filter((x) => x.endsWith('.sql')).sort()) {
      await pg.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));
    }
  } else {
    await pg.exec('TRUNCATE users, otp_requests, refresh_tokens, households, events, entries CASCADE');
  }
  const conn = pg;
  const db: Db = {
    query: async <T>(text: string, params: unknown[] = []) => (await conn.query(text, params)).rows as T[],
    tx: (fn) =>
      conn.transaction((t) => fn({ query: async <T>(text: string, params: unknown[] = []) => (await t.query(text, params)).rows as T[] })),
  };
  return { pg, db };
}

export class FakeSms implements SmsProvider {
  sent: { phone: string; code: string }[] = [];
  fail = false;
  async sendOtp(phone: string, code: string) {
    if (this.fail) throw new Error('boom');
    this.sent.push({ phone, code });
  }
  last() {
    return this.sent[this.sent.length - 1]!;
  }
}

/** Locally generated Google-style signing key + JWKS; no network. */
let keyPairs: Promise<[Awaited<ReturnType<typeof generateKeyPair>>, Awaited<ReturnType<typeof generateKeyPair>>]> | undefined;
export async function makeGoogle() {
  keyPairs ??= Promise.all([generateKeyPair('RS256'), generateKeyPair('RS256')]);
  const [{ publicKey, privateKey }, other] = await keyPairs;
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  const keys = createLocalJWKSet({ keys: [jwk] });
  const sign = (claims: Record<string, unknown> = {}, o: { iss?: string; aud?: string; exp?: number; key?: Key } = {}) =>
    new SignJWT({ email_verified: true, name: 'Ramesh', ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setSubject((claims.sub as string) ?? 'g-1')
      .setIssuer(o.iss ?? 'https://accounts.google.com')
      .setAudience(o.aud ?? CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime(o.exp ?? '1h')
      .sign(o.key ?? privateKey);
  return { keys, sign, wrongKey: other.privateKey };
}

export async function setup(opts: { now?: () => Date } = {}) {
  const { pg, db } = await makeDb();
  const sms = new FakeSms();
  const google = await makeGoogle();
  const config: Config = {
    jwtSecret: new TextEncoder().encode('x'.repeat(40)),
    otpPepper: 'pepper-pepper-pepper',
    googleClientIds: [CLIENT_ID],
  };
  const app = createApp({ db, config, sms, googleKeys: google.keys, now: opts.now });
  let ipCounter = 0;
  const call = async (method: string, path: string, o: { body?: unknown; token?: string; ip?: string } = {}) => {
    const headers: Record<string, string> = { 'cf-connecting-ip': o.ip ?? `10.0.0.${++ipCounter}` };
    if (o.body !== undefined) headers['content-type'] = 'application/json';
    if (o.token) headers.authorization = `Bearer ${o.token}`;
    const res = await app.request(path, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
    return { status: res.status, json: (await res.json()) as any, headers: res.headers };
  };
  return { pg, db, sms, google, config, app, call };
}
export type Ctx = Awaited<ReturnType<typeof setup>>;

export async function signInWithPhone(t: Ctx, phone = '9876543210') {
  await t.call('POST', '/v1/auth/otp/start', { body: { phone } });
  const r = await t.call('POST', '/v1/auth/otp/verify', { body: { phone, code: t.sms.last().code } });
  if (r.status !== 200) throw new Error(`sign-in failed ${r.status}`);
  return r.json as { accessToken: string; refreshToken: string; user: { id: string } };
}
export async function signInWithGoogle(t: Ctx, sub = 'g-1') {
  const r = await t.call('POST', '/v1/auth/google', { body: { idToken: await t.google.sign({ sub }) } });
  if (r.status !== 200) throw new Error(`google sign-in failed ${r.status}`);
  return r.json as { accessToken: string; refreshToken: string; user: { id: string } };
}

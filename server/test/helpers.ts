import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { createApp, SUSPENDED_MESSAGE_HI } from '../src/app';
import { createAuth } from '../src/auth/better-auth';
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
    const tables = (await pg.query<{ tablename: string }>(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`)).rows;
    await pg.exec(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  }
  return { pg, db: runtimeDb(pg) };
}

/**
 * `pg` (superuser) is for seeding and assertions. The `Db` is what the app gets: EVERY statement runs as the restricted
 * notra_app role inside a transaction, exactly like the production LOGIN role (a member of notra_app, no BYPASSRLS),
 * so Row Level Security applies to all application code under test.
 */
export function runtimeDb(conn: PGlite): Db {
  return {
    query: async <T>(text: string, params: unknown[] = []) =>
      conn.transaction(async (t) => {
        await t.exec('SET LOCAL ROLE notra_app');
        return (await t.query(text, params)).rows as T[];
      }),
    tx: (fn) =>
      conn.transaction(async (t) => {
        await t.exec('SET LOCAL ROLE notra_app');
        return fn({ query: async <T>(text: string, params: unknown[] = []) => (await t.query(text, params)).rows as T[] });
      }),
  };
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
    new SignJWT({ email_verified: true, name: 'Ramesh', email: `${(claims.sub as string) ?? 'g-1'}@example.com`, ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setSubject((claims.sub as string) ?? 'g-1')
      .setIssuer(o.iss ?? 'https://accounts.google.com')
      .setAudience(o.aud ?? CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime(o.exp ?? '1h')
      .sign(o.key ?? privateKey);
  return { keys, sign, wrongKey: other.privateKey };
}

export async function setup(opts: { now?: () => Date; googleClientIds?: string[]; trustedOrigins?: string[] } = {}) {
  const { pg, db } = await makeDb();
  const sms = new FakeSms();
  const google = await makeGoogle();
  const config: Config = {
    authSecret: 'x'.repeat(40),
    authUrl: 'http://localhost:8787',
    googleClientIds: opts.googleClientIds ?? [CLIENT_ID],
    trustedOrigins: opts.trustedOrigins ?? [],
  };
  const auth = createAuth({ db, config, sms, googleKeys: google.keys }, SUSPENDED_MESSAGE_HI);
  const app = createApp({ db, config, sms, googleKeys: google.keys, auth, now: opts.now, admin: { smsCostPaise: 25, serverVersion: 'test', environment: 'test' } });
  let ipCounter = 0;
  const call = async (method: string, path: string, o: { body?: unknown; token?: string; ip?: string; headers?: Record<string, string> } = {}) => {
    const headers: Record<string, string> = { 'cf-connecting-ip': o.ip ?? `10.0.0.${++ipCounter}`, ...o.headers };
    if (o.body !== undefined) headers['content-type'] = 'application/json';
    if (o.token) headers.authorization = `Bearer ${o.token}`;
    const res = await app.request(path, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* csv etc. */ }
    return { status: res.status, json, text, headers: res.headers };
  };
  return { pg, db, sms, google, config, app, auth, call };
}
export type Ctx = Awaited<ReturnType<typeof setup>>;

export interface Signed {
  /** The Better Auth session token (signed), sent as `Authorization: Bearer`. */
  accessToken: string;
  user: { id: string };
}

/** Phone OTP sign-in through Better Auth: send-otp, then verify with the code the fake SMS provider received. */
export async function signInWithPhone(t: Ctx, phone = '9876543210'): Promise<Signed> {
  const sent = await t.call('POST', '/api/auth/phone-number/send-otp', { body: { phoneNumber: phone } });
  if (sent.status !== 200) throw new Error(`send-otp failed ${sent.status} ${sent.text}`);
  const r = await t.call('POST', '/api/auth/phone-number/verify', { body: { phoneNumber: phone, code: t.sms.last().code } });
  if (r.status !== 200) throw new Error(`sign-in failed ${r.status} ${r.text}`);
  return { accessToken: r.headers.get('set-auth-token')!, user: { id: r.json.user.id } };
}

/** Native Google sign-in: the ID token goes to sign-in/social (what the Expo client's signIn.social({ provider, idToken }) sends). */
export async function signInWithGoogle(t: Ctx, sub = 'g-1', claims: Record<string, unknown> = {}): Promise<Signed> {
  const r = await t.call('POST', '/api/auth/sign-in/social', { body: { provider: 'google', idToken: { token: await t.google.sign({ sub, email: `${sub}@example.com`, ...claims }) } } });
  if (r.status !== 200) throw new Error(`google sign-in failed ${r.status} ${r.text}`);
  return { accessToken: r.headers.get('set-auth-token')!, user: { id: r.json.user.id } };
}

export type Role = 'viewer' | 'support' | 'admin' | 'owner';
let phoneCounter = 0;
export const nextPhone = () => `98${String(70000000 + ++phoneCounter).padStart(8, '0')}`;

/** An ordinary account that has been given a staff role directly in the database (as the bootstrap script does). */
export async function makeStaff(t: Ctx, role: Role, phone = nextPhone()) {
  const s = await signInWithPhone(t, phone);
  await t.pg.query(
    `INSERT INTO profiles (user_id, updated_at, server_seq, role) VALUES ($1, '1970-01-01T00:00:00.000Z', 0, $2)
     ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role`,
    [s.user.id, role],
  );
  return { ...s, phone, role };
}

export const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const STAMP = (s: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, s)).toISOString();
export const SENTINELS = ['SENTINEL_HEAD', 'SENTINEL_FATHER', 'SENTINEL_VILLAGE', 'SENTINEL_FALA', 'SENTINEL_ITEM', '6000000001', '987654321'];

/**
 * Push one household, one event and two entries that carry recognisable sentinel values.
 * Stage 7 rule: receiving (AAYA) happens at my own event, giving (GAYA) at another family's program,
 * so the GAYA entry goes to a second program hosted by another household (uid(base + 4) / uid(base + 5)).
 */
export async function seedLedger(t: Ctx, token: string, base = 1, createdAt = STAMP(0), occasion = 'SHAADI') {
  const r = await t.call('POST', '/v1/sync/push', {
    token,
    body: {
      households: [
        { id: uid(base), headName: 'SENTINEL_HEAD', fatherName: 'SENTINEL_FATHER', jati: 'भील', atak: 'डामोर', village: 'SENTINEL_VILLAGE', fala: 'SENTINEL_FALA', phone: '6000000001', createdAt, updatedAt: STAMP(1) },
        { id: uid(base + 4), headName: 'SENTINEL_HEAD', fatherName: 'SENTINEL_FATHER', jati: 'भील', atak: 'डामोर', village: 'SENTINEL_VILLAGE', fala: 'SENTINEL_FALA', phone: null, createdAt, updatedAt: STAMP(1) },
      ],
      events: [
        { id: uid(base + 1), hostHouseholdId: uid(base), occasion, date: '2026-11-21', panchApproved: true, invitationType: 'KUMKUM', status: 'PLANNED', createdAt, updatedAt: STAMP(1) },
        { id: uid(base + 5), hostHouseholdId: uid(base + 4), occasion, date: '2026-12-05', panchApproved: false, invitationType: 'CARD', status: 'HELD', createdAt, updatedAt: STAMP(1) },
      ],
      entries: [
        { id: uid(base + 2), eventId: uid(base + 1), otherHouseholdId: uid(base), direction: 'AAYA', cashPaise: 987654321, inKindItem: 'SENTINEL_ITEM', inKindValuePaise: 0, paymentMode: 'CASH', recordedBy: 'me', createdAt, correctsEntryId: null, isVoid: false },
        { id: uid(base + 3), eventId: uid(base + 5), otherHouseholdId: uid(base + 4), direction: 'GAYA', cashPaise: 5100, inKindItem: null, inKindValuePaise: 0, paymentMode: 'UPI', recordedBy: 'me', createdAt, correctsEntryId: null, isVoid: false },
      ],
      profile: { myHouseholdId: uid(base), increment: { type: 'FIXED', rupees: 51 }, updatedAt: STAMP(2) },
    },
  });
  if (r.status !== 200 || r.json.rejected.length) throw new Error(`seed failed ${r.status} ${r.text}`);
}

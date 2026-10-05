import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { it, expect } from 'vitest';

// Exercises the production code path: the real `postgres` (porsager) driver over the wire protocol, via pglite-socket.
const MIG = join(import.meta.dirname, '..', 'migrations');
const PORT = 54000 + Math.floor(Math.random() * 900);
import { fromPostgres } from '../src/db';
import { createApp } from '../src/app';
import { FakeSms, makeGoogle } from './helpers';

it('the postgres driver adapter: sign-in, push, pull, refresh rotation', async () => {
  const pg = new PGlite();
  for (const f of readdirSync(MIG).sort()) await pg.exec(readFileSync(MIG + '/' + f, 'utf8'));
  const server = new PGLiteSocketServer({ db: pg, port: PORT, host: '127.0.0.1' });
  await server.start();
  const sql = postgres(`postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`, { max: 1, prepare: false, fetch_types: false });
  const sms = new FakeSms();
  const g = await makeGoogle();
  const app = createApp({ db: fromPostgres(sql), sms, googleKeys: g.keys, config: { jwtSecret: new TextEncoder().encode('x'.repeat(40)), otpPepper: 'p'.repeat(20), googleClientIds: ['test-client.apps.googleusercontent.com'] } });
  const call = async (m: string, p: string, body?: any, token?: string) => { const r = await app.request(p, { method: m, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { s: r.status, j: await r.json() as any }; };
  expect((await call('POST', '/v1/auth/otp/start', { phone: '9876543210' })).s).toBe(200);
  const v = await call('POST', '/v1/auth/otp/verify', { phone: '9876543210', code: sms.last().code });
  expect(v.s).toBe(200);
  const id = '00000000-0000-4000-8000-000000000001';
  const T = '2026-01-01T00:00:00.000Z';
  const p = await call('POST', '/v1/sync/push', { households: [{ id, headName: 'a', fatherName: 'b', jati: 'c', atak: 'd', village: 'e', fala: 'f', phone: null, createdAt: T, updatedAt: T }], entries: [{ id: id.replace(/1$/, '2'), eventId: null, otherHouseholdId: id, direction: 'AAYA', cashPaise: 100, inKindItem: null, inKindValuePaise: 0, paymentMode: 'CASH', recordedBy: 'x', createdAt: T, correctsEntryId: null, isVoid: false }] }, v.j.accessToken);
  expect(p.j.accepted).toEqual({ ledgers: 0, households: 1, events: 0, entries: 1, profile: 0 });
  expect(p.j.rejected).toEqual([]);
  const pl = await call('GET', '/v1/sync/pull?since=0', undefined, v.j.accessToken);
  expect(pl.j.entries[0].cashPaise).toBe(100);
  // profile (jsonb) through the real driver, and account deletion + the stale-token mapping (FK violation code 23503 -> 401)
  const prof = { myHouseholdId: id, increment: { type: 'PERCENT', pct: 10 }, updatedAt: T };
  expect((await call('POST', '/v1/sync/push', { profile: prof }, v.j.accessToken)).j.accepted.profile).toBe(1);
  expect((await call('GET', '/v1/sync/pull?since=0', undefined, v.j.accessToken)).j.profile).toEqual(prof);
  const r1 = await call('POST', '/v1/auth/refresh', { refreshToken: v.j.refreshToken });
  expect(r1.s).toBe(200);
  expect((await call('POST', '/v1/auth/refresh', { refreshToken: v.j.refreshToken })).s).toBe(401);
  expect((await call('DELETE', '/v1/account', undefined, v.j.accessToken)).s).toBe(200);
  expect((await sql`SELECT (SELECT count(*) FROM users)::int AS u, (SELECT count(*) FROM households)::int AS h, (SELECT count(*) FROM profiles)::int AS p, (SELECT count(*) FROM otp_requests)::int AS o`)[0]).toEqual({ u: 0, h: 0, p: 0, o: 0 });
  expect((await call('POST', '/v1/sync/push', { households: [{ id, headName: 'a', fatherName: 'b', jati: 'c', atak: 'd', village: 'e', fala: 'f', phone: null, createdAt: T, updatedAt: T }] }, v.j.accessToken)).s).toBe(401);
  await sql.end(); await server.stop();
}, 60000);

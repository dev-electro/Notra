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
  // Run as the restricted runtime role (what a LOGIN role that is a member of notra_app gets in production): Row Level Security applies.
  await sql.unsafe('SET ROLE notra_app');
  const sms = new FakeSms();
  const g = await makeGoogle();
  const app = createApp({ db: fromPostgres(sql), sms, googleKeys: g.keys, config: { jwtSecret: new TextEncoder().encode('x'.repeat(40)), otpPepper: 'p'.repeat(20), googleClientIds: ['test-client.apps.googleusercontent.com'] } });
  const call = async (m: string, p: string, body?: any, token?: string) => { const r = await app.request(p, { method: m, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { s: r.status, j: await r.json() as any }; };
  expect((await call('POST', '/v1/auth/otp/start', { phone: '9876543210' })).s).toBe(200);
  const v = await call('POST', '/v1/auth/otp/verify', { phone: '9876543210', code: sms.last().code });
  expect(v.s).toBe(200);
  const id = '00000000-0000-4000-8000-000000000001';
  const T = '2026-01-01T00:00:00.000Z';
  const p = await call('POST', '/v1/sync/push', { households: [{ id, headName: 'a', fatherName: 'b', jati: 'c', atak: 'd', village: 'e', fala: 'f', phone: null, createdAt: T, updatedAt: T }], entries: [{ id: id.replace(/1$/, '2'), eventId: id.replace(/1$/, '3'), otherHouseholdId: id, direction: 'AAYA', cashPaise: 100, inKindItem: null, inKindValuePaise: 0, paymentMode: 'CASH', recordedBy: 'x', createdAt: T, correctsEntryId: null, isVoid: false }] }, v.j.accessToken);
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
  await pg.exec('RESET ROLE');
  expect((await sql`SELECT (SELECT count(*) FROM users)::int AS u, (SELECT count(*) FROM households)::int AS h, (SELECT count(*) FROM profiles)::int AS p, (SELECT count(*) FROM otp_requests)::int AS o`)[0]).toEqual({ u: 0, h: 0, p: 0, o: 0 });
  expect((await call('POST', '/v1/sync/push', { households: [{ id, headName: 'a', fatherName: 'b', jati: 'c', atak: 'd', village: 'e', fala: 'f', phone: null, createdAt: T, updatedAt: T }] }, v.j.accessToken)).s).toBe(401);
  await sql.end(); await server.stop();
}, 60000);

it('the admin API through the real postgres driver as the restricted role (bigint/jsonb/definer functions)', async () => {
  const pg = new PGlite();
  for (const f of readdirSync(MIG).sort()) await pg.exec(readFileSync(MIG + '/' + f, 'utf8'));
  const server = new PGLiteSocketServer({ db: pg, port: PORT + 1, host: '127.0.0.1' });
  await server.start();
  const sql = postgres(`postgres://postgres:postgres@127.0.0.1:${PORT + 1}/postgres`, { max: 1, prepare: false, fetch_types: false });
  const sms = new FakeSms();
  const g = await makeGoogle();
  const app = createApp({
    db: fromPostgres(sql), sms, googleKeys: g.keys, admin: { smsCostPaise: 25, serverVersion: 'drv' },
    config: { jwtSecret: new TextEncoder().encode('x'.repeat(40)), otpPepper: 'p'.repeat(20), googleClientIds: ['test-client.apps.googleusercontent.com'] },
  });
  const call = async (m: string, p: string, body?: any, token?: string) => { const r = await app.request(p, { method: m, headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.1.1.1', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { s: r.status, j: await r.json().catch(() => null) as any }; };
  await call('POST', '/v1/auth/otp/start', { phone: '9876543210' });
  const v = await call('POST', '/v1/auth/otp/verify', { phone: '9876543210', code: sms.last().code });
  await sql`INSERT INTO profiles (user_id, updated_at, server_seq, role) VALUES (${v.j.user.id}, '1970-01-01T00:00:00.000Z', 0, 'owner')`;
  await sql.unsafe('SET ROLE notra_app');
  const tok = v.j.accessToken;
  expect((await call('GET', '/admin/api/me', undefined, tok)).j.role).toBe('owner');
  expect((await call('GET', '/admin/api/users?q=3210', undefined, tok)).j.total).toBe(1);
  expect((await call('GET', '/admin/api/users/' + v.j.user.id, undefined, tok)).j.counts.households).toBe(0);
  for (const r of ['overview', 'health', 'reports/events-monthly', 'reports/retention', 'reports/regions', 'reports/versions', 'reports/amounts', 'config', 'staff', 'audit', 'abuse/otp', 'tickets', 'errors']) {
    const res = await call('GET', '/admin/api/' + r, undefined, tok);
    expect(res.s, r).toBe(200);
  }
  const put = await call('PUT', '/admin/api/config/features', { value: { ocr: true }, reason: 'driver test' }, tok);
  expect(put.s).toBe(200);
  expect((await call('GET', '/v1/config')).j.features.ocr).toBe(true);
  expect((await call('POST', '/admin/api/users/' + v.j.user.id + '/unmask', { field: 'phone', reason: 'driver test' }, tok)).j.value).toBe('+919876543210');
  expect((await call('PATCH', '/admin/api/staff/' + v.j.user.id, { role: 'admin', reason: 'sole owner' }, tok)).s).toBe(409);
  await sql.end(); await server.stop();
}, 60000);

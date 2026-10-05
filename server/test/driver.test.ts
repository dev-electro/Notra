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
  expect(p.j.accepted).toEqual({ households: 1, events: 0, entries: 1 });
  const pl = await call('GET', '/v1/sync/pull?since=0', undefined, v.j.accessToken);
  expect(pl.j.entries[0].cashPaise).toBe(100);
  const r1 = await call('POST', '/v1/auth/refresh', { refreshToken: v.j.refreshToken });
  expect(r1.s).toBe(200);
  expect((await call('POST', '/v1/auth/refresh', { refreshToken: v.j.refreshToken })).s).toBe(401);
  await sql.end(); await server.stop();
}, 60000);

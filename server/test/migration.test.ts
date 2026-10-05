import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp, SUSPENDED_MESSAGE_HI } from '../src/app';
import { createAuth } from '../src/auth/better-auth';
import { FakeSms, makeGoogle, runtimeDb, setup } from './helpers';

const MIGRATIONS = join(import.meta.dirname, '..', 'migrations');
const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();

describe('migration 103 (Better Auth) on a database that already has users', () => {
  it('carries identities over to the SAME user ids, drops the old auth tables, and sign-in lands on the old user', async () => {
    const pg = new PGlite();
    for (const f of files.filter((x) => x < '103')) await pg.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));
    const G = '11111111-1111-4111-8111-111111111111';
    const P = '22222222-2222-4222-8222-222222222222';
    const B = '33333333-3333-4333-8333-333333333333';
    await pg.exec(`
      INSERT INTO users (id, google_sub, display_name, email, signup_method) VALUES ('${G}', 'old-g', 'Old Google', 'old@example.com', 'google');
      INSERT INTO users (id, phone_e164, signup_method) VALUES ('${P}', '+919876543210', 'phone');
      INSERT INTO users (id, google_sub, phone_e164, display_name, email, signup_method) VALUES ('${B}', 'old-both', '+919123456780', 'Both', 'both@example.com', 'google');
      INSERT INTO profiles (user_id, updated_at, server_seq, role) VALUES ('${P}', '1970-01-01T00:00:00.000Z', 0, 'owner');
      INSERT INTO refresh_tokens (id, user_id, family_id, token_hash, expires_at) VALUES (gen_random_uuid(), '${G}', gen_random_uuid(), 'h', now() + interval '1 day');
      INSERT INTO otp_requests (id, phone_e164, code_hash, expires_at, ip) VALUES (gen_random_uuid(), '+919876543210', 'h', now() + interval '1 minute', '1.1.1.1');
    `);
    for (const f of files.filter((x) => x >= '103')) await pg.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));

    const users = (await pg.query<Record<string, unknown>>('SELECT id, google_sub, phone_e164, phone_verified, email_verified, email, signup_method FROM users ORDER BY id')).rows;
    expect(users).toEqual([
      { id: G, google_sub: 'old-g', phone_e164: null, phone_verified: false, email_verified: true, email: 'old@example.com', signup_method: 'google' },
      { id: P, google_sub: null, phone_e164: '+919876543210', phone_verified: true, email_verified: false, email: 'p919876543210@phone.notra.invalid', signup_method: 'phone' },
      { id: B, google_sub: 'old-both', phone_e164: '+919123456780', phone_verified: true, email_verified: true, email: 'both@example.com', signup_method: 'google' },
    ]);
    expect((await pg.query('SELECT user_id, provider_id, account_id FROM auth_accounts ORDER BY user_id')).rows).toEqual([
      { user_id: G, provider_id: 'google', account_id: 'old-g' }, { user_id: B, provider_id: 'google', account_id: 'old-both' },
    ]);
    expect((await pg.query(`SELECT to_regclass('refresh_tokens') AS a, to_regclass('otp_requests') AS b`)).rows).toEqual([{ a: null, b: null }]);
    expect((await pg.query(`SELECT role FROM profiles WHERE user_id = '${P}'`)).rows).toEqual([{ role: 'owner' }]);

    // the real flows reach the pre-existing users
    const sms = new FakeSms();
    const google = await makeGoogle();
    const db = runtimeDb(pg);
    const config = { authSecret: 'x'.repeat(40), authUrl: 'http://localhost:8787', googleClientIds: ['test-client.apps.googleusercontent.com'], trustedOrigins: [] };
    const auth = createAuth({ db, config, sms, googleKeys: google.keys }, SUSPENDED_MESSAGE_HI);
    const app = createApp({ db, config, sms, googleKeys: google.keys, auth, admin: { smsCostPaise: 25, serverVersion: 't' } });
    const post = (path: string, body: unknown) => app.request(path, { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '5.5.5.5' }, body: JSON.stringify(body) });

    const gs = await post('/api/auth/sign-in/social', { provider: 'google', idToken: { token: await google.sign({ sub: 'old-g', email: 'old@example.com' }) } });
    expect(((await gs.json()) as { user: { id: string } }).user.id).toBe(G);
    await post('/api/auth/phone-number/send-otp', { phoneNumber: '9876543210' });
    const pv = await post('/api/auth/phone-number/verify', { phoneNumber: '9876543210', code: sms.last().code });
    expect(((await pv.json()) as { user: { id: string } }).user.id).toBe(P);
    // the staff role survived: the migrated owner can open the admin API
    const me = await app.request('/admin/api/me', { headers: { authorization: `Bearer ${pv.headers.get('set-auth-token')}`, 'cf-connecting-ip': '5.5.5.5' } });
    expect(((await me.json()) as { role: string }).role).toBe('owner');
    expect((await pg.query('SELECT count(*)::int AS n FROM users')).rows).toEqual([{ n: 3 }]); // nobody was duplicated
  });
});

describe('Better Auth schema', () => {
  it('every field Better Auth reads or writes exists as a column (guards against a library upgrade drifting from migration 103)', async () => {
    const t = await setup();
    const ctx = (await t.auth.$context) as unknown as { tables: Record<string, { modelName: string; fields: Record<string, { fieldName?: string }> }> };
    const cols = (await t.pg.query<{ t: string; c: string }>(
      `SELECT table_name AS t, column_name AS c FROM information_schema.columns WHERE table_schema = 'public'`)).rows;
    const have = new Set(cols.map((r) => `${r.t}.${r.c}`));
    const missing: string[] = [];
    for (const [key, model] of Object.entries(ctx.tables)) {
      for (const [name, f] of Object.entries(model.fields)) {
        const col = f.fieldName ?? name;
        if (!have.has(`${model.modelName}.${col}`)) missing.push(`${key}: ${model.modelName}.${col}`);
      }
      if (!have.has(`${model.modelName}.id`)) missing.push(`${key}: ${model.modelName}.id`);
    }
    expect(missing).toEqual([]);
  });
});

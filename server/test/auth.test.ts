import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { CLIENT_ID, setup, signInWithGoogle, signInWithPhone } from './helpers';

type T = Awaited<ReturnType<typeof setup>>;
const social = (t: T, idToken: unknown, extra: Record<string, unknown> = {}) =>
  t.call('POST', '/api/auth/sign-in/social', { body: { provider: 'google', idToken: { token: idToken }, ...extra } });
const link = (t: T, token: string, idToken: string) => t.call('POST', '/api/auth/link-social', { token, body: { provider: 'google', idToken: { token: idToken } } });
const me = async (t: T, token: string) => (await t.call('GET', '/v1/me', { token })).json.user;

describe('google sign-in (native idToken -> signIn.social)', () => {
  it('verifies the token against an injected JWKS and finds-or-creates by sub', async () => {
    const t = await setup();
    const a = await signInWithGoogle(t, 'g-1');
    const b = await signInWithGoogle(t, 'g-1');
    expect(b.user.id).toBe(a.user.id);
    expect((await signInWithGoogle(t, 'g-2')).user.id).not.toBe(a.user.id);
    expect(await me(t, a.accessToken)).toMatchObject({ id: a.user.id, displayName: 'Ramesh', hasGoogle: true, hasPhone: false, phone: null });
    const [u] = (await t.pg.query<{ google_sub: string; signup_method: string; email: string; email_verified: boolean }>(
      `SELECT google_sub, signup_method, email, email_verified FROM users WHERE id = $1`, [a.user.id])).rows;
    expect(u).toEqual({ google_sub: 'g-1', signup_method: 'google', email: 'g-1@example.com', email_verified: true });
  });

  it('accepts any of the configured client ids (web / android / ios) and nothing else', async () => {
    const t = await setup({ googleClientIds: ['web.apps.googleusercontent.com', CLIENT_ID] });
    expect((await social(t, await t.google.sign({ sub: 'a' }, { aud: CLIENT_ID }))).status).toBe(200);
    expect((await social(t, await t.google.sign({ sub: 'b' }, { aud: 'web.apps.googleusercontent.com' }))).status).toBe(200);
    expect((await social(t, await t.google.sign({ sub: 'c' }, { aud: 'other.apps.googleusercontent.com' }))).status).toBe(401);
  });

  it('rejects wrong audience, issuer, signature, expiry, unverified email and garbage', async () => {
    const t = await setup();
    const g = t.google;
    const bad = [
      await g.sign({}, { aud: 'someone-else' }),
      await g.sign({}, { iss: 'https://evil.example' }),
      await g.sign({}, { key: g.wrongKey }),
      await g.sign({}, { exp: Math.floor(Date.now() / 1000) - 3600 }),
      await g.sign({ email_verified: false }),
      'not-a-jwt-not-a-jwt-not-a-jwt',
    ];
    for (const idToken of bad) {
      const r = await social(t, idToken);
      expect(r.status).toBe(401);
      expect(r.json.error).toBe('invalid_google_token');
    }
    expect((await t.pg.query('SELECT 1 FROM users')).rows).toHaveLength(0);
    expect((await social(t, await g.sign({}, { iss: 'accounts.google.com' }))).status).toBe(200);
  });

  it('refuses unsigned (alg none) and HS256 tokens', async () => {
    const t = await setup();
    const hs = await new SignJWT({ email_verified: true, email: 'x@example.com' }).setProtectedHeader({ alg: 'HS256', kid: 'k1' }).setSubject('x').setIssuer('https://accounts.google.com').setAudience(CLIENT_ID).setExpirationTime('1h').sign(new Uint8Array(32));
    expect((await social(t, hs)).status).toBe(401);
    const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: 'x', iss: 'https://accounts.google.com', aud: CLIENT_ID, exp: 9999999999, email: 'x@example.com', email_verified: true })).toString('base64url')}.`;
    expect((await social(t, none)).status).toBe(401);
  });

  it('only the native ID-token flow exists: no redirect flow, no password routes', async () => {
    const t = await setup();
    expect((await t.call('POST', '/api/auth/sign-in/social', { body: { provider: 'google' } })).status).toBe(400);
    expect((await t.call('POST', '/api/auth/sign-in/email', { body: { email: 'a@b.co', password: 'password123' } })).status).toBe(404);
    expect((await t.call('POST', '/api/auth/sign-up/email', { body: { email: 'a@b.co', password: 'password123', name: 'x' } })).status).toBe(404);
    expect((await t.call('POST', '/api/auth/phone-number/reset-password', { body: { phoneNumber: '+919876543210', otp: '123456', newPassword: 'password123' } })).status).toBe(404);
  });

  it("never stores Google's tokens", async () => {
    const t = await setup();
    await signInWithGoogle(t, 'g-1');
    const [a] = (await t.pg.query<Record<string, unknown>>('SELECT provider_id, account_id, id_token, access_token, refresh_token FROM auth_accounts')).rows;
    expect(a).toEqual({ provider_id: 'google', account_id: 'g-1', id_token: null, access_token: null, refresh_token: null });
  });

  it('an existing Google user signing in from a second device gets a second session on the same user', async () => {
    const t = await setup();
    const a = await signInWithGoogle(t, 'g-1');
    const b = await signInWithGoogle(t, 'g-1');
    expect(a.accessToken).not.toBe(b.accessToken);
    expect((await t.pg.query('SELECT 1 FROM auth_sessions WHERE user_id = $1', [a.user.id])).rows).toHaveLength(2);
    expect((await t.call('GET', '/v1/sync/pull', { token: a.accessToken })).status).toBe(200);
    expect((await t.call('GET', '/v1/sync/pull', { token: b.accessToken })).status).toBe(200);
  });
});

describe('sessions', () => {
  it('guards sync endpoints', async () => {
    const t = await setup();
    expect((await t.call('GET', '/v1/sync/pull')).status).toBe(401);
    expect((await t.call('GET', '/v1/sync/pull', { token: 'garbage' })).status).toBe(401);
    expect((await t.call('POST', '/v1/sync/push', { body: {} })).status).toBe(401);
    const s = await signInWithPhone(t);
    expect((await t.call('GET', '/v1/sync/pull', { token: s.accessToken })).status).toBe(200);
  });

  it('rejects a forged or tampered session token', async () => {
    const t = await setup();
    const s = await signInWithPhone(t);
    const [raw] = s.accessToken.split('.');
    expect((await t.call('GET', '/v1/sync/pull', { token: `${raw}.AAAA` })).status).toBe(401);
    expect((await t.call('GET', '/v1/sync/pull', { token: `${raw!.slice(0, -1)}x.${s.accessToken.split('.')[1]}` })).status).toBe(401);
    const forged = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(s.user.id).setExpirationTime('1h').sign(new TextEncoder().encode('y'.repeat(40)));
    expect((await t.call('GET', '/v1/sync/pull', { token: forged })).status).toBe(401);
  });

  it('the session cookie works too (what the admin web app and a browser send)', async () => {
    const t = await setup();
    const s = await signInWithPhone(t);
    const cookie = `notra.session_token=${encodeURIComponent(s.accessToken)}`;
    const r = await t.call('GET', '/v1/me', { headers: { cookie } });
    expect(r.status).toBe(200);
    expect(r.json.user.id).toBe(s.user.id);
  });

  it('expires: an expired session is signed out (401) and is not revived', async () => {
    const t = await setup();
    const s = await signInWithPhone(t);
    expect((await t.call('GET', '/v1/sync/pull', { token: s.accessToken })).status).toBe(200);
    // the session is valid for 60 days
    const [row] = (await t.pg.query<{ days: number }>(`SELECT round(extract(epoch FROM expires_at - now()) / 86400)::int AS days FROM auth_sessions`)).rows;
    expect(row!.days).toBe(60);
    await t.pg.query(`UPDATE auth_sessions SET expires_at = now() - interval '1 second'`);
    expect((await t.call('GET', '/v1/sync/pull', { token: s.accessToken })).status).toBe(401);
    expect((await t.call('GET', '/v1/me', { token: s.accessToken })).status).toBe(401);
  });

  it('sign-out revokes that session only', async () => {
    const t = await setup();
    const a = await signInWithGoogle(t, 'g-1');
    const b = await signInWithGoogle(t, 'g-1');
    const out = await t.call('POST', '/api/auth/sign-out', { token: a.accessToken, body: {} });
    expect(out.status).toBe(200);
    expect((await t.call('GET', '/v1/sync/pull', { token: a.accessToken })).status).toBe(401);
    expect((await t.call('GET', '/v1/sync/pull', { token: b.accessToken })).status).toBe(200);
    expect((await t.pg.query('SELECT 1 FROM auth_sessions')).rows).toHaveLength(1);
  });

  it('records the device on sign-in (version, platform) for the admin panel', async () => {
    const t = await setup();
    await t.call('POST', '/api/auth/phone-number/send-otp', { body: { phoneNumber: '9876543210' }, headers: { 'x-app-version': '1.4.0', 'x-platform': 'android' } });
    const r = await t.call('POST', '/api/auth/phone-number/verify', { body: { phoneNumber: '9876543210', code: t.sms.last().code }, headers: { 'x-app-version': '1.4.0', 'x-platform': 'android' } });
    expect(r.status).toBe(200);
    expect((await t.pg.query('SELECT platform, app_version FROM user_devices')).rows).toEqual([{ platform: 'android', app_version: '1.4.0' }]);
  });

  it('CSRF: a cookie-authenticated POST from an untrusted origin is refused; the app scheme and the admin origin are trusted', async () => {
    const t = await setup({ trustedOrigins: ['https://admin.example.com'] });
    const s = await signInWithPhone(t);
    const cookie = `notra.session_token=${encodeURIComponent(s.accessToken)}`;
    const post = (origin: string) => t.call('POST', '/api/auth/sign-out', { headers: { cookie, origin }, body: {} });
    expect((await post('https://evil.example')).status).toBe(403);
    expect((await post('https://admin.example.com')).status).toBe(200);
    const s2 = await signInWithPhone(t, '9123456780');
    // the Expo client sends `expo-origin: notradiary://` and no Origin
    const native = await t.call('POST', '/api/auth/sign-out', { headers: { cookie: `notra.session_token=${encodeURIComponent(s2.accessToken)}`, 'expo-origin': 'notradiary://' }, body: {} });
    expect(native.status).toBe(200);
  });
});

describe('linking Google <-> phone on one account', () => {
  it('a Google user adds a phone number; signing in by phone then reaches the same user', async () => {
    const t = await setup();
    const g = await signInWithGoogle(t, 'g-1');
    await t.call('POST', '/api/auth/phone-number/send-otp', { body: { phoneNumber: '9876543210' } });
    const r = await t.call('POST', '/api/auth/phone-number/verify', { token: g.accessToken, body: { phoneNumber: '9876543210', code: t.sms.last().code, updatePhoneNumber: true } });
    expect(r.status).toBe(200);
    expect(await me(t, g.accessToken)).toMatchObject({ id: g.user.id, hasGoogle: true, hasPhone: true, phone: '+919876543210' });
    await t.pg.query(`UPDATE otp_events SET at = at - interval '1 hour'`);
    expect((await signInWithPhone(t)).user.id).toBe(g.user.id);
  });

  it('a phone user adds Google (idempotently), sees the real e-mail, and Google sign-in reaches the same user', async () => {
    const t = await setup();
    const p = await signInWithPhone(t);
    const idToken = await t.google.sign({ sub: 'g-9', email: 'Real@Example.com' });
    expect((await link(t, p.accessToken, idToken)).status).toBe(200);
    expect((await link(t, p.accessToken, idToken)).status).toBe(200);
    expect(await me(t, p.accessToken)).toMatchObject({ hasGoogle: true, hasPhone: true });
    expect((await signInWithGoogle(t, 'g-9')).user.id).toBe(p.user.id);
    const [u] = (await t.pg.query<{ email: string; google_sub: string; display_name: string }>('SELECT email, google_sub, display_name FROM users WHERE id = $1', [p.user.id])).rows;
    expect(u).toEqual({ email: 'real@example.com', google_sub: 'g-9', display_name: 'Ramesh' });
    expect((await t.pg.query('SELECT 1 FROM auth_accounts WHERE user_id = $1', [p.user.id])).rows).toHaveLength(1);
  });

  it('refuses identities owned by another user, or a second identity of the same kind', async () => {
    const t = await setup();
    const p = await signInWithPhone(t);
    const g = await signInWithGoogle(t, 'g-1');
    // google g-1 belongs to g.user, not p.user
    const r = await link(t, p.accessToken, await t.google.sign({ sub: 'g-1' }));
    expect(r.status).toBe(409);
    expect(r.json.error).toBe('identity_belongs_to_another_user');
    // p has no Google yet: g-2 links; a different Google again is refused
    expect((await link(t, p.accessToken, await t.google.sign({ sub: 'g-2' }))).status).toBe(200);
    const again = await link(t, p.accessToken, await t.google.sign({ sub: 'g-3' }));
    expect(again.status).toBe(409);
    expect(again.json.error).toBe('already_linked_to_different_identity');
    // the phone of another user
    await t.pg.query(`UPDATE otp_events SET at = at - interval '1 hour'`);
    await t.call('POST', '/api/auth/phone-number/send-otp', { body: { phoneNumber: '9876543210' } });
    const ph = await t.call('POST', '/api/auth/phone-number/verify', { token: g.accessToken, body: { phoneNumber: '9876543210', code: t.sms.last().code, updatePhoneNumber: true } });
    expect(ph.status).toBe(409);
    expect(ph.json.error).toBe('identity_belongs_to_another_user');
    // a second, different phone on an account that has one
    await t.pg.query(`UPDATE otp_events SET at = at - interval '1 hour'`);
    await t.call('POST', '/api/auth/phone-number/send-otp', { body: { phoneNumber: '9123456780' } });
    const second = await t.call('POST', '/api/auth/phone-number/verify', { token: p.accessToken, body: { phoneNumber: '9123456780', code: t.sms.last().code, updatePhoneNumber: true } });
    expect(second.status).toBe(409);
    expect(second.json.error).toBe('already_linked_to_different_identity');
  });

  it('requires a signed-in user, and a valid Google token', async () => {
    const t = await setup();
    expect((await t.call('POST', '/api/auth/link-social', { body: { provider: 'google', idToken: { token: await t.google.sign() } } })).status).toBe(401);
    await t.call('POST', '/api/auth/phone-number/send-otp', { body: { phoneNumber: '9876543210' } });
    const r = await t.call('POST', '/api/auth/phone-number/verify', { body: { phoneNumber: '9876543210', code: t.sms.last().code, updatePhoneNumber: true } });
    expect(r.status).toBe(401);
    const p = await signInWithPhone(t, '9123456780');
    const bad = await link(t, p.accessToken, await t.google.sign({}, { key: t.google.wrongKey }));
    expect(bad.status).toBe(401);
  });

  it('a Google sign-in whose e-mail already belongs to a Google user lands on that user (no duplicate account)', async () => {
    const t = await setup();
    const a = await signInWithGoogle(t, 'g-1', { email: 'same@example.com' });
    const b = await signInWithGoogle(t, 'g-1b', { email: 'same@example.com' });
    expect(b.user.id).toBe(a.user.id);
    expect((await t.pg.query('SELECT 1 FROM users')).rows).toHaveLength(1);
  });
});

describe('the auth tables are closed outside the auth context (RLS)', () => {
  it('app code that acts as a user cannot read sessions, accounts, OTPs or rate limits of anyone', async () => {
    const t = await setup();
    const a = await signInWithGoogle(t, 'g-1');
    await signInWithPhone(t);
    for (const table of ['auth_verifications', 'auth_rate_limits']) {
      expect(await t.db.tx(async (q) => q.query(`SELECT 1 FROM ${table}`))).toEqual([]);
    }
    // as user A: only A's own sessions / accounts are visible, never the phone user's
    const own = await t.db.tx(async (q) => {
      await q.query(`SELECT set_config('app.user_id', $1, true), set_config('app.role', 'user', true)`, [a.user.id]);
      return { s: await q.query('SELECT user_id FROM auth_sessions'), a: await q.query('SELECT user_id FROM auth_accounts') };
    });
    expect(own.s).toEqual([{ user_id: a.user.id }]);
    expect(own.a).toEqual([{ user_id: a.user.id }]);
    // and A cannot set identity / suspension columns of anyone, nor create users outside the auth context
    await expect(t.db.tx(async (q) => {
      await q.query(`SELECT set_config('app.user_id', $1, true)`, [a.user.id]);
      await q.query(`INSERT INTO users (id, phone_e164) VALUES (gen_random_uuid(), '+919000000000')`);
    })).rejects.toThrow();
    await expect(t.db.tx(async (q) => {
      await q.query(`SELECT set_config('app.user_id', $1, true)`, [a.user.id]);
      await q.query(`UPDATE users SET status = 'suspended' WHERE id = $1`, [a.user.id]);
    })).rejects.toThrow();
  });
});

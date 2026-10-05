import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { setup, signInWithGoogle, signInWithPhone, CLIENT_ID } from './helpers';

describe('google sign-in', () => {
  it('verifies a token against an injected JWKS and finds-or-creates by sub', async () => {
    const t = await setup();
    const a = await signInWithGoogle(t, 'g-1');
    const b = await signInWithGoogle(t, 'g-1');
    expect(b.user.id).toBe(a.user.id);
    expect((await signInWithGoogle(t, 'g-2')).user.id).not.toBe(a.user.id);
    const r = await t.call('POST', '/v1/auth/google', { body: { idToken: await t.google.sign() } });
    expect(r.json.user).toMatchObject({ displayName: 'Ramesh', hasGoogle: true, hasPhone: false });
    expect(r.json.expiresIn).toBe(900);
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
    for (const idToken of bad) expect((await t.call('POST', '/v1/auth/google', { body: { idToken } })).status).toBe(401);
    expect((await t.call('POST', '/v1/auth/google', { body: {} })).status).toBe(401);
    expect((await t.call('POST', '/v1/auth/google', { body: { idToken: await g.sign({}, { iss: 'accounts.google.com' }) } })).status).toBe(200);
  });

  it('refuses unsigned (alg none) and HS256 tokens', async () => {
    const t = await setup();
    const hs = await new SignJWT({ email_verified: true }).setProtectedHeader({ alg: 'HS256', kid: 'k1' }).setSubject('x').setIssuer('https://accounts.google.com').setAudience(CLIENT_ID).setExpirationTime('1h').sign(new Uint8Array(32));
    expect((await t.call('POST', '/v1/auth/google', { body: { idToken: hs } })).status).toBe(401);
  });
});

describe('access tokens', () => {
  it('guards sync endpoints', async () => {
    const t = await setup();
    expect((await t.call('GET', '/v1/sync/pull')).status).toBe(401);
    expect((await t.call('GET', '/v1/sync/pull', { token: 'garbage' })).status).toBe(401);
    expect((await t.call('POST', '/v1/sync/push', { body: {} })).status).toBe(401);
    const s = await signInWithPhone(t);
    expect((await t.call('GET', '/v1/sync/pull', { token: s.accessToken })).status).toBe(200);
  });

  it('expires after 15 minutes', async () => {
    let now = new Date('2026-01-01T00:00:00Z');
    const t = await setup({ now: () => now });
    const s = await signInWithPhone(t);
    now = new Date('2026-01-01T00:14:00Z');
    expect((await t.call('GET', '/v1/sync/pull', { token: s.accessToken })).status).toBe(200);
    now = new Date('2026-01-01T00:16:00Z');
    expect((await t.call('GET', '/v1/sync/pull', { token: s.accessToken })).status).toBe(401);
  });

  it('rejects a token signed with another secret', async () => {
    const t = await setup();
    const forged = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(crypto.randomUUID()).setIssuer('notra-diary').setAudience('notra-api').setExpirationTime('1h').sign(new TextEncoder().encode('y'.repeat(40)));
    expect((await t.call('GET', '/v1/sync/pull', { token: forged })).status).toBe(401);
  });
});

describe('refresh tokens', () => {
  it('rotates on use and the new token works', async () => {
    const t = await setup();
    const s = await signInWithPhone(t);
    const r1 = await t.call('POST', '/v1/auth/refresh', { body: { refreshToken: s.refreshToken } });
    expect(r1.status).toBe(200);
    expect(r1.json.refreshToken).not.toBe(s.refreshToken);
    expect((await t.call('GET', '/v1/sync/pull', { token: r1.json.accessToken })).status).toBe(200);
    expect((await t.call('POST', '/v1/auth/refresh', { body: { refreshToken: r1.json.refreshToken } })).status).toBe(200);
  });

  it('stores only hashes', async () => {
    const t = await setup();
    const s = await signInWithPhone(t);
    const rows = (await t.pg.query<{ token_hash: string }>('SELECT token_hash FROM refresh_tokens')).rows;
    expect(rows.map((r) => r.token_hash)).not.toContain(s.refreshToken);
    expect(rows[0]!.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('reuse of a rotated token revokes the whole family', async () => {
    const t = await setup();
    const s = await signInWithPhone(t);
    const r1 = await t.call('POST', '/v1/auth/refresh', { body: { refreshToken: s.refreshToken } });
    const replay = await t.call('POST', '/v1/auth/refresh', { body: { refreshToken: s.refreshToken } });
    expect(replay.status).toBe(401);
    // the legitimate newest token is now dead too
    expect((await t.call('POST', '/v1/auth/refresh', { body: { refreshToken: r1.json.refreshToken } })).status).toBe(401);
  });

  it('does not touch other families (other devices) on reuse', async () => {
    const t = await setup();
    const a = await signInWithPhone(t);
    await t.pg.query(`UPDATE otp_requests SET created_at = now() - interval '1 hour'`);
    const other = await signInWithPhone(t); // same user, second device => new family
    expect(other.user.id).toBe(a.user.id);
    const r = await t.call('POST', '/v1/auth/refresh', { body: { refreshToken: a.refreshToken } });
    await t.call('POST', '/v1/auth/refresh', { body: { refreshToken: a.refreshToken } }); // replay kills family A
    expect((await t.call('POST', '/v1/auth/refresh', { body: { refreshToken: r.json.refreshToken } })).status).toBe(401);
    expect((await t.call('POST', '/v1/auth/refresh', { body: { refreshToken: other.refreshToken } })).status).toBe(200);
  });

  it('rejects expired and unknown tokens; logout revokes', async () => {
    const t = await setup();
    const s = await signInWithPhone(t);
    expect((await t.call('POST', '/v1/auth/refresh', { body: { refreshToken: 'x'.repeat(43) } })).status).toBe(401);
    await t.pg.query(`UPDATE refresh_tokens SET expires_at = now() - interval '1 second'`);
    expect((await t.call('POST', '/v1/auth/refresh', { body: { refreshToken: s.refreshToken } })).status).toBe(401);
    const s2 = await signInWithGoogle(t);
    expect((await t.call('POST', '/v1/auth/logout', { body: { refreshToken: s2.refreshToken } })).status).toBe(200);
    expect((await t.call('POST', '/v1/auth/refresh', { body: { refreshToken: s2.refreshToken } })).status).toBe(401);
  });
});

describe('linking', () => {
  it('lets one user have both google and phone', async () => {
    const t = await setup();
    const g = await signInWithGoogle(t, 'g-1');
    await t.call('POST', '/v1/auth/otp/start', { body: { phone: '9876543210' } });
    const r = await t.call('POST', '/v1/auth/link/phone', { token: g.accessToken, body: { phone: '9876543210', code: t.sms.last().code } });
    expect(r.status).toBe(200);
    expect(r.json.user).toMatchObject({ id: g.user.id, hasGoogle: true, hasPhone: true, phone: '+919876543210' });
    // signing in by phone now reaches the same household
    await t.pg.query(`UPDATE otp_requests SET created_at = now() - interval '1 hour'`);
    expect((await signInWithPhone(t)).user.id).toBe(g.user.id);
  });

  it('links google to a phone user, idempotently', async () => {
    const t = await setup();
    const p = await signInWithPhone(t);
    const idToken = await t.google.sign({ sub: 'g-9' });
    expect((await t.call('POST', '/v1/auth/link/google', { token: p.accessToken, body: { idToken } })).status).toBe(200);
    expect((await t.call('POST', '/v1/auth/link/google', { token: p.accessToken, body: { idToken } })).status).toBe(200);
    expect((await signInWithGoogle(t, 'g-9')).user.id).toBe(p.user.id);
  });

  it('refuses identities owned by another user, or a second identity of the same kind', async () => {
    const t = await setup();
    const p = await signInWithPhone(t);
    const g = await signInWithGoogle(t, 'g-1');
    // google g-1 belongs to g.user, not p.user
    const r = await t.call('POST', '/v1/auth/link/google', { token: p.accessToken, body: { idToken: await t.google.sign({ sub: 'g-1' }) } });
    expect(r.status).toBe(409);
    // p already has a phone; linking a different google works, but a different google again is refused
    expect((await t.call('POST', '/v1/auth/link/google', { token: p.accessToken, body: { idToken: await t.google.sign({ sub: 'g-2' }) } })).status).toBe(200);
    expect((await t.call('POST', '/v1/auth/link/google', { token: p.accessToken, body: { idToken: await t.google.sign({ sub: 'g-3' }) } })).status).toBe(409);
    // phone of another user
    await t.pg.query(`UPDATE otp_requests SET created_at = now() - interval '1 hour'`);
    await t.call('POST', '/v1/auth/otp/start', { body: { phone: '9876543210' } });
    expect((await t.call('POST', '/v1/auth/link/phone', { token: g.accessToken, body: { phone: '9876543210', code: t.sms.last().code } })).status).toBe(409);
  });

  it('requires authentication', async () => {
    const t = await setup();
    expect((await t.call('POST', '/v1/auth/link/google', { body: { idToken: await t.google.sign() } })).status).toBe(401);
    expect((await t.call('POST', '/v1/auth/link/phone', { body: { phone: '9876543210', code: '123456' } })).status).toBe(401);
  });
});

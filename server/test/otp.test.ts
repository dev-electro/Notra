import { describe, expect, it } from 'vitest';
import { normalizeIndianMobile } from '../src/auth/phone';
import { Msg91Provider } from '../src/auth/sms';
import { randomCode6 } from '../src/crypto';
import { setup } from './helpers';

type T = Awaited<ReturnType<typeof setup>>;
const start = (t: T, phone = '9876543210', ip?: string) => t.call('POST', '/api/auth/phone-number/send-otp', { body: { phoneNumber: phone }, ip });
const verify = (t: T, code: string, phone = '9876543210', ip?: string) => t.call('POST', '/api/auth/phone-number/verify', { body: { phoneNumber: phone, code }, ip });
/** Make the OTP requests already sent look older (the limits count otp_events). */
const age = (t: T, interval: string) => t.pg.query(`UPDATE otp_events SET at = at - interval '${interval}'`);

describe('phone normalisation', () => {
  it('accepts Indian mobiles in common spellings', () => {
    for (const s of ['9876543210', '+91 98765 43210', '098765-43210', '919876543210', '0091 9876543210']) {
      expect(normalizeIndianMobile(s)).toBe('+919876543210');
    }
  });
  it('rejects the rest', () => {
    for (const s of ['1234567890', '98765', '+14155550123', '98765432101', 'abcdefghij', '', null, 5]) {
      expect(normalizeIndianMobile(s)).toBeNull();
    }
  });
  it('generates 6-digit codes', () => {
    for (let i = 0; i < 50; i++) expect(randomCode6()).toMatch(/^\d{6}$/);
  });
});

describe('phone OTP (Better Auth phoneNumber plugin + MSG91 sender)', () => {
  it('happy path: send-otp sends a 6-digit code, verify signs in with a session; the API never returns the code', async () => {
    const t = await setup();
    const s = await start(t, '+91 98765 43210');
    expect(s.status).toBe(200);
    expect(JSON.stringify(s.json)).not.toContain(t.sms.last().code);
    expect(t.sms.last().phone).toBe('+919876543210');
    expect(t.sms.last().code).toMatch(/^\d{6}$/);
    const v = await verify(t, t.sms.last().code, '+91 98765 43210');
    expect(v.status).toBe(200);
    expect(v.headers.get('set-auth-token')).toBeTruthy();
    expect(v.headers.get('set-cookie')).toContain('notra.session_token=');
    const me = await t.call('GET', '/v1/me', { token: v.headers.get('set-auth-token')! });
    expect(me.json.user).toMatchObject({ hasPhone: true, hasGoogle: false, phone: '+919876543210', displayName: null });
    // a phone-only account carries a placeholder e-mail and is marked as a phone sign-up
    const [u] = (await t.pg.query<{ email: string; signup_method: string; phone_verified: boolean }>('SELECT email, signup_method, phone_verified FROM users')).rows;
    expect(u).toEqual({ email: 'p919876543210@phone.notra.invalid', signup_method: 'phone', phone_verified: true });
  });

  it('the code lives only in the short-lived verification row (5 minutes) and is consumed on success', async () => {
    const t = await setup();
    await start(t);
    const [row] = (await t.pg.query<{ identifier: string; value: string; secs: number }>(
      `SELECT identifier, value, extract(epoch FROM expires_at - now())::int AS secs FROM auth_verifications`)).rows;
    expect(row!.identifier).toBe('+919876543210');
    expect(row!.value).toBe(`${t.sms.last().code}:0`);
    expect(row!.secs).toBeGreaterThan(280);
    expect(row!.secs).toBeLessThanOrEqual(300);
    expect((await verify(t, t.sms.last().code)).status).toBe(200);
    expect((await t.pg.query('SELECT 1 FROM auth_verifications')).rows).toHaveLength(0);
  });

  it('wrong code fails, and the code is single use', async () => {
    const t = await setup();
    await start(t);
    const code = t.sms.last().code;
    const wrong = code === '000000' ? '111111' : '000000';
    const w = await verify(t, wrong);
    expect(w.status).toBe(400);
    expect(w.json.error).toBe('invalid_code');
    expect((await verify(t, code)).status).toBe(200);
    const again = await verify(t, code);
    expect(again.status).toBe(400); // consumed
    expect(again.json.error).toBe('code_expired');
  });

  it('expired codes fail', async () => {
    const t = await setup();
    await start(t);
    await t.pg.query(`UPDATE auth_verifications SET expires_at = now() - interval '1 second'`);
    const r = await verify(t, t.sms.last().code);
    expect(r.status).toBe(400);
    expect(r.json.error).toBe('code_expired');
  });

  it('locks after 5 wrong attempts, even for the right code', async () => {
    const t = await setup();
    await start(t);
    const code = t.sms.last().code;
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) expect((await verify(t, wrong)).status).toBe(400);
    const r = await verify(t, code);
    expect(r.status).toBe(429);
    expect(r.json.error).toBe('too_many_attempts');
    // the code is gone: a new one has to be requested
    expect((await verify(t, code)).json.error).toBe('code_expired');
  });

  it('only the newest code is valid', async () => {
    const t = await setup();
    await start(t);
    const first = t.sms.last().code;
    await age(t, '40 seconds');
    await start(t);
    const second = t.sms.last().code;
    if (first !== second) expect((await verify(t, first)).status).toBe(400);
    expect((await verify(t, second)).status).toBe(200);
  });

  it('validates the phone number (Indian mobiles only) and answers 400 for junk codes', async () => {
    const t = await setup();
    expect((await start(t, '12345')).json.error).toBe('invalid_phone');
    expect((await start(t, '+14155550123')).json.error).toBe('invalid_phone');
    expect((await t.call('POST', '/api/auth/phone-number/send-otp', { body: {} })).status).toBe(400);
    await start(t);
    expect((await verify(t, '12')).status).toBe(400);
    expect((await verify(t, 'abcdef')).status).toBe(400);
    expect((await verify(t, '123456', '9123456780')).status).toBe(400); // no request for that phone
    expect(t.sms.sent).toHaveLength(1);
  });

  it('enforces a 30 s resend cooldown', async () => {
    const t = await setup();
    expect((await start(t)).status).toBe(200);
    const r = await start(t);
    expect(r.status).toBe(429);
    expect(r.json.error).toBe('resend_too_soon');
    expect(r.headers.get('retry-after')).toBeTruthy();
    await age(t, '31 seconds');
    expect((await start(t)).status).toBe(200);
  });

  it('allows at most 3 starts per phone per 15 minutes', async () => {
    const t = await setup();
    for (let i = 0; i < 3; i++) {
      expect((await start(t)).status).toBe(200);
      await age(t, '31 seconds');
    }
    const r = await start(t);
    expect(r.status).toBe(429);
    expect(r.json.error).toBe('too_many_requests');
    await age(t, '15 minutes');
    expect((await start(t)).status).toBe(200);
    expect((await start(t, '9123456780')).status).toBe(200); // other phones unaffected
  });

  it('allows at most 10 starts per IP per hour', async () => {
    const t = await setup();
    for (let i = 0; i < 10; i++) expect((await start(t, `98765432${String(i).padStart(2, '0')}`, '1.2.3.4')).status).toBe(200);
    await t.pg.query('DELETE FROM auth_rate_limits'); // Better Auth's own 10-per-minute limiter would answer first; test OUR hourly limit
    const blocked = await start(t, '9111111111', '1.2.3.4');
    expect(blocked.status).toBe(429);
    expect(blocked.json.error).toBe('too_many_requests');
    expect((await start(t, '9111111111', '5.6.7.8')).status).toBe(200);
    await age(t, '2 hours');
    expect((await start(t, '9222222222', '1.2.3.4')).status).toBe(200);
  });

  it('rate limits hold under concurrency', async () => {
    const t = await setup();
    const rs = await Promise.all([0, 1, 2, 3, 4].map(() => start(t)));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
  });

  it("Better Auth's own request limiter (database-backed) throttles a hammering IP on /api/auth/*", async () => {
    const t = await setup();
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await verify(t, '000000', '9876543210', '9.9.9.9')).status);
    // /phone-number/* allows 10 requests per 60 s per IP; the rest are 429
    expect(codes.filter((c) => c === 429).length).toBeGreaterThanOrEqual(1);
    const r = await verify(t, '000000', '9876543210', '9.9.9.9');
    expect(r.status).toBe(429);
    expect(r.json.error).toBe('too_many_requests');
    expect((await t.pg.query('SELECT 1 FROM auth_rate_limits')).rows.length).toBeGreaterThan(0);
  });

  it('reports sms failures as 502 and records them', async () => {
    const t = await setup();
    t.sms.fail = true;
    const r = await start(t);
    expect(r.status).toBe(502);
    expect(r.json.error).toBe('sms_failed');
    expect((await t.pg.query(`SELECT 1 FROM otp_events WHERE kind = 'send_fail'`)).rows).toHaveLength(1);
  });

  it('writes the otp_events telemetry: send, verify_fail, verify_ok', async () => {
    const t = await setup();
    await start(t);
    await verify(t, t.sms.last().code === '000000' ? '111111' : '000000');
    await verify(t, t.sms.last().code);
    const kinds = (await t.pg.query<{ kind: string }>('SELECT kind FROM otp_events ORDER BY id')).rows.map((r) => r.kind);
    expect(kinds).toEqual(['send', 'verify_fail', 'verify_ok']);
  });
});

describe('Msg91Provider', () => {
  it('calls the OTP API with the DLT template id and the auth key in a header', async () => {
    let seen: { url: string; headers: Record<string, string> } | undefined;
    const fake = (async (url: string, init: RequestInit) => {
      seen = { url, headers: init.headers as Record<string, string> };
      return new Response(JSON.stringify({ type: 'success' }), { status: 200 });
    }) as unknown as typeof fetch;
    await new Msg91Provider('KEY', 'TPL1', fake).sendOtp('+919876543210', '123456');
    expect(seen!.url).toContain('template_id=TPL1');
    expect(seen!.url).toContain('mobile=919876543210');
    expect(seen!.url).not.toContain('KEY');
    expect(seen!.headers.authkey).toBe('KEY');
    const failing = (async () => new Response(JSON.stringify({ type: 'error' }), { status: 200 })) as unknown as typeof fetch;
    await expect(new Msg91Provider('KEY', 'TPL1', failing).sendOtp('+919876543210', '1')).rejects.toThrow();
  });
});

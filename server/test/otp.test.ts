import { describe, expect, it } from 'vitest';
import { normalizeIndianMobile } from '../src/auth/phone';
import { Msg91Provider } from '../src/auth/sms';
import { randomCode6 } from '../src/crypto';
import { setup } from './helpers';

const start = (t: Awaited<ReturnType<typeof setup>>, phone = '9876543210', ip?: string) =>
  t.call('POST', '/v1/auth/otp/start', { body: { phone }, ip });
const verify = (t: Awaited<ReturnType<typeof setup>>, code: string, phone = '9876543210') =>
  t.call('POST', '/v1/auth/otp/verify', { body: { phone, code } });
const age = (t: Awaited<ReturnType<typeof setup>>, interval: string) =>
  t.pg.query(`UPDATE otp_requests SET created_at = created_at - interval '${interval}'`);

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

describe('otp', () => {
  it('happy path: start sends a code, verify signs in; the API never returns the code', async () => {
    const t = await setup();
    const s = await start(t, '+91 98765 43210');
    expect(s.status).toBe(200);
    expect(JSON.stringify(s.json)).not.toContain(t.sms.last().code);
    expect(t.sms.last().phone).toBe('+919876543210');
    const v = await verify(t, t.sms.last().code);
    expect(v.status).toBe(200);
    expect(v.json.user).toMatchObject({ hasPhone: true, phone: '+919876543210' });
    expect(v.json.accessToken).toBeTruthy();
  });

  it('stores only a salted hash', async () => {
    const t = await setup();
    await start(t);
    const [row] = (await t.pg.query<{ code_hash: string }>('SELECT code_hash FROM otp_requests')).rows;
    expect(row!.code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row!.code_hash).not.toContain(t.sms.last().code);
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
    expect((await verify(t, code)).status).toBe(400); // consumed
  });

  it('expired codes fail', async () => {
    const t = await setup();
    await start(t);
    await t.pg.query(`UPDATE otp_requests SET expires_at = now() - interval '1 second'`);
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

  it('validates input', async () => {
    const t = await setup();
    expect((await start(t, '12345')).json.error).toBe('invalid_phone');
    await start(t);
    expect((await verify(t, '12')).status).toBe(400);
    expect((await verify(t, 'abcdef')).status).toBe(400);
    expect((await verify(t, '123456', '9123456780')).status).toBe(400); // no request for that phone
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
    expect((await start(t, '9111111111', '1.2.3.4')).status).toBe(429);
    expect((await start(t, '9111111111', '5.6.7.8')).status).toBe(200);
    await age(t, '2 hours');
    expect((await start(t, '9222222222', '1.2.3.4')).status).toBe(200);
  });

  it('rate limits hold under concurrency', async () => {
    const t = await setup();
    const rs = await Promise.all([0, 1, 2, 3, 4].map(() => start(t)));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
  });

  it('reports sms failures as 502', async () => {
    const t = await setup();
    t.sms.fail = true;
    expect((await start(t)).status).toBe(502);
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

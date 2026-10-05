import { describe, expect, it } from 'vitest';
import { smsFromEnv, type Env } from '../src/config';
import worker from '../src/worker';

describe('startup without secrets', () => {
  it('a missing SMS secret only fails when an OTP is sent', async () => {
    const sms = smsFromEnv({ BETTER_AUTH_SECRET: 'x', BETTER_AUTH_URL: 'https://x.test', GOOGLE_CLIENT_IDS: '' } as Env);
    await expect(sms.sendOtp('+919876543210', '123456')).rejects.toThrow(/MSG91/);
    await expect(smsFromEnv({ SMS_PROVIDER: 'dev' } as Env).sendOtp('+919876543210', '123456')).resolves.toBeUndefined();
  });

  it('/v1/health answers 200 before DATABASE_URL exists; other routes stay 500', async () => {
    const ctx = { waitUntil: () => undefined };
    const ok = await worker.fetch(new Request('https://x.test/v1/health'), {} as Env, ctx);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true, db: 'unconfigured' });
    expect((await worker.fetch(new Request('https://x.test/v1/config'), {} as Env, ctx)).status).toBe(500);
  });
});

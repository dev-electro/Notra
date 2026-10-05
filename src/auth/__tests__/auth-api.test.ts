import { HttpError, SuspendedError, SUSPENDED_FALLBACK_HI } from '@/sync/http';
import { authErrorMessage } from '../messages';
import { createAuthApi, OTP_EXPIRES_IN_S, OTP_RESEND_AFTER_S, toAuthError, toE164, type AuthClientLike, type AuthResult } from '../auth-api';

const ok = (data: unknown = {}): AuthResult => ({ data, error: null });
const fail = (status: number, body: Record<string, unknown>): AuthResult => ({ data: null, error: { status, ...body } });

function fake(over: Partial<Record<string, AuthResult>> = {}) {
  const calls: { fn: string; arg: unknown }[] = [];
  const rec = (fn: string, res: AuthResult = ok()) => async (arg?: unknown) => (calls.push({ fn, arg }), over[fn] ?? res);
  const client: AuthClientLike = {
    signIn: { social: rec('signIn.social') as AuthClientLike['signIn']['social'] },
    linkSocial: rec('linkSocial') as AuthClientLike['linkSocial'],
    phoneNumber: { sendOtp: rec('sendOtp') as never, verify: rec('verify') as never },
    signOut: rec('signOut') as never,
    getSession: rec('getSession') as never,
    getCookie: async () => 'notra.session_token=abc.def',
  };
  return { client, calls };
}

describe('auth api (Better Auth client wrapper)', () => {
  it('Google: the native idToken goes to signIn.social({ provider: "google", idToken })', async () => {
    const f = fake();
    await createAuthApi(async () => f.client).signInGoogle('ID.TOKEN.X');
    expect(f.calls).toEqual([{ fn: 'signIn.social', arg: { provider: 'google', idToken: { token: 'ID.TOKEN.X' } } }]);
  });

  it('phone: sends E.164, returns the server limits, verifies with the 6-digit code', async () => {
    const f = fake();
    const api = createAuthApi(async () => f.client);
    expect(await api.otpStart('9876543210')).toEqual({ resendAfter: OTP_RESEND_AFTER_S, expiresIn: OTP_EXPIRES_IN_S });
    await api.otpVerify('9876543210', '123456');
    expect(f.calls).toEqual([
      { fn: 'sendOtp', arg: { phoneNumber: '+919876543210' } },
      { fn: 'verify', arg: { phoneNumber: '+919876543210', code: '123456' } },
    ]);
  });

  it('linking: phone verify with updatePhoneNumber, Google through linkSocial', async () => {
    const f = fake();
    const api = createAuthApi(async () => f.client);
    await api.linkPhone('9876543210', '123456');
    await api.linkGoogle('T');
    expect(f.calls[0]).toEqual({ fn: 'verify', arg: { phoneNumber: '+919876543210', code: '123456', updatePhoneNumber: true } });
    expect(f.calls[1]).toEqual({ fn: 'linkSocial', arg: { provider: 'google', idToken: { token: 'T' } } });
  });

  it('sign-out and session refresh call the client', async () => {
    const f = fake();
    const api = createAuthApi(async () => f.client);
    await api.signOut();
    await api.refreshSession();
    expect(f.calls.map((c) => c.fn)).toEqual(['signOut', 'getSession']);
  });

  it('wrong / expired / locked codes become HttpErrors the Hindi messages understand', async () => {
    for (const [body, status, hi] of [
      [{ error: 'invalid_code' }, 400, 'कोड ग़लत'],
      [{ error: 'code_expired' }, 400, 'समय सीमा'],
      [{ error: 'too_many_attempts' }, 429, 'बहुत ग़लत'],
      [{ error: 'resend_too_soon' }, 429, 'रुकें'],
      [{ error: 'too_many_requests' }, 429, 'बहुत कोशिशें'],
      [{ error: 'invalid_phone' }, 400, '10 अंकों'],
      [{ error: 'identity_belongs_to_another_user' }, 409, 'किसी और'],
      [{ error: 'invalid_google_token' }, 401, 'Google'],
      [{ error: 'sms_failed' }, 502, 'SMS'],
      [{ error: 'blocked' }, 403, 'सहायता'],
    ] as const) {
      const api = createAuthApi(async () => fake({ verify: fail(status, body), sendOtp: fail(status, body) }).client);
      const e = await api.otpVerify('9876543210', '000000').catch((x: unknown) => x);
      expect(e).toBeInstanceOf(HttpError);
      expect((e as HttpError).status).toBe(status);
      expect(authErrorMessage(e)).toContain(hi);
    }
  });

  it('falls back to Better Auth\'s own code when the body has no `error` field', () => {
    const e = toAuthError({ status: 400, code: 'INVALID_OTP' }) as HttpError;
    expect(e.code).toBe('invalid_otp');
    expect(toAuthError({ status: 500 }) as HttpError).toMatchObject({ status: 500, code: 'error' });
  });

  it('a suspended account: SuspendedError with the server Hindi text, and the callback fires (maintenance banner / sync pause)', async () => {
    let seen = '';
    const api = createAuthApi(async () => fake({ 'signIn.social': fail(403, { error: 'account_suspended', message_hi: 'खाता रोका गया' }) }).client, { onSuspended: (m) => void (seen = m) });
    const e = await api.signInGoogle('T').catch((x: unknown) => x);
    expect(e).toBeInstanceOf(SuspendedError);
    expect((e as SuspendedError).messageHi).toBe('खाता रोका गया');
    expect(seen).toBe('खाता रोका गया');
    expect(authErrorMessage(e)).toBe('खाता रोका गया');
    expect((toAuthError({ status: 403, error: 'account_suspended' }) as SuspendedError).messageHi).toBe(SUSPENDED_FALLBACK_HI);
    // other 403s are plain HttpErrors
    expect(toAuthError({ status: 403, error: 'blocked' })).toBeInstanceOf(HttpError);
  });

  it('network failures are not wrapped: they reject as they are (the screens show "no internet")', async () => {
    const client = fake().client;
    client.phoneNumber.sendOtp = async () => { throw new TypeError('Network request failed'); };
    const e = await createAuthApi(async () => client).otpStart('9876543210').catch((x: unknown) => x);
    expect(e).toBeInstanceOf(TypeError);
    expect(authErrorMessage(e)).toContain('इंटरनेट');
  });

  it('toE164 keeps digits only', () => {
    expect(toE164('98765 43210')).toBe('+919876543210');
  });
});

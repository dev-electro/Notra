import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, hasSession, otpStart, otpVerify, setSignedOutHandler, signInGoogle, signOut } from './api';

type Call = { url: string; init: RequestInit };
function mockFetch(handler: (c: Call) => Response) {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const c = { url, init };
    calls.push(c);
    return handler(c);
  }));
  return calls;
}
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const hdr = (c: Call, n: string) => new Headers(c.init.headers).get(n);

afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear(); setSignedOutHandler(null); });

describe('admin sign-in through Better Auth', () => {
  it('OTP: send-otp then verify keeps the signed session token from set-auth-token and sends it as a Bearer to /admin/api', async () => {
    const calls = mockFetch((c) => {
      if (c.url.endsWith('/phone-number/send-otp')) return json(200, { message: 'code sent' });
      if (c.url.endsWith('/phone-number/verify')) return json(200, { status: true }, { 'set-auth-token': 'tok.sig' });
      return json(200, { role: 'owner' });
    });
    await otpStart('98765 43210');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ phoneNumber: '98765 43210' });
    expect(hasSession()).toBe(false);
    await otpVerify('98765 43210', '123456');
    expect(calls[1]!.url).toContain('/api/auth/phone-number/verify');
    expect(hasSession()).toBe(true);
    await api('/admin/api/me');
    expect(hdr(calls[2]!, 'authorization')).toBe('Bearer tok.sig');
    expect(calls[2]!.init.credentials).toBe('include'); // the cookie also works when panel and API share a site
  });

  it('Google: the ID token goes to sign-in/social as { provider: "google", idToken: { token } }', async () => {
    const calls = mockFetch(() => json(200, { redirect: false }, { 'set-auth-token': 'g.sig' }));
    await signInGoogle('GOOGLE.ID.TOKEN');
    expect(calls[0]!.url).toContain('/api/auth/sign-in/social');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ provider: 'google', idToken: { token: 'GOOGLE.ID.TOKEN' } });
    expect(hasSession()).toBe(true);
  });

  it('a failed sign-in throws ApiError with the server code (and Hindi message for a suspended account) and stores nothing', async () => {
    mockFetch(() => json(403, { error: 'account_suspended', message_hi: 'खाता रोका गया' }));
    const e = await otpVerify('9876543210', '111111').catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status: 403, code: 'account_suspended' });
    expect(hasSession()).toBe(false);
  });

  it('a sign-in answer without a session token is an error, not a half signed-in state', async () => {
    mockFetch(() => json(200, { status: true }));
    await expect(otpVerify('9876543210', '111111')).rejects.toMatchObject({ code: 'no_session_token' });
    expect(hasSession()).toBe(false);
  });

  it('a 401 from the API clears the session and tells the app (no refresh loop)', async () => {
    mockFetch((c) => (c.url.endsWith('/phone-number/verify') ? json(200, {}, { 'set-auth-token': 't.s' }) : json(401, { error: 'unauthorized' })));
    await otpVerify('9876543210', '123456');
    let out = 0;
    setSignedOutHandler(() => void out++);
    await expect(api('/admin/api/me')).rejects.toMatchObject({ status: 401 });
    expect(out).toBe(1);
    expect(hasSession()).toBe(false);
  });

  it('sign-out calls Better Auth sign-out with the token, then forgets it even if offline', async () => {
    const calls = mockFetch((c) => (c.url.endsWith('/phone-number/verify') ? json(200, {}, { 'set-auth-token': 't.s' }) : json(200, { success: true })));
    await otpVerify('9876543210', '123456');
    await signOut();
    expect(calls[1]!.url).toContain('/api/auth/sign-out');
    expect(hdr(calls[1]!, 'authorization')).toBe('Bearer t.s');
    expect(hasSession()).toBe(false);
    await otpVerify('9876543210', '123456');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    await signOut();
    expect(hasSession()).toBe(false);
  });
});

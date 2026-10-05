import { createApi, HttpError, SignedOutError, SuspendedError, type SessionSource } from '../http';

const res = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });
const header = (init: RequestInit, name: string) => (init.headers as Record<string, string>)[name];

function setup(handler: (url: string, init: RequestInit) => Response | Promise<Response>, cookie = 'notra.session_token=abc.def') {
  let cur = cookie;
  let cleared = 0;
  const calls: { url: string; cookie?: string }[] = [];
  const session: SessionSource = { cookie: async () => cur, clear: async () => { cur = ''; cleared++; } };
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, cookie: header(init, 'cookie') });
    return handler(url, init);
  }) as unknown as typeof fetch;
  const api = createApi({ baseUrl: 'https://api.test/', session, fetchImpl, timeoutMs: 50 });
  return { api, calls, cookie: () => cur, cleared: () => cleared };
}

describe('api client', () => {
  it('sends the Better Auth session cookie and parses JSON', async () => {
    const t = setup(() => res(200, { ok: 1 }));
    expect(await t.api.request('GET', '/v1/x', { auth: true })).toEqual({ ok: 1 });
    expect(t.calls[0]).toEqual({ url: 'https://api.test/v1/x', cookie: 'notra.session_token=abc.def' });
  });

  it('unauthenticated calls send no cookie and never touch the session', async () => {
    const t = setup(() => res(200, { ok: 1 }));
    await t.api.request('GET', '/v1/config');
    expect(t.calls[0]!.cookie).toBeUndefined();
  });

  it('a 401 clears the session, signals sign-out and does not retry (there is no refresh token any more)', async () => {
    let signedOut = 0;
    let cur = 'notra.session_token=abc.def';
    let calls = 0;
    const api = createApi({
      baseUrl: 'https://api.test', session: { cookie: async () => cur, clear: async () => void (cur = '') }, onSignedOut: () => void signedOut++,
      fetchImpl: (async () => (calls++, res(401, { error: 'unauthorized' }))) as unknown as typeof fetch,
    });
    await expect(api.request('GET', '/v1/x', { auth: true })).rejects.toBeInstanceOf(SignedOutError);
    expect(calls).toBe(1);
    expect(cur).toBe('');
    expect(signedOut).toBe(1);
    // signed out: no network call at all (and the app is told again, so a stale "signed in" label is cleared)
    await expect(api.request('GET', '/v1/x', { auth: true })).rejects.toBeInstanceOf(SignedOutError);
    expect(calls).toBe(1);
    expect(signedOut).toBe(2);
  });

  it('maps server errors to HttpError with the error code', async () => {
    const t = setup(() => res(429, { error: 'too_many_requests' }));
    await expect(t.api.request('POST', '/v1/support', { body: {} })).rejects.toEqual(expect.objectContaining({ status: 429, code: 'too_many_requests' }));
    expect(new HttpError(1, 'x')).toBeInstanceOf(Error);
    expect(t.cleared()).toBe(0);
  });

  it('aborts on timeout', async () => {
    const hang = (_u: string, init: RequestInit) =>
      new Promise<Response>((_, reject) => init.signal!.addEventListener('abort', () => reject(new Error('aborted'))));
    const t = setup(hang as never);
    await expect(t.api.request('GET', '/v1/x', { auth: true })).rejects.toThrow('aborted');
    expect(t.cleared()).toBe(0); // a timeout is not a sign-out
  });
});

describe('app headers and suspended accounts', () => {
  it('sends the app headers on every call', async () => {
    const seen: Record<string, string>[] = [];
    const session: SessionSource = { cookie: async () => 'notra.session_token=abc.def', clear: async () => {} };
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      seen.push(init.headers as Record<string, string>);
      return res(200, {});
    }) as unknown as typeof fetch;
    const api = createApi({ baseUrl: 'https://api.test', session, fetchImpl, headers: () => ({ 'X-App-Version': '1.2.3', 'X-Platform': 'android', 'X-OS-Version': '33' }) });
    await api.request('GET', '/v1/config');
    await api.request('GET', '/v1/x', { auth: true });
    expect(seen.length).toBe(2);
    for (const h of seen) expect(h).toMatchObject({ 'X-App-Version': '1.2.3', 'X-Platform': 'android', 'X-OS-Version': '33' });
  });

  it('403 suspended throws SuspendedError with the server Hindi message and calls onSuspended', async () => {
    let got = '';
    const t = setup(() => res(403, { error: 'account_suspended', message_hi: 'खाता रोका गया' }));
    const api = createApi({ baseUrl: 'https://api.test', session: { cookie: async () => 'notra.session_token=abc.def', clear: async () => {} }, fetchImpl: (async () => res(403, { error: 'account_suspended', message_hi: 'खाता रोका गया' })) as unknown as typeof fetch, onSuspended: (m) => void (got = m) });
    await expect(api.request('POST', '/v1/sync/push', { auth: true, body: {} })).rejects.toBeInstanceOf(SuspendedError);
    expect(got).toBe('खाता रोका गया');
    await expect(t.api.request('GET', '/v1/x', { auth: true })).rejects.toMatchObject({ messageHi: 'खाता रोका गया' });
  });

  it('a suspended answer without a message gets a Hindi fallback; other 403s stay HttpError', async () => {
    const t1 = setup(() => res(403, { suspended: true }));
    await expect(t1.api.request('GET', '/v1/x', { auth: true })).rejects.toMatchObject({ messageHi: expect.stringContaining('खाता') });
    const t2 = setup(() => res(403, { error: 'forbidden' }));
    await expect(t2.api.request('GET', '/v1/x', { auth: true })).rejects.toBeInstanceOf(HttpError);
  });
});

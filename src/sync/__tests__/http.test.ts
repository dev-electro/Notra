import { createApi, HttpError, SignedOutError, SuspendedError, type TokenStore, type Tokens } from '../http';

const res = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });

function setup(handler: (url: string, init: RequestInit) => Response | Promise<Response>, tokens: Tokens | null = { accessToken: 'a1', refreshToken: 'r1' }) {
  let cur = tokens;
  const calls: { url: string; auth?: string }[] = [];
  const store: TokenStore = { get: async () => cur, set: async (t) => void (cur = t) };
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, auth: (init.headers as Record<string, string>).authorization });
    return handler(url, init);
  }) as unknown as typeof fetch;
  const api = createApi({ baseUrl: 'https://api.test/', tokens: store, fetchImpl, timeoutMs: 50 });
  return { api, calls, tokens: () => cur };
}

describe('api client', () => {
  it('sends the bearer token and parses JSON', async () => {
    const t = setup(() => res(200, { ok: 1 }));
    expect(await t.api.request('GET', '/v1/x', { auth: true })).toEqual({ ok: 1 });
    expect(t.calls[0]).toEqual({ url: 'https://api.test/v1/x', auth: 'Bearer a1' });
  });

  it('refreshes once on 401, stores the rotated tokens and retries once', async () => {
    const t = setup((url, init) => {
      if (url.endsWith('/refresh')) return res(200, { accessToken: 'a2', refreshToken: 'r2' });
      return (init.headers as Record<string, string>).authorization === 'Bearer a2' ? res(200, { ok: 1 }) : res(401);
    });
    expect(await t.api.request('GET', '/v1/x', { auth: true })).toEqual({ ok: 1 });
    expect(t.calls.map((c) => c.url.split('/v1')[1])).toEqual(['/x', '/auth/refresh', '/x']);
    expect(t.tokens()).toEqual({ accessToken: 'a2', refreshToken: 'r2' });
  });

  it('shares one refresh between concurrent 401s', async () => {
    const t = setup((url, init) => {
      if (url.endsWith('/refresh')) return res(200, { accessToken: 'a2', refreshToken: 'r2' });
      return (init.headers as Record<string, string>).authorization === 'Bearer a2' ? res(200, {}) : res(401);
    });
    await Promise.all([t.api.request('GET', '/v1/a', { auth: true }), t.api.request('GET', '/v1/b', { auth: true })]);
    expect(t.calls.filter((c) => c.url.endsWith('/refresh'))).toHaveLength(1);
  });

  it('does not loop: a second 401 after refresh is an error', async () => {
    const t = setup((url) => (url.endsWith('/refresh') ? res(200, { accessToken: 'a2', refreshToken: 'r2' }) : res(401, { error: 'unauthorized' })));
    await expect(t.api.request('GET', '/v1/x', { auth: true })).rejects.toMatchObject({ status: 401 });
    expect(t.calls).toHaveLength(3);
  });

  it('a rejected refresh token signs out (tokens cleared) without touching anything else', async () => {
    let signedOut = false;
    let cur: Tokens | null = { accessToken: 'a1', refreshToken: 'r1' };
    const api = createApi({
      baseUrl: 'https://api.test', tokens: { get: async () => cur, set: async (t) => void (cur = t) }, onSignedOut: () => (signedOut = true),
      fetchImpl: (async () => res(401)) as unknown as typeof fetch,
    });
    await expect(api.request('GET', '/v1/x', { auth: true })).rejects.toBeInstanceOf(SignedOutError);
    expect(cur).toBeNull();
    expect(signedOut).toBe(true);
    await expect(api.request('GET', '/v1/x', { auth: true })).rejects.toBeInstanceOf(SignedOutError); // no tokens: no network call needed
  });

  it('maps server errors to HttpError with the error code', async () => {
    const t = setup(() => res(429, { error: 'too_many_requests' }));
    await expect(t.api.request('POST', '/v1/auth/otp/start', { body: {} })).rejects.toEqual(expect.objectContaining({ status: 429, code: 'too_many_requests' }));
    expect(new HttpError(1, 'x')).toBeInstanceOf(Error);
  });

  it('aborts on timeout', async () => {
    const hang = (_u: string, init: RequestInit) =>
      new Promise<Response>((_, reject) => init.signal!.addEventListener('abort', () => reject(new Error('aborted'))));
    const t = setup(hang as never);
    await expect(t.api.request('GET', '/v1/x', { auth: true })).rejects.toThrow('aborted');
  });
});

describe('app headers and suspended accounts', () => {
  it('sends the app headers on every call, including the refresh', async () => {
    const seen: Record<string, string>[] = [];
    let cur: Tokens | null = { accessToken: 'a1', refreshToken: 'r1' };
    const store: TokenStore = { get: async () => cur, set: async (t) => void (cur = t) };
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen.push(init.headers as Record<string, string>);
      if (url.endsWith('/refresh')) return res(200, { accessToken: 'a2', refreshToken: 'r2' });
      const au = (init.headers as Record<string, string>).authorization;
      return au === undefined || au === 'Bearer a2' ? res(200, {}) : res(401);
    }) as unknown as typeof fetch;
    const api = createApi({ baseUrl: 'https://api.test', tokens: store, fetchImpl, headers: () => ({ 'X-App-Version': '1.2.3', 'X-Platform': 'android', 'X-OS-Version': '33' }) });
    await api.request('GET', '/v1/config');
    await api.request('GET', '/v1/x', { auth: true });
    expect(seen.length).toBe(4);
    for (const h of seen) expect(h).toMatchObject({ 'X-App-Version': '1.2.3', 'X-Platform': 'android', 'X-OS-Version': '33' });
  });

  it('403 suspended throws SuspendedError with the server Hindi message and calls onSuspended', async () => {
    let got = '';
    const t = setup(() => res(403, { error: 'account_suspended', message_hi: 'खाता रोका गया' }));
    const api = createApi({ baseUrl: 'https://api.test', tokens: { get: async () => ({ accessToken: 'a', refreshToken: 'r' }), set: async () => {} }, fetchImpl: (async () => res(403, { error: 'account_suspended', message_hi: 'खाता रोका गया' })) as unknown as typeof fetch, onSuspended: (m) => void (got = m) });
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

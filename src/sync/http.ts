import type { Batch, PullPage, PushResult } from './wire';
import type { Transport } from './engine';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}
export interface TokenStore {
  get(): Promise<Tokens | null>;
  set(t: Tokens | null): Promise<void>;
}

export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(`${status} ${code}`);
  }
}
/** The server answered 403 "suspended": the cloud account is paused. `messageHi` is the server's Hindi text. Local use is unaffected. */
export class SuspendedError extends Error {
  constructor(readonly messageHi: string) {
    super('suspended');
  }
}
export const SUSPENDED_FALLBACK_HI = 'आपका क्लाउड खाता अभी रोका गया है। आपका हिसाब फ़ोन में सुरक्षित है और ऐप चलता रहेगा।';

/** The refresh token was rejected: the person must sign in again. Local data is untouched. */
export class SignedOutError extends Error {
  constructor() {
    super('signed out');
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  tokens: TokenStore;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Called with the refreshed token response's user (optional). */
  onSignedOut?: () => void;
  /** Extra headers on every call (app version, platform, OS version). */
  headers?: () => Record<string, string>;
  /** Called when the server says the account is suspended (403). */
  onSuspended?: (messageHi: string) => void;
}

export interface Api {
  /** JSON request. `auth: true` adds the bearer token and, on a 401, refreshes once and retries once. */
  request<T>(method: 'GET' | 'POST' | 'DELETE', path: string, o?: { body?: unknown; auth?: boolean }): Promise<T>;
}

/** Plain fetch with a 15 s timeout (AbortController). No NetInfo: callers just try and fail quietly. */
export function createApi(o: ApiClientOptions): Api {
  const f = o.fetchImpl ?? fetch;
  const timeoutMs = o.timeoutMs ?? 15_000;
  let refreshing: Promise<Tokens> | null = null;

  async function raw(method: string, path: string, body: unknown, token?: string): Promise<Response> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      return await f(o.baseUrl.replace(/\/+$/, '') + path, {
        method,
        headers: {
          accept: 'application/json',
          ...(o.headers?.() ?? {}),
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  // Single flight: concurrent 401s share one refresh (a rotated refresh token can only be used once).
  function refresh(): Promise<Tokens> {
    refreshing ??= (async () => {
      try {
        const cur = await o.tokens.get();
        if (!cur) throw new SignedOutError();
        const res = await raw('POST', '/v1/auth/refresh', { refreshToken: cur.refreshToken });
        if (res.status === 401 || res.status === 400) {
          await o.tokens.set(null);
          o.onSignedOut?.();
          throw new SignedOutError();
        }
        if (res.status === 403) await parse(res); // suspended: throws SuspendedError
        if (!res.ok) throw new HttpError(res.status, 'refresh_failed');
        const j = (await res.json()) as Tokens;
        const next = { accessToken: j.accessToken, refreshToken: j.refreshToken };
        await o.tokens.set(next);
        return next;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  async function parse<T>(res: Response): Promise<T> {
    const j = (await res.json().catch(() => ({}))) as { error?: string; message_hi?: string; suspended?: boolean };
    if (res.status === 403 && (j.suspended === true || /suspend/i.test(j.error ?? ''))) {
      const msg = typeof j.message_hi === 'string' && j.message_hi.trim() ? j.message_hi : SUSPENDED_FALLBACK_HI;
      o.onSuspended?.(msg);
      throw new SuspendedError(msg);
    }
    if (!res.ok) throw new HttpError(res.status, j.error ?? 'error');
    return j as T;
  }

  return {
    async request<T>(method: 'GET' | 'POST' | 'DELETE', path: string, opts: { body?: unknown; auth?: boolean } = {}): Promise<T> {
      if (!opts.auth) return parse<T>(await raw(method, path, opts.body));
      let t = await o.tokens.get();
      if (!t) throw new SignedOutError();
      let res = await raw(method, path, opts.body, t.accessToken);
      if (res.status === 401) {
        t = await refresh();
        res = await raw(method, path, opts.body, t.accessToken);
      }
      return parse<T>(res);
    },
  };
}

export function apiTransport(api: Api): Transport {
  return {
    push: async (batch: Batch) => {
      const r = await api.request<Partial<PushResult>>('POST', '/v1/sync/push', { body: batch, auth: true });
      return { rejected: r.rejected ?? [] };
    },
    pull: (since, limit) => api.request<PullPage>('GET', `/v1/sync/pull?since=${since}&limit=${limit}`, { auth: true }),
  };
}

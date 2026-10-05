import type { Batch, PullPage, PushResult } from './wire';
import type { Transport } from './engine';

/**
 * Where the signed-in session comes from. It is the Better Auth session cookie that the Expo client keeps in the OS keystore
 * (expo-secure-store); the server reads it from the `Cookie` header on every sync / support call. Never SQLite, never logs.
 */
export interface SessionSource {
  /** The `Cookie` header value for the current session, or '' when signed out. */
  cookie(): Promise<string>;
  /** Forget the session on this phone (the server said it is not valid any more). Local data is untouched. */
  clear(): Promise<void>;
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

/** The server no longer accepts the session (expired, revoked, signed out elsewhere): the person must sign in again. Local data is untouched. */
export class SignedOutError extends Error {
  constructor() {
    super('signed out');
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  session: SessionSource;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Called when the server rejected the session (401) and it was cleared. */
  onSignedOut?: () => void;
  /** Extra headers on every call (app version, platform, OS version). */
  headers?: () => Record<string, string>;
  /** Called when the server says the account is suspended (403). */
  onSuspended?: (messageHi: string) => void;
}

export interface Api {
  /** JSON request. `auth: true` sends the session cookie; a 401 clears the session and throws SignedOutError. */
  request<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, o?: { body?: unknown; auth?: boolean }): Promise<T>;
}

/** Plain fetch with a 15 s timeout (AbortController). No NetInfo: callers just try and fail quietly. */
export function createApi(o: ApiClientOptions): Api {
  const f = o.fetchImpl ?? fetch;
  const timeoutMs = o.timeoutMs ?? 15_000;

  async function raw(method: string, path: string, body: unknown, cookie?: string): Promise<Response> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      return await f(o.baseUrl.replace(/\/+$/, '') + path, {
        method,
        headers: {
          accept: 'application/json',
          ...(o.headers?.() ?? {}),
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(cookie ? { cookie } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
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
    async request<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, opts: { body?: unknown; auth?: boolean } = {}): Promise<T> {
      if (!opts.auth) return parse<T>(await raw(method, path, opts.body));
      const cookie = await o.session.cookie();
      if (!cookie) {
        o.onSignedOut?.(); // e.g. an account signed in with the old (pre Better Auth) tokens: there is no session now
        throw new SignedOutError();
      }
      const res = await raw(method, path, opts.body, cookie);
      if (res.status === 401) {
        await o.session.clear();
        o.onSignedOut?.();
        throw new SignedOutError();
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

/**
 * API client. Staff sign in with the app's own endpoints (/v1/auth/google, /v1/auth/otp/*) and call /admin/api/* with the access token
 * as a Bearer header. The access token lives in memory only; the refresh token is kept in sessionStorage (cleared when the tab closes)
 * so a reload does not sign you out. Requests are same-origin by default (credentials 'same-origin'), so an optional Cloudflare
 * Access layer in front of the app and API keeps working.
 */
export const API_BASE: string = ((import.meta.env.VITE_API_BASE as string | undefined) ?? '').replace(/\/+$/, '');
const REFRESH_KEY = 'notra-admin-refresh';

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, readonly detail?: string, readonly body?: Record<string, unknown>) {
    super(detail ?? code);
  }
}

type Tokens = { access: string | null };
const tokens: Tokens = { access: null };
let onSignedOut: (() => void) | null = null;
export const setSignedOutHandler = (fn: (() => void) | null) => { onSignedOut = fn; };

const store = {
  get: () => { try { return sessionStorage.getItem(REFRESH_KEY); } catch { return null; } },
  set: (v: string | null) => { try { if (v) sessionStorage.setItem(REFRESH_KEY, v); else sessionStorage.removeItem(REFRESH_KEY); } catch { /* private mode */ } },
};

export function setSession(s: { accessToken: string; refreshToken: string } | null) {
  tokens.access = s?.accessToken ?? null;
  store.set(s?.refreshToken ?? null);
}
export const hasRefreshToken = () => !!store.get();

async function raw(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('content-type')) headers.set('content-type', 'application/json');
  headers.set('x-platform', 'web');
  headers.set('x-app-version', 'admin');
  if (init.auth !== false && tokens.access) headers.set('authorization', `Bearer ${tokens.access}`);
  return fetch(`${API_BASE}${path}`, { ...init, headers, credentials: 'same-origin' });
}

let refreshing: Promise<boolean> | null = null;
/** Exchange the refresh token for a new pair. Concurrent callers share one request (the server rotates tokens). */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    const rt = store.get();
    if (!rt) return false;
    try {
      const res = await raw('/v1/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: rt }), auth: false });
      if (!res.ok) return false;
      const j = (await res.json()) as { accessToken: string; refreshToken: string };
      setSession(j);
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => { refreshing = null; }, 0);
    }
  })();
  return refreshing;
}

async function parse(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

export interface Opts { method?: string; body?: unknown; query?: Record<string, string | number | undefined | null> }

export async function api<T = unknown>(path: string, o: Opts = {}): Promise<T> {
  const qs = o.query ? Object.entries(o.query).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&') : '';
  const url = `${path}${qs ? `?${qs}` : ''}`;
  const init: RequestInit = { method: o.method ?? 'GET', body: o.body === undefined ? undefined : JSON.stringify(o.body) };
  let res = await raw(url, init);
  if (res.status === 401 && (await refreshSession())) res = await raw(url, init);
  if (res.status === 401) { setSession(null); onSignedOut?.(); }
  const j = await parse(res);
  if (!res.ok) {
    const b = (j && typeof j === 'object' ? j : {}) as Record<string, unknown>;
    throw new ApiError(res.status, String(b.error ?? `http_${res.status}`), typeof b.detail === 'string' ? b.detail : undefined, b);
  }
  return j as T;
}

/** GET a file (CSV) with the Bearer token and save it. */
export async function download(path: string, query: Record<string, string>, filename: string): Promise<void> {
  const qs = new URLSearchParams(query).toString();
  const url = `${path}?${qs}`;
  let res = await raw(url);
  if (res.status === 401 && (await refreshSession())) res = await raw(url);
  if (!res.ok) throw new ApiError(res.status, 'download_failed');
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Human message for an error shown in the UI. */
export function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    const map: Record<string, string> = {
      forbidden: 'Your role is not allowed to do this.',
      not_staff: 'This account does not have admin access.',
      account_suspended: 'This account is suspended.',
      reason_required: 'A reason of at least 5 characters is required.',
      last_owner: 'There must always be at least one owner. Make someone else an owner first.',
      confirmation_required: e.detail ?? 'Typed confirmation does not match.',
      invalid_config: e.detail ?? 'That value is not valid.',
      no_active_grant: 'The user has not shared their data with support (or the window has ended).',
      user_not_found: e.detail ?? 'No such user.',
      privacy_guard: 'Blocked by the privacy guard.',
    };
    return map[e.code] ?? e.detail ?? e.code.replace(/_/g, ' ');
  }
  return e instanceof Error ? e.message : 'Something went wrong';
}

// ---- sign-in (same endpoints as the app) ----
export interface SessionResponse { accessToken: string; refreshToken: string; user: { id: string } }

export async function signInGoogle(idToken: string): Promise<SessionResponse> {
  const res = await raw('/v1/auth/google', { method: 'POST', body: JSON.stringify({ idToken }), auth: false });
  const j = (await parse(res)) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(res.status, String(j?.error ?? 'sign_in_failed'), typeof j?.message_hi === 'string' ? String(j.message_hi) : undefined);
  setSession(j as unknown as SessionResponse);
  return j as unknown as SessionResponse;
}
export async function otpStart(phone: string): Promise<void> {
  const res = await raw('/v1/auth/otp/start', { method: 'POST', body: JSON.stringify({ phone }), auth: false });
  if (!res.ok) { const j = (await parse(res)) as Record<string, unknown>; throw new ApiError(res.status, String(j?.error ?? 'otp_failed')); }
}
export async function otpVerify(phone: string, code: string): Promise<SessionResponse> {
  const res = await raw('/v1/auth/otp/verify', { method: 'POST', body: JSON.stringify({ phone, code }), auth: false });
  const j = (await parse(res)) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(res.status, String(j?.error ?? 'otp_failed'));
  setSession(j as unknown as SessionResponse);
  return j as unknown as SessionResponse;
}
export async function signOut(): Promise<void> {
  const rt = store.get();
  setSession(null);
  if (rt) { try { await raw('/v1/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken: rt }), auth: false }); } catch { /* offline */ } }
}

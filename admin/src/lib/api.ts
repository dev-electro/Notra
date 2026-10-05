/**
 * API client. Staff sign in through Better Auth (/api/auth/sign-in/social with a Google ID token, or /api/auth/phone-number/*): the
 * same sign-in the app uses. The session is a Better Auth session: the server sets a cookie (used when this panel is served from the
 * same site as the API) and returns its signed token in the `set-auth-token` header, which this client keeps in sessionStorage
 * (cleared when the tab closes, so a reload does not sign you out) and sends as `Authorization: Bearer` to /admin/api/*. The bearer
 * works across origins without third-party cookies, which is how the panel is normally hosted (Cloudflare Pages -> Worker).
 * The role is never in the session: the server reads it from the database on every request.
 */
export const API_BASE: string = ((import.meta.env.VITE_API_BASE as string | undefined) ?? '').replace(/\/+$/, '');
const SESSION_KEY = 'notra-admin-session';

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, readonly detail?: string, readonly body?: Record<string, unknown>) {
    super(detail ?? code);
  }
}

let onSignedOut: (() => void) | null = null;
export const setSignedOutHandler = (fn: (() => void) | null) => { onSignedOut = fn; };

const store = {
  get: () => { try { return sessionStorage.getItem(SESSION_KEY); } catch { return null; } },
  set: (v: string | null) => { try { if (v) sessionStorage.setItem(SESSION_KEY, v); else sessionStorage.removeItem(SESSION_KEY); } catch { /* private mode */ } },
};

export const setSession = (token: string | null) => store.set(token);
export const hasSession = () => !!store.get();

async function raw(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('content-type')) headers.set('content-type', 'application/json');
  headers.set('x-platform', 'web');
  headers.set('x-app-version', 'admin');
  const token = store.get();
  if (init.auth !== false && token) headers.set('authorization', `Bearer ${token}`);
  return fetch(`${API_BASE}${path}`, { ...init, headers, credentials: 'include' });
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
  const res = await raw(url, init);
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
  const res = await raw(url);
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

// ---- sign-in (Better Auth, the same flow as the app) ----
async function authCall(path: string, body: unknown, fallbackCode: string): Promise<Response> {
  const res = await raw(`/api/auth${path}`, { method: 'POST', body: JSON.stringify(body), auth: false });
  if (!res.ok) {
    const j = (await parse(res)) as Record<string, unknown> | null;
    throw new ApiError(res.status, String(j?.error ?? fallbackCode), typeof j?.message_hi === 'string' ? String(j.message_hi) : undefined, j ?? undefined);
  }
  return res;
}
/** The signed session token Better Auth returns in `set-auth-token` after a sign-in (the bearer plugin). */
function keepSession(res: Response): void {
  const token = res.headers.get('set-auth-token');
  if (!token) throw new ApiError(502, 'no_session_token');
  setSession(token);
}

export async function signInGoogle(idToken: string): Promise<void> {
  keepSession(await authCall('/sign-in/social', { provider: 'google', idToken: { token: idToken } }, 'sign_in_failed'));
}
export async function otpStart(phone: string): Promise<void> {
  await authCall('/phone-number/send-otp', { phoneNumber: phone }, 'otp_failed');
}
export async function otpVerify(phone: string, code: string): Promise<void> {
  keepSession(await authCall('/phone-number/verify', { phoneNumber: phone, code }, 'otp_failed'));
}
export async function signOut(): Promise<void> {
  const had = hasSession();
  if (had) { try { await raw('/api/auth/sign-out', { method: 'POST', body: '{}' }); } catch { /* offline */ } }
  setSession(null);
}

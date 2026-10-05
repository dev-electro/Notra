import { HttpError, SUSPENDED_FALLBACK_HI, SuspendedError } from '@/sync/http';

/** Must match server/src/auth/better-auth.ts (APP_SCHEME, advanced.cookiePrefix) and app.json "scheme". */
export const APP_SCHEME = 'notradiary';
export const COOKIE_PREFIX = 'notra';
export const STORAGE_PREFIX = 'notra';

/** What a Better Fetch call returns: data on success, otherwise an error carrying the HTTP status and the server's JSON body fields. */
export interface AuthResult<T = unknown> {
  data: T | null;
  error: ({ status: number; message?: string; error?: string; code?: string; message_hi?: string } & Record<string, unknown>) | null;
}

/** The small part of the Better Auth client this app uses (so tests can pass a fake). */
export interface AuthClientLike {
  signIn: { social(a: { provider: 'google'; idToken: { token: string } }): Promise<AuthResult> };
  linkSocial(a: { provider: 'google'; idToken: { token: string } }): Promise<AuthResult>;
  phoneNumber: {
    sendOtp(a: { phoneNumber: string }): Promise<AuthResult>;
    verify(a: { phoneNumber: string; code: string; updatePhoneNumber?: boolean }): Promise<AuthResult>;
  };
  signOut(): Promise<AuthResult>;
  getSession(): Promise<AuthResult>;
  getCookie(): Promise<string>;
}

/** Server limits (server/src/auth/otp-guard.ts); the answer to send-otp has no body of ours, so the app knows them. */
export const OTP_RESEND_AFTER_S = 30;
export const OTP_EXPIRES_IN_S = 300;

/** 10 digits typed by the person -> E.164. Anything the server's own check rejects comes back as 'invalid_phone'. */
export const toE164 = (digits: string) => `+91${digits.replace(/\D/g, '')}`;

/** Better Auth error -> the errors the rest of the app already understands (HttpError with the server's code, SuspendedError). */
export function toAuthError(e: NonNullable<AuthResult['error']>, onSuspended?: (messageHi: string) => void): Error {
  const code = typeof e.error === 'string' ? e.error : typeof e.code === 'string' ? e.code.toLowerCase() : 'error';
  if (e.status === 403 && /suspend/i.test(code)) {
    const msg = typeof e.message_hi === 'string' && e.message_hi.trim() ? e.message_hi : SUSPENDED_FALLBACK_HI;
    onSuspended?.(msg);
    return new SuspendedError(msg);
  }
  return new HttpError(e.status || 0, code);
}

export interface AuthApiOptions {
  /** Called when the server says the account is suspended. */
  onSuspended?: (messageHi: string) => void;
}

/**
 * The app's sign-in operations on top of the Better Auth client. Every failure becomes an HttpError / SuspendedError; a network
 * failure rejects with the original error (the UI shows "no internet").
 */
export function createAuthApi(getClient: () => Promise<AuthClientLike>, o: AuthApiOptions = {}) {
  async function run(call: (c: AuthClientLike) => Promise<AuthResult>): Promise<void> {
    const r = await call(await getClient());
    if (r.error) throw toAuthError(r.error, o.onSuspended);
  }
  return {
    /** Google Sign-In SDK ID token -> session. */
    signInGoogle: (idToken: string) => run((c) => c.signIn.social({ provider: 'google', idToken: { token: idToken } })),
    /** Add Google to the signed-in account. */
    linkGoogle: (idToken: string) => run((c) => c.linkSocial({ provider: 'google', idToken: { token: idToken } })),
    otpStart: async (digits: string) => {
      await run((c) => c.phoneNumber.sendOtp({ phoneNumber: toE164(digits) }));
      return { resendAfter: OTP_RESEND_AFTER_S, expiresIn: OTP_EXPIRES_IN_S };
    },
    otpVerify: (digits: string, code: string) => run((c) => c.phoneNumber.verify({ phoneNumber: toE164(digits), code })),
    /** Add a phone number to the signed-in account. */
    linkPhone: (digits: string, code: string) => run((c) => c.phoneNumber.verify({ phoneNumber: toE164(digits), code, updatePhoneNumber: true })),
    /** Revoke the session on the server and clear it on this phone (the Expo plugin clears the stored cookie). */
    signOut: () => run((c) => c.signOut()),
    /** Re-read the session: the server extends it (sliding expiry) and the Expo plugin stores the refreshed cookie. */
    refreshSession: () => run((c) => c.getSession()),
  };
}
export type AuthApi = ReturnType<typeof createAuthApi>;

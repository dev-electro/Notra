/**
 * Better Auth answers errors as { code, message }. The app (and the admin panel) have always read { error: '<snake_case>' }
 * (plus message_hi / retryAfter), so every non-2xx answer from /api/auth/* gets an `error` field here; Better Auth's own fields stay.
 * Status quirks: too many wrong OTP attempts is 429 (Better Auth says 403), and "this number / Google account belongs to someone
 * else" is 409.
 */
const BY_CODE: Record<string, { error: string; status?: number }> = {
  INVALID_OTP: { error: 'invalid_code' },
  OTP_NOT_FOUND: { error: 'code_expired' },
  OTP_EXPIRED: { error: 'code_expired' },
  TOO_MANY_ATTEMPTS: { error: 'too_many_attempts', status: 429 },
  INVALID_PHONE_NUMBER: { error: 'invalid_phone' },
  PHONE_NUMBER_EXIST: { error: 'identity_belongs_to_another_user', status: 409 },
  SOCIAL_ACCOUNT_ALREADY_LINKED: { error: 'identity_belongs_to_another_user', status: 409 },
  INVALID_TOKEN: { error: 'invalid_google_token' },
  FAILED_TO_GET_USER_INFO: { error: 'invalid_google_token' },
  USER_EMAIL_NOT_FOUND: { error: 'invalid_google_token' },
  PROVIDER_NOT_FOUND: { error: 'invalid_google_token' },
  ID_TOKEN_NOT_SUPPORTED: { error: 'invalid_google_token' },
  EMAIL_NOT_VERIFIED: { error: 'invalid_google_token' },
  SESSION_NOT_FRESH: { error: 'unauthorized' },
};

export async function normalizeAuthResponse(res: Response): Promise<Response> {
  if (res.status < 400 || !(res.headers.get('content-type') ?? '').includes('application/json')) return res;
  let body: Record<string, unknown> = {};
  try {
    body = (await res.clone().json()) as Record<string, unknown>;
  } catch { /* not JSON after all */ }
  const code = typeof body.code === 'string' ? body.code : '';
  const mapped = BY_CODE[code];
  let error = typeof body.error === 'string' ? body.error : mapped?.error;
  let status = mapped?.status ?? res.status;
  const headers = new Headers(res.headers);
  if (!error) {
    if (res.status === 429) {
      error = 'too_many_requests';
      const retry = Number(res.headers.get('x-retry-after') ?? headers.get('retry-after'));
      if (Number.isFinite(retry) && retry > 0) body = { ...body, retryAfter: retry };
      if (!headers.has('retry-after') && body.retryAfter) headers.set('retry-after', String(body.retryAfter));
    } else if (res.status === 401) error = 'unauthorized';
    else error = code ? code.toLowerCase() : 'error';
  }
  if (status === 429 && !headers.has('retry-after') && typeof body.retryAfter === 'number') headers.set('retry-after', String(body.retryAfter));
  headers.delete('content-length');
  return new Response(JSON.stringify({ ...body, error }), { status, headers });
}

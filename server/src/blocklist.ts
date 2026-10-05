import type { Queryable } from './db';
import { ApiError } from './errors';

export type OtpEventKind = 'send' | 'send_fail' | 'verify_ok' | 'verify_fail' | 'blocked';

/** Durable OTP activity for abuse dashboards and SMS cost. Best effort: never let bookkeeping break sign-in. */
export async function recordOtpEvent(q: Queryable, kind: OtpEventKind, phone: string | null, ip: string | null): Promise<void> {
  try {
    await q.query('INSERT INTO otp_events (kind, phone_e164, ip) VALUES ($1, $2, $3)', [kind, phone, ip]);
  } catch (e) {
    console.error('otp_events', e instanceof Error ? e.message : e);
  }
}

/**
 * Refuse OTP start/verify for a blocked phone number or IP (rows in `blocklist`, optionally expiring).
 * The answer is a plain 403 "blocked": it does not say which of the two matched.
 */
export async function assertNotBlocked(q: Queryable, phone: string | null, ip: string): Promise<void> {
  const rows = await q.query(
    `SELECT 1 FROM blocklist
     WHERE ((kind = 'phone' AND value = $1) OR (kind = 'ip' AND value = $2)) AND (expires_at IS NULL OR expires_at > now()) LIMIT 1`,
    [phone ?? '', ip],
  );
  if (rows.length) {
    await recordOtpEvent(q, 'blocked', phone, ip);
    throw new ApiError(403, 'blocked');
  }
}

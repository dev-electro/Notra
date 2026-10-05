import type { Db } from '../db';
import { ApiError } from '../errors';
import { assertNotBlocked, recordOtpEvent } from '../blocklist';

/** Better Auth's phoneNumber plugin generates, stores and verifies the code (6 digits, 5 minutes, 5 wrong attempts). The limits below are ours. */
export const OTP_LENGTH = 6;
export const OTP_TTL_S = 5 * 60;
export const OTP_MAX_ATTEMPTS = 5;
export const PHONE_STARTS_PER_15MIN = 3;
export const IP_STARTS_PER_HOUR = 10;
export const RESEND_COOLDOWN_S = 30;

/**
 * Run before Better Auth creates an OTP: refuse a blocked phone number or IP (403), then enforce 3 sends per phone / 15 min,
 * 10 per IP / hour and a 30 s resend cooldown. The counts come from otp_events (which is also the durable record for abuse
 * dashboards and SMS cost) under a per-phone advisory lock, and the new 'send' event is written in the same transaction, so
 * concurrent requests cannot slip past the limits.
 */
export async function guardOtpSend(db: Db, phone: string, ip: string): Promise<void> {
  await assertNotBlocked(db, phone, ip);
  await db.tx(async (q) => {
    await q.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`otp:${phone}`]);
    const [r] = await q.query<{ recent_phone: number; recent_ip: number; since_last: number | null }>(
      `SELECT
         (SELECT count(*) FROM otp_events WHERE kind = 'send' AND phone_e164 = $1 AND at > now() - interval '15 minutes')::int AS recent_phone,
         (SELECT count(*) FROM otp_events WHERE kind = 'send' AND ip = $2 AND at > now() - interval '1 hour')::int AS recent_ip,
         (SELECT extract(epoch FROM now() - max(at)) FROM otp_events WHERE kind = 'send' AND phone_e164 = $1)::float8 AS since_last`,
      [phone, ip],
    );
    if (r!.since_last !== null && Number(r!.since_last) < RESEND_COOLDOWN_S) {
      throw new ApiError(429, 'resend_too_soon', { retryAfter: Math.ceil(RESEND_COOLDOWN_S - Number(r!.since_last)) });
    }
    if (r!.recent_phone >= PHONE_STARTS_PER_15MIN) throw new ApiError(429, 'too_many_requests', { retryAfter: 15 * 60 });
    if (r!.recent_ip >= IP_STARTS_PER_HOUR) throw new ApiError(429, 'too_many_requests', { retryAfter: 60 * 60 });
    await q.query(`INSERT INTO otp_events (kind, phone_e164, ip) VALUES ('send', $1, $2)`, [phone, ip]);
  });
}

/** Before verifying a code: a blocked phone number or IP gets 403 here as well. */
export async function guardOtpVerify(db: Db, phone: string, ip: string): Promise<void> {
  await assertNotBlocked(db, phone, ip);
}

export const recordVerify = (db: Db, ok: boolean, phone: string, ip: string) => recordOtpEvent(db, ok ? 'verify_ok' : 'verify_fail', phone, ip);
export const recordSendFail = (db: Db, phone: string, ip: string) => recordOtpEvent(db, 'send_fail', phone, ip);

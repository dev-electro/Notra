import type { Db, Queryable } from '../db';
import { randomCode6, safeEqual, sha256Hex } from '../crypto';
import { ApiError } from '../errors';
import { assertNotBlocked, recordOtpEvent } from '../blocklist';
import type { SmsProvider } from './sms';

export const OTP_TTL_MIN = 5;
export const OTP_MAX_ATTEMPTS = 5;
export const PHONE_STARTS_PER_15MIN = 3;
export const IP_STARTS_PER_HOUR = 10;
export const RESEND_COOLDOWN_S = 30;

const hashCode = (code: string, phone: string, pepper: string) => sha256Hex(code + phone + pepper);

/**
 * Create and send an OTP. Rate limits are enforced in SQL (count rows in otp_requests) under a per-phone advisory
 * lock, so concurrent requests cannot slip past them: 3 per phone / 15 min, 10 per IP / hour, 30 s resend cooldown.
 */
export async function startOtp(db: Db, sms: SmsProvider, pepper: string, phone: string, ip: string): Promise<{ resendAfter: number; expiresIn: number }> {
  await assertNotBlocked(db, phone, ip);
  const code = randomCode6();
  const codeHash = await hashCode(code, phone, pepper);
  const id = crypto.randomUUID();
  await db.tx(async (q) => {
    await q.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`otp:${phone}`]);
    const [r] = await q.query<{ recent_phone: number; recent_ip: number; since_last: number | null }>(
      `SELECT
         (SELECT count(*) FROM otp_requests WHERE phone_e164 = $1 AND created_at > now() - interval '15 minutes')::int AS recent_phone,
         (SELECT count(*) FROM otp_requests WHERE ip = $2 AND created_at > now() - interval '1 hour')::int AS recent_ip,
         (SELECT extract(epoch FROM now() - max(created_at)) FROM otp_requests WHERE phone_e164 = $1)::float8 AS since_last`,
      [phone, ip],
    );
    if (r!.since_last !== null && Number(r!.since_last) < RESEND_COOLDOWN_S) {
      throw new ApiError(429, 'resend_too_soon', { retryAfter: Math.ceil(RESEND_COOLDOWN_S - Number(r!.since_last)) });
    }
    if (r!.recent_phone >= PHONE_STARTS_PER_15MIN) throw new ApiError(429, 'too_many_requests', { retryAfter: 15 * 60 });
    if (r!.recent_ip >= IP_STARTS_PER_HOUR) throw new ApiError(429, 'too_many_requests', { retryAfter: 60 * 60 });
    await q.query(`DELETE FROM otp_requests WHERE created_at < now() - interval '1 day'`);
    await q.query(
      `INSERT INTO otp_requests (id, phone_e164, code_hash, expires_at, ip)
       VALUES ($1, $2, $3, now() + ($4 || ' minutes')::interval, $5)`,
      [id, phone, codeHash, String(OTP_TTL_MIN), ip],
    );
    await q.query(`INSERT INTO otp_events (kind, phone_e164, ip) VALUES ('send', $1, $2)`, [phone, ip]);
  });
  try {
    await sms.sendOtp(phone, code);
  } catch {
    await recordOtpEvent(db, 'send_fail', phone, ip);
    throw new ApiError(502, 'sms_failed');
  }
  return { resendAfter: RESEND_COOLDOWN_S, expiresIn: OTP_TTL_MIN * 60 };
}

/**
 * Check a code against the newest unconsumed request for the phone. Every wrong guess counts against the request
 * (max 5), the code is single use, and the hash comparison is constant time. Throws 400/429 on failure.
 */
export async function verifyOtp(db: Db, pepper: string, phone: string, code: unknown, ip = 'unknown'): Promise<void> {
  await assertNotBlocked(db, phone, ip);
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) throw new ApiError(400, 'invalid_code');
  const candidate = await hashCode(code, phone, pepper);
  type Outcome = 'ok' | 'invalid' | 'expired' | 'locked';
  const outcome = await db.tx<Outcome>(async (q: Queryable) => {
    const [row] = await q.query<{ id: string; code_hash: string; attempts: number; expired: boolean }>(
      `SELECT id, code_hash, attempts, expires_at <= now() AS expired FROM otp_requests
       WHERE phone_e164 = $1 AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [phone],
    );
    if (!row) return 'invalid';
    if (row.expired) return 'expired';
    if (row.attempts >= OTP_MAX_ATTEMPTS) return 'locked';
    // Count the attempt first (committed even when the code is wrong), then compare.
    await q.query('UPDATE otp_requests SET attempts = attempts + 1 WHERE id = $1', [row.id]);
    if (!safeEqual(row.code_hash, candidate)) return 'invalid';
    await q.query('UPDATE otp_requests SET consumed_at = now() WHERE id = $1', [row.id]);
    return 'ok';
  });
  if (outcome === 'ok') {
    await recordOtpEvent(db, 'verify_ok', phone, ip);
    return;
  }
  await recordOtpEvent(db, 'verify_fail', phone, ip);
  if (outcome === 'locked') throw new ApiError(429, 'too_many_attempts');
  if (outcome === 'expired') throw new ApiError(400, 'code_expired');
  throw new ApiError(400, 'invalid_code');
}

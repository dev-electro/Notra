import type { Db } from '../db';
import { safeEqual } from '../crypto';
import { AUTH_CONTEXT_SQL } from './dialect';

/**
 * The phone plugin writes the OTP to auth_verifications as '<code>:<failed attempts>' (this Better Auth version has no storeOTP option).
 * A `verification.create.before` hook swaps the code for a keyed hash before the row is written, so the clear code never reaches the
 * database, and `verifyOtpHashed` (the plugin's `verifyOTP`) does the check, attempt counting, expiry and single use. Stored shape:
 * '<hex hmac-sha256(secret, phone:code)>:<attempts>'. No migration is needed: the column is plain text.
 */
const CLEAR = /^\d{6}:\d+$/;
const enc = new TextEncoder();

export async function otpDigest(secret: string, phone: string, code: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${phone}:${code}`));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** For the create hook: hash a phone-OTP value, leave every other verification value alone. */
export async function hashOtpValue(secret: string, identifier: string, value: string): Promise<string> {
  if (!identifier.startsWith('+') || !CLEAR.test(value)) return value;
  const [code, attempts] = value.split(':') as [string, string];
  return `${await otpDigest(secret, identifier, code)}:${attempts}`;
}

export type OtpCheck = 'ok' | 'invalid' | 'expired' | 'not_found' | 'too_many';

/** Check (and consume on success) the newest OTP row for `phone`. Atomic: a correct code can be used once, even under concurrency. */
export async function checkOtp(db: Db, secret: string, phone: string, code: string, maxAttempts: number): Promise<OtpCheck> {
  const digest = await otpDigest(secret, phone, code);
  return db.tx(async (q) => {
    await q.query(AUTH_CONTEXT_SQL);
    const [row] = await q.query<{ id: string; value: string; expired: boolean }>(
      `SELECT id, value, expires_at < now() AS expired FROM auth_verifications WHERE identifier = $1 ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [phone]);
    if (!row) return 'not_found';
    if (row.expired) { await q.query('DELETE FROM auth_verifications WHERE identifier = $1', [phone]); return 'expired'; }
    const [stored, att] = row.value.split(':') as [string, string | undefined];
    const attempts = Number.isSafeInteger(Number(att)) && Number(att) > 0 ? Number(att) : 0;
    if (attempts >= maxAttempts) { await q.query('DELETE FROM auth_verifications WHERE identifier = $1', [phone]); return 'too_many'; }
    if (!safeEqual(stored, digest)) {
      await q.query('UPDATE auth_verifications SET value = $2 WHERE id = $1', [row.id, `${stored}:${attempts + 1}`]);
      return 'invalid';
    }
    await q.query('DELETE FROM auth_verifications WHERE identifier = $1', [phone]);
    return 'ok';
  });
}

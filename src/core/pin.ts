import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';

/**
 * PIN handling: salted PBKDF2-HMAC-SHA256, plus a persistent wrong-attempt back-off.
 *
 * A 4-digit PIN has only 10,000 values, so the hash alone cannot stop someone who can read the database; the real
 * protections are the SQLCipher-encrypted database and the attempt back-off below. 10,000 iterations keep one check
 * under ~0.5 s even on a very low-end phone (pure JS, Hermes). The iteration count is stored with the hash so it can
 * be raised later without breaking old PINs.
 */
export const PIN_ITERATIONS = 10_000;
const PIN_RE = /^\d{4}$/;

export const isValidPin = (pin: string): boolean => PIN_RE.test(pin);

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
function fromHex(h: string): Uint8Array | null {
  if (h.length % 2 !== 0 || !/^[0-9a-f]*$/.test(h)) return null;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

const derive = (pin: string, salt: Uint8Array, c: number) => pbkdf2(sha256, pin, salt, { c, dkLen: 32 });

/** `pbkdf2-sha256$<iterations>$<salt hex>$<hash hex>`. `salt` must be 16 random bytes. */
export function hashPin(pin: string, salt: Uint8Array, iterations = PIN_ITERATIONS): string {
  if (!isValidPin(pin)) throw new Error('PIN must be 4 digits');
  return `pbkdf2-sha256$${iterations}$${toHex(salt)}$${toHex(derive(pin, salt, iterations))}`;
}

/** Constant-time comparison of the derived hash. Malformed stored values never verify. */
export function verifyPin(pin: string, stored: string | null | undefined): boolean {
  if (!stored || !isValidPin(pin)) return false;
  const parts = stored.split('$');
  if (parts.length !== 4) return false;
  const [alg, it, saltHex, hashHex] = parts;
  const c = Number(it);
  if (alg !== 'pbkdf2-sha256' || !Number.isInteger(c) || c < 1 || c > 5_000_000 || !saltHex || !hashHex) return false;
  const salt = fromHex(saltHex);
  const want = fromHex(hashHex);
  if (!salt || !want || want.length !== 32) return false;
  const got = derive(pin, salt, c);
  let diff = 0;
  for (let i = 0; i < 32; i++) diff |= got[i]! ^ want[i]!;
  return diff === 0;
}

// ---------- wrong-attempt back-off ----------
export interface PinAttempts {
  fails: number;
  /** epoch ms until which no attempt is accepted (0 = not locked) */
  lockedUntil: number;
}
export const NO_ATTEMPTS: PinAttempts = { fails: 0, lockedUntil: 0 };
export const FREE_TRIES = 3;
/** Seconds to wait after the 3rd, 4th, 5th ... wrong PIN in a row. The last value repeats. */
export const BACKOFF_SECONDS = [30, 60, 300, 900, 3600] as const;

export const lockRemainingMs = (a: PinAttempts, now: number): number => Math.max(0, a.lockedUntil - now);

export function registerFailure(a: PinAttempts, now: number): PinAttempts {
  const fails = a.fails + 1;
  if (fails < FREE_TRIES) return { fails, lockedUntil: 0 };
  const secs = BACKOFF_SECONDS[Math.min(fails - FREE_TRIES, BACKOFF_SECONDS.length - 1)]!;
  return { fails, lockedUntil: now + secs * 1000 };
}

export function parseAttempts(raw: string | null): PinAttempts {
  if (!raw) return NO_ATTEMPTS;
  try {
    const v = JSON.parse(raw) as Partial<PinAttempts>;
    if (Number.isInteger(v.fails) && Number.isFinite(v.lockedUntil)) return { fails: v.fails!, lockedUntil: v.lockedUntil! };
  } catch {
    /* fall through */
  }
  return NO_ATTEMPTS;
}

/** "30 सेकंड" / "2 मिनट" / "1 घंटा" for the lock message. */
export function formatWait(ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s} सेकंड`;
  const m = Math.ceil(s / 60);
  if (m < 60) return `${m} मिनट`;
  return `${Math.ceil(m / 60)} घंटा`;
}

export type PinCheck = { ok: true } | { ok: false; reason: 'locked'; waitMs: number } | { ok: false; reason: 'wrong'; attempts: PinAttempts };

/** One PIN try against `stored`, honouring and updating the back-off state. Pure: the caller persists `attempts`. */
export function checkPin(pin: string, stored: string | null, attempts: PinAttempts, now: number): PinCheck & { next: PinAttempts } {
  const wait = lockRemainingMs(attempts, now);
  if (wait > 0) return { ok: false, reason: 'locked', waitMs: wait, next: attempts };
  if (verifyPin(pin, stored)) return { ok: true, next: NO_ATTEMPTS };
  const next = registerFailure(attempts, now);
  return { ok: false, reason: 'wrong', attempts: next, next };
}

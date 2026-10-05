import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { scryptAsync } from '@noble/hashes/scrypt.js';

/**
 * Password-encrypted backup file.
 *
 * - Key: scrypt (memory-hard, so a stolen file is expensive to brute-force) from the person's password.
 *   N=2^15, r=8, p=1 uses ~32 MB for a second or two: fine for a one-off backup, even on a 2 GB phone. The parameters
 *   are stored in the file; on restore they are capped so a hostile file cannot make the phone run out of memory.
 * - Cipher: XChaCha20-Poly1305 (authenticated: any change to the file, or a wrong password, makes decryption fail
 *   instead of producing garbage). 24-byte random nonce, so no nonce bookkeeping.
 * - The header (format, KDF parameters, salt, nonce) is bound to the ciphertext as AAD, so it cannot be altered either.
 *
 * Both primitives come from @noble (small, audited, pure JS: no native module, nothing to link, same output on every phone).
 */
export type BackupErrorCode = 'not_a_backup' | 'unsupported' | 'wrong_password_or_damaged' | 'invalid_data';
export class BackupError extends Error {
  constructor(readonly code: BackupErrorCode) {
    super(code);
  }
}

export interface Kdf {
  N: number;
  r: number;
  p: number;
}
export const DEFAULT_KDF: Kdf = { N: 2 ** 15, r: 8, p: 1 };
const MAX_N = 2 ** 16;
export const MIN_PASSWORD_LENGTH = 6;
const FORMAT = 'notra-backup';
const CIPHER = 'xchacha20poly1305';

export interface Deps {
  /** Cryptographically secure random bytes (expo-crypto `getRandomBytes` in the app). */
  randomBytes: (n: number) => Uint8Array;
}

// ---- base64 (no dependency on atob/btoa, which differ between engines) ----
const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Int16Array(128).fill(-1);
for (let i = 0; i < A.length; i++) LOOKUP[A.charCodeAt(i)] = i;

export function toBase64(b: Uint8Array): string {
  const parts: string[] = [];
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i]! << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    parts.push(A[(n >> 18) & 63]! + A[(n >> 12) & 63]! + (i + 1 < b.length ? A[(n >> 6) & 63]! : '=') + (i + 2 < b.length ? A[n & 63]! : '='));
  }
  return parts.join('');
}

export function fromBase64(s: string): Uint8Array {
  if (s.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new BackupError('not_a_backup');
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((s.length / 4) * 3 - pad);
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    const c = [0, 1, 2, 3].map((k) => (s[i + k] === '=' ? 0 : LOOKUP[s.charCodeAt(i + k)]!));
    const n = (c[0]! << 18) | (c[1]! << 12) | (c[2]! << 6) | c[3]!;
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

const enc = (s: string) => new TextEncoder().encode(s);

interface Header {
  format: string;
  v: number;
  kdf: 'scrypt';
  N: number;
  r: number;
  p: number;
  salt: string;
  cipher: string;
  nonce: string;
}
const aadOf = (h: Header) => enc([h.format, h.v, h.kdf, h.N, h.r, h.p, h.salt, h.cipher, h.nonce].join('|'));

async function deriveKey(password: string, salt: Uint8Array, k: Kdf): Promise<Uint8Array> {
  return scryptAsync(password.normalize('NFKC'), salt, { N: k.N, r: k.r, p: k.p, dkLen: 32, asyncTick: 20 });
}

/** Encrypt `plaintext` (JSON text) into a backup file's text. */
export async function encryptBackup(plaintext: string, password: string, deps: Deps, kdf: Kdf = DEFAULT_KDF): Promise<string> {
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error('password too short');
  const salt = deps.randomBytes(16);
  const nonce = deps.randomBytes(24);
  const header: Header = {
    format: FORMAT, v: 1, kdf: 'scrypt', N: kdf.N, r: kdf.r, p: kdf.p,
    salt: toBase64(salt), cipher: CIPHER, nonce: toBase64(nonce),
  };
  const key = await deriveKey(password, salt, kdf);
  const ct = xchacha20poly1305(key, nonce, aadOf(header)).encrypt(enc(plaintext));
  key.fill(0);
  return JSON.stringify({ ...header, ct: toBase64(ct) });
}

/** Decrypt a backup file's text. Throws BackupError: not_a_backup, unsupported, or wrong_password_or_damaged. */
export async function decryptBackup(fileText: string, password: string): Promise<string> {
  let h: Partial<Header> & { ct?: unknown };
  try {
    h = JSON.parse(fileText);
  } catch {
    throw new BackupError('not_a_backup');
  }
  if (!h || typeof h !== 'object' || h.format !== FORMAT) throw new BackupError('not_a_backup');
  if (h.v !== 1 || h.kdf !== 'scrypt' || h.cipher !== CIPHER) throw new BackupError('unsupported');
  const { N, r, p } = h;
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) throw new BackupError('not_a_backup');
  if (N! < 2 ** 10 || N! > MAX_N || (N! & (N! - 1)) !== 0 || r! < 1 || r! > 8 || p! < 1 || p! > 1) throw new BackupError('unsupported');
  if (typeof h.salt !== 'string' || typeof h.nonce !== 'string' || typeof h.ct !== 'string') throw new BackupError('not_a_backup');
  const header = h as Header;
  const salt = fromBase64(header.salt);
  const nonce = fromBase64(header.nonce);
  const ct = fromBase64(h.ct as string);
  if (salt.length !== 16 || nonce.length !== 24 || ct.length < 16) throw new BackupError('not_a_backup');
  const key = await deriveKey(password, salt, { N: N!, r: r!, p: p! });
  try {
    return new TextDecoder().decode(xchacha20poly1305(key, nonce, aadOf(header)).decrypt(ct));
  } catch {
    throw new BackupError('wrong_password_or_damaged');
  } finally {
    key.fill(0);
  }
}

export const BACKUP_ERROR_HI: Record<BackupErrorCode, string> = {
  not_a_backup: 'यह नोतरा बुक की बैकअप फ़ाइल नहीं है।',
  unsupported: 'यह बैकअप फ़ाइल इस ऐप में नहीं खुल सकती। ऐप अपडेट करें।',
  wrong_password_or_damaged: 'पासवर्ड ग़लत है, या फ़ाइल बदल/ख़राब हो गई है।',
  invalid_data: 'फ़ाइल के अंदर का डेटा सही नहीं है।',
};

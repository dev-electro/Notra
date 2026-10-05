import { pbkdf2Sync } from 'node:crypto';
import {
  BACKOFF_SECONDS, checkPin, formatWait, hashPin, isValidPin, lockRemainingMs, NO_ATTEMPTS, parseAttempts, PIN_ITERATIONS,
  registerFailure, verifyPin, type PinAttempts,
} from '../pin';

const salt = (n: number) => new Uint8Array(16).fill(n);

describe('PIN hashing', () => {
  it('accepts exactly four digits', () => {
    for (const p of ['1234', '0000', '9999']) expect(isValidPin(p)).toBe(true);
    for (const p of ['123', '12345', 'abcd', '12a4', '', '१२३४', ' 123']) expect(isValidPin(p)).toBe(false);
    expect(() => hashPin('12', salt(1))).toThrow();
  });

  it('verifies the right PIN and rejects wrong ones', () => {
    const h = hashPin('4821', salt(7));
    expect(h.startsWith(`pbkdf2-sha256$${PIN_ITERATIONS}$`)).toBe(true);
    expect(verifyPin('4821', h)).toBe(true);
    expect(verifyPin('4822', h)).toBe(false);
    expect(verifyPin('', h)).toBe(false);
    expect(verifyPin('48210', h)).toBe(false);
  });

  it('uses the salt: same PIN, different salt -> different hash; the PIN never appears in it', () => {
    const a = hashPin('1111', salt(1));
    const b = hashPin('1111', salt(2));
    expect(a).not.toBe(b);
    expect(verifyPin('1111', a)).toBe(true);
    expect(verifyPin('1111', b)).toBe(true);
    expect(a.split('$')[3]).not.toContain('1111');
  });

  it('is plain PBKDF2-HMAC-SHA256 (matches Node crypto)', () => {
    const want = pbkdf2Sync('1234', Buffer.alloc(16, 1), 10_000, 32, 'sha256').toString('hex');
    expect(hashPin('1234', salt(1), 10_000).split('$')[3]).toBe(want);
  });

  it('honours the stored iteration count and never verifies malformed values', () => {
    const old = hashPin('2468', salt(3), 1000);
    expect(verifyPin('2468', old)).toBe(true);
    for (const bad of [null, undefined, '', 'x', 'md5$1$aa$bb', 'pbkdf2-sha256$0$aa$bb', 'pbkdf2-sha256$10$zz$bb', `${old}$extra`]) {
      expect(verifyPin('2468', bad as string | null)).toBe(false);
    }
  });
});

describe('wrong-PIN back-off', () => {
  it('first two failures are free, then the wait grows and the last step repeats', () => {
    let a: PinAttempts = NO_ATTEMPTS;
    const t = 1_000_000;
    a = registerFailure(a, t);
    a = registerFailure(a, t);
    expect(lockRemainingMs(a, t)).toBe(0);
    const waits: number[] = [];
    for (let i = 0; i < 7; i++) {
      a = registerFailure(a, t);
      waits.push(lockRemainingMs(a, t) / 1000);
    }
    expect(waits).toEqual([30, 60, 300, 900, 3600, 3600, 3600]);
    expect(BACKOFF_SECONDS[0]).toBe(30);
  });

  it('checkPin refuses to even look at the PIN while locked, and a success resets the counter', () => {
    const h = hashPin('1357', salt(9), 100);
    const t = 5_000;
    let a: PinAttempts = NO_ATTEMPTS;
    for (let i = 0; i < 3; i++) a = checkPin('0000', h, a, t).next;
    expect(a.fails).toBe(3);
    const locked = checkPin('1357', h, a, t + 1000); // right PIN, still locked
    expect(locked).toMatchObject({ ok: false, reason: 'locked' });
    expect(locked.next).toEqual(a);
    const after = checkPin('1357', h, a, t + 31_000);
    expect(after.ok).toBe(true);
    expect(after.next).toEqual(NO_ATTEMPTS);
  });

  it('round-trips through its stored form and tolerates garbage', () => {
    const a = registerFailure(registerFailure(registerFailure(NO_ATTEMPTS, 10), 10), 10);
    expect(parseAttempts(JSON.stringify(a))).toEqual(a);
    for (const g of [null, '', 'nope', '{}', '{"fails":"x"}']) expect(parseAttempts(g)).toEqual(NO_ATTEMPTS);
  });

  it('formats waits in Hindi', () => {
    expect(formatWait(30_000)).toBe('30 सेकंड');
    expect(formatWait(61_000)).toBe('2 मिनट');
    expect(formatWait(3_600_000)).toBe('1 घंटा');
    expect(formatWait(3_601_000)).toBe('2 घंटा');
  });
});

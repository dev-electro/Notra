import { DEFAULT_LEDGER_ID as L } from '../../core';
import {
  getActiveLedgerId, getUnlocked, markUnlocked, relockLedgers, RELOCK_AFTER_MS, setActiveLedger, shouldRelock, subscribeLedger,
} from '../session';

afterEach(() => relockLedgers());

describe('ledger session', () => {
  it('starts on the household ledger with nothing unlocked', () => {
    expect(getActiveLedgerId()).toBe(L);
    expect(getUnlocked().size).toBe(0);
  });

  it('notifies subscribers on every change (and not when nothing changed)', () => {
    let n = 0;
    const off = subscribeLedger(() => n++);
    setActiveLedger('a');
    setActiveLedger('a');
    markUnlocked('a');
    relockLedgers();
    off();
    setActiveLedger('b');
    expect(n).toBe(3);
  });

  it('relocking forgets every unlock and returns to the household ledger', () => {
    markUnlocked('a');
    markUnlocked('b');
    setActiveLedger('a');
    expect([...getUnlocked()].sort()).toEqual(['a', 'b']);
    relockLedgers();
    expect(getUnlocked().size).toBe(0);
    expect(getActiveLedgerId()).toBe(L);
  });

  it('the unlocked set is replaced, never mutated in place (safe to hand to React)', () => {
    const before = getUnlocked();
    markUnlocked('a');
    expect(getUnlocked()).not.toBe(before);
    expect(before.size).toBe(0);
  });
});

describe('relock after background', () => {
  it('relocks only after 2 minutes away', () => {
    const t = 1_000_000;
    expect(shouldRelock(null, t)).toBe(false);
    expect(shouldRelock(t, t + 1000)).toBe(false);
    expect(shouldRelock(t, t + RELOCK_AFTER_MS - 1)).toBe(false);
    expect(shouldRelock(t, t + RELOCK_AFTER_MS)).toBe(true);
    expect(shouldRelock(t, t + 10 * RELOCK_AFTER_MS)).toBe(true);
    expect(RELOCK_AFTER_MS).toBe(120_000);
  });
});

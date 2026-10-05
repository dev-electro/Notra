import { guarded, SAVE_FAILED } from '../guard';
import { createToastStore } from '../toast';

describe('guarded writes', () => {
  it('returns the result when the write works and shows nothing', async () => {
    const seen: string[] = [];
    expect(await guarded(async () => 42, SAVE_FAILED, (m) => seen.push(m))).toBe(42);
    expect(seen).toEqual([]);
  });

  it('turns a failing write into a toast message instead of throwing', async () => {
    const seen: string[] = [];
    const r = await guarded(async () => { throw new Error('SQLITE_FULL: disk is full'); }, undefined, (m) => seen.push(m));
    expect(r).toBeUndefined();
    expect(seen).toEqual([SAVE_FAILED]);
    expect(seen[0]).not.toContain('SQLITE'); // internal error text is never shown
  });
});

describe('toast store', () => {
  it('shows a message, replaces it, and hides it after the delay', () => {
    jest.useFakeTimers();
    try {
      const s = createToastStore(1000);
      const log: (string | null)[] = [];
      s.subscribe((t) => log.push(t?.message ?? null));
      s.show('a');
      jest.advanceTimersByTime(500);
      s.show('b'); // restarts the timer
      jest.advanceTimersByTime(900);
      expect(s.get()?.message).toBe('b');
      jest.advanceTimersByTime(200);
      expect(s.get()).toBeNull();
      expect(log).toEqual(['a', 'b', null]);
      s.show('c');
      s.hide();
      expect(s.get()).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});

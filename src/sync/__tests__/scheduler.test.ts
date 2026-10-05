import { createScheduler } from '../scheduler';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe('scheduler', () => {
  it('debounces writes into one run after the delay', async () => {
    const run = jest.fn(async () => true);
    const s = createScheduler({ run, debounceMs: 10_000 });
    s.schedule();
    jest.advanceTimersByTime(9_000);
    s.schedule(); // a later write re-arms the single timer
    jest.advanceTimersByTime(9_000);
    expect(run).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1_500);
    await flush();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('trigger runs right away', async () => {
    const run = jest.fn(async () => true);
    createScheduler({ run }).trigger();
    jest.advanceTimersByTime(1);
    await flush();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('is single-flight: a write during a run schedules exactly one more run', async () => {
    let release!: () => void;
    const run = jest.fn(() => new Promise<boolean>((r) => (release = () => r(true))));
    const s = createScheduler({ run, debounceMs: 100 });
    s.trigger();
    jest.advanceTimersByTime(1);
    await flush();
    s.schedule();
    s.schedule();
    release();
    await flush();
    jest.advanceTimersByTime(101);
    await flush();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('backs off after failures and resets after success; never throws', async () => {
    const results = [false, false, true];
    const run = jest.fn(async () => {
      const r = results.shift();
      if (r === false && run.mock.calls.length === 1) throw new Error('boom');
      return r ?? true;
    });
    const s = createScheduler({ run, backoffMs: [1_000, 2_000] });
    s.trigger();
    jest.advanceTimersByTime(1);
    await flush();
    expect(run).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(999);
    await flush();
    expect(run).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(2);
    await flush();
    expect(run).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(1_999);
    await flush();
    expect(run).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(2);
    await flush();
    expect(run).toHaveBeenCalledTimes(3);
    jest.advanceTimersByTime(60_000);
    await flush();
    expect(run).toHaveBeenCalledTimes(3); // success: nothing further scheduled
  });

  it('stop cancels pending work', async () => {
    const run = jest.fn(async () => true);
    const s = createScheduler({ run, debounceMs: 100 });
    s.schedule();
    s.stop();
    jest.advanceTimersByTime(1_000);
    await flush();
    expect(run).not.toHaveBeenCalled();
  });
});

export interface SchedulerOptions {
  /** Runs one sync cycle. Resolve to true on success/skip, false (or throw) on failure. Must never need the UI. */
  run: () => Promise<boolean>;
  debounceMs?: number;
  /** Retry delays after consecutive failures (last one repeats). */
  backoffMs?: number[];
}

export interface Scheduler {
  /** Debounced: call after every local write. */
  schedule(): void;
  /** Run as soon as possible (app start, app foreground). */
  trigger(): void;
  stop(): void;
}

/**
 * Debounce + single-flight + exponential backoff. Failures are silent: sync is best effort and the phone stays the
 * source of truth, so a failed attempt simply tries again later.
 */
export function createScheduler(o: SchedulerOptions): Scheduler {
  const debounceMs = o.debounceMs ?? 10_000;
  const backoff = o.backoffMs ?? [15_000, 30_000, 60_000, 120_000, 300_000, 900_000];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let again = false;
  let failures = 0;
  let stopped = false;

  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const arm = (ms: number) => {
    if (stopped) return;
    clear();
    timer = setTimeout(go, ms);
  };

  async function go() {
    timer = null;
    if (running) {
      again = true;
      return;
    }
    running = true;
    let ok = false;
    try {
      ok = await o.run();
    } catch {
      ok = false;
    }
    running = false;
    if (ok) failures = 0;
    else failures += 1;
    if (stopped) return;
    if (!ok) arm(backoff[Math.min(failures - 1, backoff.length - 1)]!);
    else if (again) {
      again = false;
      arm(debounceMs);
    }
  }

  return {
    schedule() {
      if (running) again = true;
      else if (failures === 0) arm(debounceMs); // while backing off, the pending retry already covers new writes
    },
    trigger() {
      if (running) again = true;
      else {
        failures = 0;
        arm(0);
      }
    },
    stop() {
      stopped = true;
      clear();
    },
  };
}

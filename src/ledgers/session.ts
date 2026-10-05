import { DEFAULT_LEDGER_ID } from '../core/ledgers';

/**
 * Which ledger is open right now, and which PIN-protected ledgers were unlocked in this session. Memory only, on purpose:
 * after the app restarts (or after 2 minutes in the background) the app opens the household ledger and every PIN is
 * asked again. Plain TypeScript so it is unit-testable; React reads it through useSyncExternalStore.
 */
type Listener = () => void;
const listeners = new Set<Listener>();
let active = DEFAULT_LEDGER_ID;
let unlocked: ReadonlySet<string> = new Set();

const emit = () => listeners.forEach((l) => l());

export const getActiveLedgerId = (): string => active;
export const getUnlocked = (): ReadonlySet<string> => unlocked;

export function subscribeLedger(cb: Listener): () => void {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}

export function setActiveLedger(id: string): void {
  if (id === active) return;
  active = id;
  emit();
}

/** The PIN of this ledger was just entered correctly. */
export function markUnlocked(id: string): void {
  unlocked = new Set(unlocked).add(id);
  emit();
}

/** Lock every personal ledger again and go back to the household ledger. */
export function relockLedgers(): void {
  unlocked = new Set();
  active = DEFAULT_LEDGER_ID;
  emit();
}

export const RELOCK_AFTER_MS = 2 * 60 * 1000;

/** True when the app was in the background for at least 2 minutes (leftAt = when it went to the background). */
export const shouldRelock = (leftAt: number | null, now: number, afterMs = RELOCK_AFTER_MS): boolean =>
  leftAt !== null && now - leftAt >= afterMs;

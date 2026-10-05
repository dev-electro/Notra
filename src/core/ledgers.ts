import type { Entry, NotraEvent } from './types';

/**
 * Ledgers. The phone is shared, so besides the household ledger (the default) a family member can keep a personal
 * ledger, optionally behind a 4-digit PIN. The household ledger has the same fixed id on every phone, so a restored or
 * second phone never creates a duplicate of it.
 */
export const DEFAULT_LEDGER_ID = '00000000-0000-4000-8000-000000000001';
export const DEFAULT_LEDGER_NAME = 'घर का खाता';

export type LedgerKind = 'HOUSEHOLD' | 'PERSONAL';

export interface Ledger {
  id: string;
  name: string;
  kind: LedgerKind;
  /** true when a PIN is set. The hash itself never leaves the database layer. */
  hasPin: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export const ledgerIdOf = (x: { ledgerId?: string }): string => x.ledgerId ?? DEFAULT_LEDGER_ID;

/** Only this ledger's entries (the in-memory counterpart of `WHERE ledger_id = ?`). */
export const entriesInLedger = (entries: readonly Entry[], ledgerId: string): Entry[] =>
  entries.filter((e) => ledgerIdOf(e) === ledgerId);

export const eventsInLedger = (events: readonly NotraEvent[], ledgerId: string): NotraEvent[] =>
  events.filter((e) => ledgerIdOf(e) === ledgerId);

/** Switching to a PIN-protected ledger needs its PIN, once per app session (until locked again). */
export const needsUnlock = (l: Pick<Ledger, 'id' | 'hasPin'>, unlocked: ReadonlySet<string>): boolean =>
  l.hasPin && !unlocked.has(l.id);

/**
 * Ledgers that may go into a backup file: those without a PIN, or whose PIN was entered in this session. A PIN-protected
 * ledger is never exported behind its owner's back.
 */
export function splitForBackup<T extends Pick<Ledger, 'id' | 'hasPin'>>(
  ledgers: readonly T[],
  unlocked: ReadonlySet<string>,
): { included: T[]; skipped: T[] } {
  const included: T[] = [];
  const skipped: T[] = [];
  for (const l of ledgers) (needsUnlock(l, unlocked) ? skipped : included).push(l);
  return { included, skipped };
}

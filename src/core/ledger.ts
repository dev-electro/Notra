import { DEFAULT_INCREMENT, Entry, Increment } from './types';
import { roundUpToShagun } from './money';

/**
 * Entries that still count: those not superseded by a correction. Chains are handled:
 * A <- B (corrects A) <- C (corrects B) leaves only C. A void entry supersedes its target and counts as
 * nothing itself: A <- B <- V (void of B) leaves nothing.
 */
export function activeEntries(entries: readonly Entry[]): Entry[] {
  const superseded = new Set<string>();
  for (const e of entries) if (e.correctsEntryId) superseded.add(e.correctsEntryId);
  return entries.filter((e) => !e.isVoid && !superseded.has(e.id));
}

/** Total value of an entry (cash + estimated in-kind), paise. */
export function entryValuePaise(e: Pick<Entry, 'cashPaise' | 'inKindValuePaise'>): number {
  return (e.cashPaise || 0) + (e.inKindValuePaise || 0);
}

/** Chronological order by createdAt, ties broken by original order. */
export function sortChronological<T extends { createdAt: string }>(items: readonly T[]): T[] {
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => (a.item.createdAt < b.item.createdAt ? -1 : a.item.createdAt > b.item.createdAt ? 1 : a.i - b.i))
    .map((x) => x.item);
}

/**
 * Suggested return: last received + increment, rounded UP to a shagun number (ends in 1).
 * Input and output are paise. lastReceivedPaise <= 0 (nothing received) -> null.
 */
export function suggestReturn(lastReceivedPaise: number, increment: Increment): number | null {
  if (!Number.isFinite(lastReceivedPaise) || lastReceivedPaise <= 0) return null;
  let targetPaise: number;
  if (increment.type === 'FIXED') {
    targetPaise = lastReceivedPaise + Math.round(increment.rupees * 100);
  } else {
    targetPaise = Math.ceil((lastReceivedPaise * (100 + increment.pct)) / 100);
  }
  return roundUpToShagun(targetPaise / 100) * 100;
}

export interface Balance {
  householdId: string;
  totalGiven: number;
  totalReceived: number;
  /** Value of the most recent entry in each direction, 0 if none. */
  lastGiven: number;
  lastReceived: number;
  lastGivenAt: string | null;
  lastReceivedAt: string | null;
  /** Suggested next amount to give them; null if they never gave anything. */
  suggestedNext: number | null;
}

/** Per other-household Lena-Dena balances; derived, never typed by hand. Superseded entries are ignored. */
export function balances(
  entries: readonly Entry[],
  increment: Increment = DEFAULT_INCREMENT,
): Record<string, Balance> {
  const out: Record<string, Balance> = {};
  for (const e of sortChronological(activeEntries(entries))) {
    const b = (out[e.otherHouseholdId] ??= {
      householdId: e.otherHouseholdId,
      totalGiven: 0,
      totalReceived: 0,
      lastGiven: 0,
      lastReceived: 0,
      lastGivenAt: null,
      lastReceivedAt: null,
      suggestedNext: null,
    });
    const v = entryValuePaise(e);
    if (e.direction === 'AAYA') {
      b.totalReceived += v;
      b.lastReceived = v;
      b.lastReceivedAt = e.createdAt;
    } else {
      b.totalGiven += v;
      b.lastGiven = v;
      b.lastGivenAt = e.createdAt;
    }
  }
  for (const b of Object.values(out)) b.suggestedNext = suggestReturn(b.lastReceived, increment);
  return out;
}

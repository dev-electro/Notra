import { activeEntries, balances, Balance, entryValuePaise, sortChronological } from './ledger';
import { DEFAULT_INCREMENT, Entry, Household, Increment, NotraEvent, Occasion } from './types';

export interface PersonRow extends Balance {
  household?: Household;
  /** received - given. Positive: I have received more than I gave. */
  net: number;
}

/** Person-wise report, sorted by household head name (unknown households last). */
export function personWise(
  entries: readonly Entry[],
  households: readonly Household[] = [],
  increment: Increment = DEFAULT_INCREMENT,
): PersonRow[] {
  return personRowsFromBalances(Object.values(balances(entries, increment)), households);
}

/** Same as personWise, from balances already aggregated elsewhere (e.g. by SQL). */
export function personRowsFromBalances(bals: readonly Balance[], households: readonly Household[] = []): PersonRow[] {
  const byId = new Map(households.map((h) => [h.id, h]));
  return bals
    .map((b) => ({ ...b, household: byId.get(b.householdId), net: b.totalReceived - b.totalGiven }))
    .sort((a, b) => {
      if (!a.household !== !b.household) return a.household ? -1 : 1;
      return (a.household?.headName ?? a.householdId).localeCompare(b.household?.headName ?? b.householdId);
    });
}

export interface OccasionRow {
  occasion: Occasion;
  totalGiven: number;
  totalReceived: number;
  entryCount: number;
  eventCount: number;
}

/** Occasion-wise report. Entries without a known event are grouped under OTHER. */
export function occasionWise(entries: readonly Entry[], events: readonly NotraEvent[]): OccasionRow[] {
  const evById = new Map(events.map((e) => [e.id, e]));
  const rows = new Map<Occasion, OccasionRow & { eventIds: Set<string> }>();
  for (const e of activeEntries(entries)) {
    const ev = e.eventId ? evById.get(e.eventId) : undefined;
    const occasion: Occasion = ev?.occasion ?? 'OTHER';
    const row =
      rows.get(occasion) ??
      { occasion, totalGiven: 0, totalReceived: 0, entryCount: 0, eventCount: 0, eventIds: new Set<string>() };
    rows.set(occasion, row);
    const v = entryValuePaise(e);
    if (e.direction === 'AAYA') row.totalReceived += v;
    else row.totalGiven += v;
    row.entryCount += 1;
    if (ev) row.eventIds.add(ev.id);
  }
  return [...rows.values()].map(({ eventIds, ...r }) => ({ ...r, eventCount: eventIds.size }));
}

export interface SelfLedgerRow {
  entry: Entry;
  /** +value if received (AAYA), -value if given (GAYA). */
  delta: number;
  /** Running (received - given) after this row. */
  runningBalance: number;
}

/** Chronological personal ledger with running balance. */
export function selfLedger(entries: readonly Entry[]): SelfLedgerRow[] {
  let running = 0;
  return sortChronological(activeEntries(entries)).map((entry) => {
    const delta = entry.direction === 'AAYA' ? entryValuePaise(entry) : -entryValuePaise(entry);
    running += delta;
    return { entry, delta, runningBalance: running };
  });
}

export interface PendingReturnRow {
  householdId: string;
  household?: Household;
  receivedPaise: number;
  givenPaise: number;
  /** received - given, always > 0 here. */
  pendingPaise: number;
  suggestedNext: number | null;
}

/** "Lautana baaki": households I have received more from than I have given back. Neutral by design. */
export function pendingReturns(
  entries: readonly Entry[],
  households: readonly Household[] = [],
  increment: Increment = DEFAULT_INCREMENT,
): PendingReturnRow[] {
  return pendingFromBalances(Object.values(balances(entries, increment)), households);
}

/** Same as pendingReturns, from balances already aggregated elsewhere (e.g. by SQL). */
export function pendingFromBalances(bals: readonly Balance[], households: readonly Household[] = []): PendingReturnRow[] {
  const byId = new Map(households.map((h) => [h.id, h]));
  return bals
    .filter((b) => b.totalReceived > b.totalGiven)
    .map((b) => ({
      householdId: b.householdId,
      household: byId.get(b.householdId),
      receivedPaise: b.totalReceived,
      givenPaise: b.totalGiven,
      pendingPaise: b.totalReceived - b.totalGiven,
      suggestedNext: b.suggestedNext,
    }))
    .sort((a, b) => b.pendingPaise - a.pendingPaise);
}

/** Overall totals across active entries. */
export function totals(entries: readonly Entry[]): { receivedPaise: number; givenPaise: number } {
  let receivedPaise = 0;
  let givenPaise = 0;
  for (const e of activeEntries(entries)) {
    if (e.direction === 'AAYA') receivedPaise += entryValuePaise(e);
    else givenPaise += entryValuePaise(e);
  }
  return { receivedPaise, givenPaise };
}

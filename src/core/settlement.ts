import { entryValuePaise, sortChronological, activeEntries } from './ledger';
import { formatINR } from './money';
import type { Direction, Entry } from './types';

/**
 * उतार / चढ़ाव (both-sided accounting). For each active entry, against the running balance with the SAME household
 * (chronological: diary date, then createdAt):
 *   net = received - given so far.  net > 0: I still owe them a return.  net < 0: they still owe me.
 *   I GIVE (GAYA) v:  उतार = the part that repays what I owed (min(v, max(net, 0))), चढ़ाव = the rest (new amount they will owe back).
 *   I RECEIVE (AAYA) v: symmetric, against what they owed me (min(v, max(-net, 0))).
 * Example: they gave me 501 earlier, I give 701: उतार 501, चढ़ाव 200. In-kind items count at their estimated value.
 */
export function splitAgainstBalance(direction: Direction, valuePaise: number, netBefore: number): { utarPaise: number; chadhavPaise: number } {
  const open = direction === 'GAYA' ? Math.max(netBefore, 0) : Math.max(-netBefore, 0);
  const utarPaise = Math.min(valuePaise, open);
  return { utarPaise, chadhavPaise: valuePaise - utarPaise };
}

export interface Settlement {
  entry: Entry;
  householdId: string;
  valuePaise: number;
  utarPaise: number;
  chadhavPaise: number;
  /** received - given with this household before / after this entry. */
  netBefore: number;
  netAfter: number;
}

/** Settlement rows for every active entry, in chronological order. Superseded entries and voids are ignored (as everywhere). */
export function settleEntries(entries: readonly Entry[]): Settlement[] {
  const net = new Map<string, number>();
  return sortChronological(activeEntries(entries)).map((entry) => {
    const valuePaise = entryValuePaise(entry);
    const netBefore = net.get(entry.otherHouseholdId) ?? 0;
    const { utarPaise, chadhavPaise } = splitAgainstBalance(entry.direction, valuePaise, netBefore);
    const netAfter = netBefore + (entry.direction === 'AAYA' ? valuePaise : -valuePaise);
    net.set(entry.otherHouseholdId, netAfter);
    return { entry, householdId: entry.otherHouseholdId, valuePaise, utarPaise, chadhavPaise, netBefore, netAfter };
  });
}

export const settlementById = (entries: readonly Entry[]): Map<string, Settlement> =>
  new Map(settleEntries(entries).map((s) => [s.entry.id, s]));

export interface UtarChadhavTotals {
  utarPaise: number;
  chadhavPaise: number;
}
export function sumUtarChadhav(rows: readonly { utarPaise: number; chadhavPaise: number }[]): UtarChadhavTotals {
  let utarPaise = 0;
  let chadhavPaise = 0;
  for (const r of rows) {
    utarPaise += r.utarPaise;
    chadhavPaise += r.chadhavPaise;
  }
  return { utarPaise, chadhavPaise };
}

/** "इसमें ₹501 उतार और ₹200 चढ़ाव" (parts that are zero are left out; '' when both are zero). */
export function utarChadhavText(utarPaise: number, chadhavPaise: number): string {
  const parts: string[] = [];
  if (utarPaise > 0) parts.push(`${formatINR(utarPaise)} उतार`);
  if (chadhavPaise > 0) parts.push(`${formatINR(chadhavPaise)} चढ़ाव`);
  return parts.length ? `इसमें ${parts.join(' और ')}` : '';
}

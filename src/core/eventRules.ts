import type { Direction, Entry, NotraEvent } from './types';

/**
 * The two separate worlds:
 *  - मेरा नोतरा: events hosted by MY household. Here I only RECEIVE (AAYA).
 *  - दूसरों का नोतरा: events hosted by another household. Here I only GIVE (GAYA).
 * Every entry belongs to an event, and its direction is DERIVED from who hosts that event; nobody chooses it.
 */
export const directionForHost = (hostHouseholdId: string, myHouseholdId: string): Direction =>
  hostHouseholdId === myHouseholdId ? 'AAYA' : 'GAYA';

export const isMyEvent = (e: Pick<NotraEvent, 'hostHouseholdId'>, myHouseholdId: string | null): boolean =>
  myHouseholdId === null || e.hostHouseholdId === myHouseholdId;

export type EntryRuleResult = { ok: true } | { ok: false; reason: 'NO_EVENT' | 'UNKNOWN_EVENT' | 'WRONG_DIRECTION' };

/**
 * May this NEW entry be written? Voids and corrections that keep the target's event and direction are exempt (`target`),
 * so old data can always be corrected or undone. When "my household" is not known yet only the event is required.
 * The same rule is a database trigger (migration v7) and a server check (sync push).
 */
export function checkEntryRule(
  entry: Pick<Entry, 'direction' | 'eventId' | 'isVoid'>,
  event: Pick<NotraEvent, 'hostHouseholdId'> | null | undefined,
  myHouseholdId: string | null,
  target?: Pick<Entry, 'direction' | 'eventId'> | null,
): EntryRuleResult {
  if (!entry.eventId) return { ok: false, reason: 'NO_EVENT' };
  if (!event) return { ok: false, reason: 'UNKNOWN_EVENT' };
  if (entry.isVoid) return { ok: true };
  if (target && target.eventId === entry.eventId && target.direction === entry.direction) return { ok: true };
  if (myHouseholdId && directionForHost(event.hostHouseholdId, myHouseholdId) !== entry.direction) return { ok: false, reason: 'WRONG_DIRECTION' };
  return { ok: true };
}

/**
 * Old data: entries written before every entry needed an event are attached to an automatic "पुराना हिसाब" event.
 * Mine (AAYA): one per ledger, hosted by me. Given (GAYA): one per household and ledger, hosted by that household.
 * The ids are deterministic (the same text is built in the v7 migration SQL), so two phones agree.
 */
export const LEGACY_MINE_PREFIX = 'a1a1a1a1-';
export const LEGACY_THEIRS_PREFIX = 'b2b2b2b2-';
export const LEGACY_EVENT_LABEL = 'पुराना हिसाब';

export function legacyEventId(direction: Direction, ledgerId: string, householdId: string): string {
  if (direction === 'AAYA') return LEGACY_MINE_PREFIX + ledgerId.slice(9);
  const h = householdId;
  return `${LEGACY_THEIRS_PREFIX}${h.slice(9, 13)}-${h.slice(14, 18)}-${h.slice(19, 23)}-${ledgerId.slice(24, 36)}`;
}

export const isLegacyEventId = (id: string): boolean => id.startsWith(LEGACY_MINE_PREFIX) || id.startsWith(LEGACY_THEIRS_PREFIX);

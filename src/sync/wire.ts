import type { Increment } from '../core';

/** Wire format shared with server/ (camelCase JSON). Photos and voice notes are not synced yet. PINs never are. */
export interface WireLedger {
  id: string; name: string; kind: string; createdAt: string; updatedAt: string;
}
export interface WireHousehold {
  id: string; headName: string; fatherName: string; jati: string; atak?: string; village: string; fala?: string;
  panchayat?: string; tehsil?: string; district?: string; kind?: string;
  phone: string | null; createdAt: string; updatedAt: string;
}
export interface WireEvent {
  id: string; hostHouseholdId: string; occasion: string; date: string; panchApproved: boolean; invitationType: string;
  status: string; ledgerId: string; createdAt: string; updatedAt: string;
  /** custom name + details for OTHER ("अन्य"); null/absent otherwise */
  occasionLabel?: string | null; occasionNote?: string | null;
}
export interface WireEntry {
  id: string; eventId: string | null; otherHouseholdId: string; direction: string; cashPaise: number;
  inKindItem: string | null; inKindValuePaise: number; paymentMode: string; recordedBy: string; createdAt: string;
  correctsEntryId: string | null; isVoid: boolean; ledgerId: string;
  /** The diary date (YYYY-MM-DD). Older servers/backups may omit it: then it is the date part of createdAt. */
  occurredOn?: string;
}
/** "My household" and the village increment: one small row per account, last write wins. */
export interface WireProfile {
  myHouseholdId: string | null;
  increment: Increment | null;
  updatedAt: string;
}
export interface Batch {
  ledgers: WireLedger[];
  households: WireHousehold[];
  events: WireEvent[];
  entries: WireEntry[];
  profile?: WireProfile;
}
export interface PullPage {
  ledgers: WireLedger[];
  households: WireHousehold[];
  events: WireEvent[];
  entries: WireEntry[];
  profile: WireProfile | null;
  nextCursor: number;
  hasMore: boolean;
}

export type RejectTable = 'ledgers' | 'households' | 'events' | 'entries' | 'profile';
/** One row the server refused (bad data). `index` is its position in the array that was pushed for `table`. */
export interface Rejection {
  table: RejectTable;
  id: string | null;
  index: number;
  reason: string;
}
export interface PushResult {
  rejected: Rejection[];
}

/** The server compares updated_at as text, so always send fixed-width ISO (YYYY-MM-DDTHH:mm:ss.sssZ). */
export function isoMs(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
}

export interface LedgerRow {
  id: string; name: string; kind: string; created_at: string; updated_at: string;
}
export interface HouseholdRow {
  id: string; head_name: string; father_name: string; jati: string; atak: string; village: string; fala: string;
  panchayat: string; tehsil: string; district: string; kind: string;
  phone: string | null; created_at: string; updated_at: string;
}
export interface EventRow {
  id: string; host_household_id: string; occasion: string; date: string; panch_approved: number; invitation_type: string;
  status: string; ledger_id: string; created_at: string; updated_at: string; occasion_label: string | null; occasion_note: string | null;
}
export interface EntryRow {
  id: string; event_id: string | null; other_household_id: string; direction: string; cash_paise: number;
  in_kind_item: string | null; in_kind_value_paise: number; payment_mode: string; recorded_by: string; created_at: string;
  corrects_entry_id: string | null; is_void: number; ledger_id: string; occurred_on: string;
}

export const ledgerToWire = (r: LedgerRow): WireLedger => ({
  id: r.id, name: r.name, kind: r.kind, createdAt: isoMs(r.created_at), updatedAt: isoMs(r.updated_at),
});
export const householdToWire = (r: HouseholdRow): WireHousehold => ({
  id: r.id, headName: r.head_name, fatherName: r.father_name, jati: r.jati, atak: r.atak, village: r.village, fala: r.fala,
  panchayat: r.panchayat, tehsil: r.tehsil, district: r.district, kind: r.kind,
  phone: r.phone, createdAt: isoMs(r.created_at), updatedAt: isoMs(r.updated_at),
});
export const eventToWire = (r: EventRow): WireEvent => ({
  id: r.id, hostHouseholdId: r.host_household_id, occasion: r.occasion, date: r.date, panchApproved: r.panch_approved === 1,
  invitationType: r.invitation_type, status: r.status, ledgerId: r.ledger_id, createdAt: isoMs(r.created_at), updatedAt: isoMs(r.updated_at),
  occasionLabel: r.occasion_label, occasionNote: r.occasion_note,
});
export const entryToWire = (r: EntryRow): WireEntry => ({
  id: r.id, eventId: r.event_id, otherHouseholdId: r.other_household_id, direction: r.direction, cashPaise: r.cash_paise,
  inKindItem: r.in_kind_item, inKindValuePaise: r.in_kind_value_paise, paymentMode: r.payment_mode, recordedBy: r.recorded_by,
  createdAt: r.created_at, correctsEntryId: r.corrects_entry_id, isVoid: r.is_void === 1, ledgerId: r.ledger_id, occurredOn: r.occurred_on,
});

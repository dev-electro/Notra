/** Wire format shared with server/ (camelCase JSON). Photos and voice notes are not synced yet. */
export interface WireHousehold {
  id: string; headName: string; fatherName: string; jati: string; atak: string; village: string; fala: string;
  phone: string | null; createdAt: string; updatedAt: string;
}
export interface WireEvent {
  id: string; hostHouseholdId: string; occasion: string; date: string; panchApproved: boolean; invitationType: string;
  status: string; createdAt: string; updatedAt: string;
}
export interface WireEntry {
  id: string; eventId: string | null; otherHouseholdId: string; direction: string; cashPaise: number;
  inKindItem: string | null; inKindValuePaise: number; paymentMode: string; recordedBy: string; createdAt: string;
  correctsEntryId: string | null; isVoid: boolean;
}
export interface Batch {
  households: WireHousehold[];
  events: WireEvent[];
  entries: WireEntry[];
}
export interface PullPage extends Batch {
  nextCursor: number;
  hasMore: boolean;
}

/** The server compares updated_at as text, so always send fixed-width ISO (YYYY-MM-DDTHH:mm:ss.sssZ). */
export function isoMs(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
}

export interface HouseholdRow {
  id: string; head_name: string; father_name: string; jati: string; atak: string; village: string; fala: string;
  phone: string | null; created_at: string; updated_at: string;
}
export interface EventRow {
  id: string; host_household_id: string; occasion: string; date: string; panch_approved: number; invitation_type: string;
  status: string; created_at: string; updated_at: string;
}
export interface EntryRow {
  id: string; event_id: string | null; other_household_id: string; direction: string; cash_paise: number;
  in_kind_item: string | null; in_kind_value_paise: number; payment_mode: string; recorded_by: string; created_at: string;
  corrects_entry_id: string | null; is_void: number;
}

export const householdToWire = (r: HouseholdRow): WireHousehold => ({
  id: r.id, headName: r.head_name, fatherName: r.father_name, jati: r.jati, atak: r.atak, village: r.village, fala: r.fala,
  phone: r.phone, createdAt: isoMs(r.created_at), updatedAt: isoMs(r.updated_at),
});
export const eventToWire = (r: EventRow): WireEvent => ({
  id: r.id, hostHouseholdId: r.host_household_id, occasion: r.occasion, date: r.date, panchApproved: r.panch_approved === 1,
  invitationType: r.invitation_type, status: r.status, createdAt: isoMs(r.created_at), updatedAt: isoMs(r.updated_at),
});
export const entryToWire = (r: EntryRow): WireEntry => ({
  id: r.id, eventId: r.event_id, otherHouseholdId: r.other_household_id, direction: r.direction, cashPaise: r.cash_paise,
  inKindItem: r.in_kind_item, inKindValuePaise: r.in_kind_value_paise, paymentMode: r.payment_mode, recordedBy: r.recorded_by,
  createdAt: r.created_at, correctsEntryId: r.corrects_entry_id, isVoid: r.is_void === 1,
});

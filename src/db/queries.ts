import {
  Balance,
  Direction,
  Entry,
  Household,
  Increment,
  Occasion,
  isLegacyEventId,
  parseSearch,
  phoneSearchDigits,
  OccasionRow,
  SelfLedgerRow,
  suggestReturn,
} from '../core';
import type { Db } from './types';

/**
 * Aggregate queries: totals, balances and reports are computed by SQLite (GROUP BY / window functions over
 * indexed columns) instead of loading every entry into JS. `src/core` stays the tested reference; the
 * db tests assert both produce identical results. Superseded (corrected) entries are excluded through the
 * `active_entries` view.
 */

const VAL = '(cash_paise + in_kind_value_paise)';

export async function sqlTotals(db: Db, ledgerId: string): Promise<{ receivedPaise: number; givenPaise: number }> {
  const r = await db.getFirstAsync<{ rec: number | null; giv: number | null }>(
    `SELECT SUM(CASE WHEN direction='AAYA' THEN ${VAL} END) AS rec,
            SUM(CASE WHEN direction='GAYA' THEN ${VAL} END) AS giv FROM active_entries WHERE ledger_id = ?`,
    [ledgerId],
  );
  return { receivedPaise: r?.rec ?? 0, givenPaise: r?.giv ?? 0 };
}

type BalanceRow = {
  h: string; recv: number; given: number; last_recv: number | null; last_given: number | null;
  last_recv_at: string | null; last_given_at: string | null;
};

/** Per other-household Lena-Dena balances in one ledger (all households, or one). Equivalent to core `balances`. */
export async function sqlBalances(db: Db, increment: Increment, ledgerId: string, householdId?: string): Promise<Balance[]> {
  const rows = await db.getAllAsync<BalanceRow>(
    `WITH ranked AS (
       SELECT other_household_id AS h, direction AS d, ${VAL} AS v, created_at AS t,
              ROW_NUMBER() OVER (PARTITION BY other_household_id, direction ORDER BY occurred_on DESC, created_at DESC, rid DESC) AS rn
       FROM active_entries WHERE ledger_id = ? ${householdId ? 'AND other_household_id = ?' : ''}
     )
     SELECT h,
       SUM(CASE WHEN d='AAYA' THEN v ELSE 0 END) AS recv,
       SUM(CASE WHEN d='GAYA' THEN v ELSE 0 END) AS given,
       MAX(CASE WHEN d='AAYA' AND rn=1 THEN v END) AS last_recv,
       MAX(CASE WHEN d='GAYA' AND rn=1 THEN v END) AS last_given,
       MAX(CASE WHEN d='AAYA' AND rn=1 THEN t END) AS last_recv_at,
       MAX(CASE WHEN d='GAYA' AND rn=1 THEN t END) AS last_given_at
     FROM ranked GROUP BY h`,
    householdId ? [ledgerId, householdId] : [ledgerId],
  );
  return rows.map((r) => ({
    householdId: r.h,
    totalReceived: r.recv,
    totalGiven: r.given,
    lastReceived: r.last_recv ?? 0,
    lastGiven: r.last_given ?? 0,
    lastReceivedAt: r.last_recv_at,
    lastGivenAt: r.last_given_at,
    suggestedNext: suggestReturn(r.last_recv ?? 0, increment),
  }));
}

export async function sqlOccasionWise(db: Db, ledgerId: string): Promise<OccasionRow[]> {
  const rows = await db.getAllAsync<{ occasion: Occasion; given: number; recv: number; n: number; events: number }>(
    `SELECT COALESCE(ev.occasion, 'OTHER') AS occasion,
            SUM(CASE WHEN e.direction='GAYA' THEN e.cash_paise + e.in_kind_value_paise ELSE 0 END) AS given,
            SUM(CASE WHEN e.direction='AAYA' THEN e.cash_paise + e.in_kind_value_paise ELSE 0 END) AS recv,
            COUNT(*) AS n, COUNT(DISTINCT ev.id) AS events
     FROM active_entries e LEFT JOIN events ev ON ev.id = e.event_id
     WHERE e.ledger_id = ?
     GROUP BY 1 ORDER BY 1`,
    [ledgerId],
  );
  return rows.map((r) => ({
    occasion: r.occasion, totalGiven: r.given, totalReceived: r.recv, entryCount: r.n, eventCount: r.events,
  }));
}

type EntryRow = {
  id: string; event_id: string | null; other_household_id: string; direction: Direction;
  cash_paise: number; in_kind_item: string | null; in_kind_value_paise: number;
  payment_mode: Entry['paymentMode']; recorded_by: string; voice_note_uri: string | null;
  created_at: string; occurred_on: string; corrects_entry_id: string | null; is_void?: number; superseded?: number; ledger_id?: string;
  h_name?: string; h_father?: string; h_village?: string; h_photo?: string | null;
};
const toEntry = (r: EntryRow): Entry => ({
  id: r.id, eventId: r.event_id ?? undefined, otherHouseholdId: r.other_household_id,
  direction: r.direction, cashPaise: r.cash_paise, inKindItem: r.in_kind_item ?? undefined,
  inKindValuePaise: r.in_kind_value_paise, paymentMode: r.payment_mode, recordedBy: r.recorded_by,
  voiceNoteUri: r.voice_note_uri ?? undefined, createdAt: r.created_at, occurredOn: r.occurred_on,
  correctsEntryId: r.corrects_entry_id ?? undefined, isVoid: r.is_void === 1 ? true : undefined, ledgerId: r.ledger_id,
});

export interface EntryPageOptions {
  /** Required: every list is scoped to one ledger. */
  ledgerId: string;
  householdId?: string;
  eventId?: string;
  direction?: Direction;
  /** true: only entries that still count (default false: full history incl. superseded, flagged). */
  activeOnly?: boolean;
  limit: number;
  offset?: number;
}

export type EntryWithState = Entry & {
  superseded: boolean;
  /** Who the entry is with (joined), so lists can show name + father + village without a second query. */
  who: { headName: string; fatherName: string; village: string; photoUri?: string };
  /** The program (event) the entry belongs to. */
  program?: { occasion: Occasion; label?: string; date: string; hostHouseholdId: string; legacy: boolean };
  /** उतार / चढ़ाव of this entry against the running balance with the same household; null for superseded entries. */
  utarPaise: number | null;
  chadhavPaise: number | null;
};

/**
 * net (received - given) with the same household BEFORE row `e`, over active entries in diary order. Index-friendly: it only reads
 * that household's entries (idx_entries_other_occ). The window-function view `entry_settlement` gives the same numbers for whole reports.
 */
const NET_BEFORE = (e: string) => `(SELECT COALESCE(SUM(CASE WHEN x.direction = 'AAYA' THEN x.cash_paise + x.in_kind_value_paise ELSE -(x.cash_paise + x.in_kind_value_paise) END), 0)
  FROM active_entries x WHERE x.ledger_id = ${e}.ledger_id AND x.other_household_id = ${e}.other_household_id
    AND (x.occurred_on, x.created_at, x.rid) < (${e}.occurred_on, ${e}.created_at, ${e}.rowid))`;

type PageRow = EntryRow & { nb: number; ev_occasion: Occasion | null; ev_date: string | null; ev_host: string | null; ev_label: string | null };

/** Newest-first (diary date) page of entries. Full history keeps corrected entries, flagged `superseded`. */
export async function listEntriesPage(db: Db, o: EntryPageOptions): Promise<EntryWithState[]> {
  const where: string[] = ['e.is_void = 0', 'e.ledger_id = ?']; // void rows are bookkeeping, never shown
  const params: (string | number)[] = [o.ledgerId];
  if (o.householdId) { where.push('e.other_household_id = ?'); params.push(o.householdId); }
  if (o.eventId) { where.push('e.event_id = ?'); params.push(o.eventId); }
  if (o.direction) { where.push('e.direction = ?'); params.push(o.direction); }
  if (o.activeOnly) where.push('NOT EXISTS (SELECT 1 FROM entries c WHERE c.corrects_entry_id = e.id)');
  const rows = await db.getAllAsync<PageRow>(
    `SELECT e.*, EXISTS (SELECT 1 FROM entries c WHERE c.corrects_entry_id = e.id) AS superseded,
            ${NET_BEFORE('e')} AS nb,
            h.head_name AS h_name, h.father_name AS h_father, h.village AS h_village, h.photo_uri AS h_photo,
            ev.occasion AS ev_occasion, ev.date AS ev_date, ev.host_household_id AS ev_host, ev.occasion_label AS ev_label
     FROM entries e JOIN households h ON h.id = e.other_household_id LEFT JOIN events ev ON ev.id = e.event_id
     WHERE ${where.join(' AND ')}
     ORDER BY e.occurred_on DESC, e.created_at DESC, e.rowid DESC LIMIT ? OFFSET ?`,
    [...params, o.limit, o.offset ?? 0],
  );
  return rows.map((r) => {
    const superseded = r.superseded === 1;
    const val = r.cash_paise + r.in_kind_value_paise;
    const utar = superseded ? null : Math.min(val, Math.max(r.direction === 'GAYA' ? r.nb : -r.nb, 0));
    return {
      ...toEntry(r),
      superseded,
      who: { headName: r.h_name ?? '', fatherName: r.h_father ?? '', village: r.h_village ?? '', photoUri: r.h_photo ?? undefined },
      program: r.ev_occasion && r.ev_date && r.ev_host && r.event_id
        ? { occasion: r.ev_occasion, label: r.ev_label ?? undefined, date: r.ev_date, hostHouseholdId: r.ev_host, legacy: isLegacyEventId(r.event_id) }
        : undefined,
      utarPaise: utar,
      chadhavPaise: utar === null ? null : val - utar,
    };
  });
}

/** उतार / चढ़ाव of one entry (what the read-back says right after saving). Uses the same numbers as the reports. */
export async function sqlEntrySettlement(db: Db, entryId: string): Promise<{ utarPaise: number; chadhavPaise: number }> {
  const r = await db.getFirstAsync<{ val: number; direction: Direction; nb: number }>(
    `SELECT e.cash_paise + e.in_kind_value_paise AS val, e.direction AS direction, ${NET_BEFORE('e')} AS nb FROM entries e WHERE e.id = ?`,
    [entryId],
  );
  if (!r) return { utarPaise: 0, chadhavPaise: 0 };
  const utarPaise = Math.min(r.val, Math.max(r.direction === 'GAYA' ? r.nb : -r.nb, 0));
  return { utarPaise, chadhavPaise: r.val - utarPaise };
}

/** Self ledger, newest first, with the running (received - given) balance, paginated. */
export async function sqlSelfLedgerPage(
  db: Db, ledgerId: string, limit: number, offset = 0, range: { from?: string; to?: string } = {},
): Promise<SelfLedgerRow[]> {
  const rows = await db.getAllAsync<EntryRow & { delta: number; running: number }>(
    `SELECT * FROM (
       SELECT a.*, CASE WHEN a.direction='AAYA' THEN ${VAL} ELSE -${VAL} END AS delta,
              SUM(CASE WHEN a.direction='AAYA' THEN ${VAL} ELSE -${VAL} END)
                OVER (ORDER BY a.occurred_on, a.created_at, a.rid ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running
       FROM active_entries a WHERE a.ledger_id = ?
     ) WHERE occurred_on >= ? AND occurred_on <= ? ORDER BY occurred_on DESC, created_at DESC, rid DESC LIMIT ? OFFSET ?`,
    [ledgerId, range.from ?? '0000-01-01', range.to ?? '9999-12-31', limit, offset],
  );
  return rows.map((r) => ({ entry: toEntry(r), delta: r.delta, runningBalance: r.running }));
}

export interface EventSummary {
  eventId: string;
  receivedPaise: number;
  givenPaise: number;
  giverCount: number;
  entryCount: number;
}

/** Totals per event (active entries only), keyed by event id. */
export async function sqlEventSummaries(db: Db, ledgerId: string): Promise<Record<string, EventSummary>> {
  const rows = await db.getAllAsync<{ id: string; rec: number; giv: number; givers: number; n: number }>(
    `SELECT event_id AS id,
       SUM(CASE WHEN direction='AAYA' THEN ${VAL} ELSE 0 END) AS rec,
       SUM(CASE WHEN direction='GAYA' THEN ${VAL} ELSE 0 END) AS giv,
       COUNT(DISTINCT other_household_id) AS givers, COUNT(*) AS n
     FROM active_entries WHERE event_id IS NOT NULL AND ledger_id = ? GROUP BY event_id`,
    [ledgerId],
  );
  const out: Record<string, EventSummary> = {};
  for (const r of rows) {
    out[r.id] = { eventId: r.id, receivedPaise: r.rec, givenPaise: r.giv, giverCount: r.givers, entryCount: r.n };
  }
  return out;
}

type HRow = {
  id: string; head_name: string; father_name: string; jati: string; atak: string; village: string;
  fala: string; phone: string | null; photo_uri: string | null; created_at: string; updated_at: string;
};

const PHONE_DIGITS = "replace(replace(replace(replace(replace(replace(COALESCE(phone, ''), ' ', ''), '-', ''), '+', ''), '(', ''), ')', ''), '.', '')";

/**
 * ONE search box over name, father's name, village, fala and phone. Words are ANDed: "Mohan Kherwa" finds Mohan of Kherwa.
 * A box that looks like a phone number ("+91 98765 43210", "098765...") searches the phone digits only. Substring, case-insensitive
 * for Latin. Ordering puts names that START with the first word first. Equivalent to core `matchesSearch`.
 * The tables carry indexes on name, father, village, fala and phone; the substring test itself scans the (small) households table.
 */
export async function searchHouseholds(db: Db, query: string, limit: number, offset = 0): Promise<Household[]> {
  const ps = parseSearch(query);
  const params: (string | number)[] = [];
  const conds: string[] = [];
  if (ps.phone) {
    conds.push(`instr(${PHONE_DIGITS}, ?) > 0`);
    params.push(ps.phone);
  } else {
    for (const tok of ps.tokens) {
      const digits = /^\d{3,}$/.test(tok) ? phoneSearchDigits(tok) : '';
      conds.push(`(instr(lower(head_name), ?) > 0 OR instr(lower(father_name), ?) > 0 OR instr(lower(village), ?) > 0 OR instr(lower(fala), ?) > 0${digits ? ` OR instr(${PHONE_DIGITS}, ?) > 0` : ''})`);
      params.push(tok, tok, tok, tok);
      if (digits) params.push(tok.replace(/\D/g, ''));
    }
  }
  const first = ps.tokens[0];
  const order = first ? 'CASE WHEN instr(lower(head_name), ?) = 1 THEN 0 ELSE 1 END, ' : '';
  if (first) params.push(first);
  const rows = await db.getAllAsync<HRow>(
    `SELECT * FROM households ${conds.length ? `WHERE ${conds.join(' AND ')}` : ''}
     ORDER BY ${order}head_name COLLATE NOCASE, rowid LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  return rows.map((r) => ({
    id: r.id, headName: r.head_name, fatherName: r.father_name, jati: r.jati, atak: r.atak, village: r.village,
    fala: r.fala, phone: r.phone ?? undefined, photoUri: r.photo_uri ?? undefined,
    createdAt: r.created_at, updatedAt: r.updated_at,
  }));
}

export interface EventTotals {
  cashPaise: number;
  inKindValuePaise: number;
  totalPaise: number;
  giverCount: number;
  entryCount: number;
}

/** Running totals for one event's received (AAYA) entries: cheap, indexed, used by the event ledger screen. */
export async function sqlEventTotals(db: Db, eventId: string): Promise<EventTotals> {
  const r = await db.getFirstAsync<{ cash: number | null; kind: number | null; givers: number; n: number }>(
    `SELECT SUM(cash_paise) AS cash, SUM(in_kind_value_paise) AS kind,
            COUNT(DISTINCT other_household_id) AS givers, COUNT(*) AS n
     FROM active_entries WHERE event_id = ? AND direction = 'AAYA'`,
    [eventId],
  );
  const cash = r?.cash ?? 0;
  const kind = r?.kind ?? 0;
  return { cashPaise: cash, inKindValuePaise: kind, totalPaise: cash + kind, giverCount: r?.givers ?? 0, entryCount: r?.n ?? 0 };
}

/** The newest entry of the event that still counts (what "undo" removes), or null. */
export async function lastActiveEntryForEvent(db: Db, eventId: string): Promise<Entry | null> {
  const r = await db.getFirstAsync<EntryRow>(
    `SELECT * FROM active_entries WHERE event_id = ? AND direction = 'AAYA' ORDER BY created_at DESC, rid DESC LIMIT 1`,
    [eventId],
  );
  return r ? toEntry(r) : null;
}

export interface EventCard {
  event: {
    id: string; hostHouseholdId: string; occasion: Occasion; occasionLabel?: string; date: string; status: string; panchApproved: boolean; legacy: boolean;
  };
  host: { headName: string; fatherName: string; village: string };
  receivedPaise: number;
  givenPaise: number;
  giverCount: number;
  entryCount: number;
}

type EventCardRow = {
  id: string; host: string; occasion: Occasion; date: string; status: string; panch: number;
  h_name: string; h_father: string; h_village: string; rec: number | null; giv: number | null; givers: number; n: number;
  label: string | null;
};
const toCard = (r: EventCardRow): EventCard => ({
  event: { id: r.id, hostHouseholdId: r.host, occasion: r.occasion, occasionLabel: r.label ?? undefined, date: r.date, status: r.status, panchApproved: r.panch === 1, legacy: isLegacyEventId(r.id) },
  host: { headName: r.h_name, fatherName: r.h_father, village: r.h_village },
  receivedPaise: r.rec ?? 0, givenPaise: r.giv ?? 0, giverCount: r.givers, entryCount: r.n,
});

/**
 * Programs with their totals. mine = events hosted by my household (मेरा नोतरा, where I only receive); otherwise the events of other
 * families (दूसरों का नोतरा, where I only give). Newest date first. Optional date window (for the calendar).
 */
export async function sqlEventCards(
  db: Db, ledgerId: string, myId: string | null,
  o: { mine: boolean; limit?: number; offset?: number; from?: string; to?: string; onlyWithEntries?: boolean },
): Promise<EventCard[]> {
  const host = o.mine
    ? (myId ? 'ev.host_household_id = ?' : '1 = 1')
    : (myId ? 'ev.host_household_id <> ?' : '1 = 1');
  const params: (string | number)[] = [ledgerId];
  if (myId) params.push(myId);
  params.push(o.from ?? '0000-01-01', o.to ?? '9999-12-31', o.limit ?? 1000000, o.offset ?? 0);
  const rows = await db.getAllAsync<EventCardRow>(
    `SELECT ev.id AS id, ev.host_household_id AS host, ev.occasion AS occasion, ev.date AS date, ev.status AS status,
            ev.panch_approved AS panch, ev.occasion_label AS label, h.head_name AS h_name, h.father_name AS h_father, h.village AS h_village,
            SUM(CASE WHEN a.direction = 'AAYA' THEN a.cash_paise + a.in_kind_value_paise END) AS rec,
            SUM(CASE WHEN a.direction = 'GAYA' THEN a.cash_paise + a.in_kind_value_paise END) AS giv,
            COUNT(DISTINCT a.other_household_id) AS givers, COUNT(a.id) AS n
     FROM events ev JOIN households h ON h.id = ev.host_household_id LEFT JOIN active_entries a ON a.event_id = ev.id
     WHERE ev.ledger_id = ? AND ${host} AND ev.date >= ? AND ev.date <= ?
     GROUP BY ev.id ${o.onlyWithEntries ? 'HAVING COUNT(a.id) > 0' : ''}
     ORDER BY ev.date DESC, ev.created_at DESC LIMIT ? OFFSET ?`,
    params,
  );
  return rows.map(toCard);
}

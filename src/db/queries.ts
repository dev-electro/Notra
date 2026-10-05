import {
  Balance,
  Direction,
  Entry,
  Household,
  Increment,
  Occasion,
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
              ROW_NUMBER() OVER (PARTITION BY other_household_id, direction ORDER BY created_at DESC, rid DESC) AS rn
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
  created_at: string; corrects_entry_id: string | null; is_void?: number; superseded?: number; ledger_id?: string;
  h_name?: string; h_father?: string; h_village?: string; h_photo?: string | null;
};
const toEntry = (r: EntryRow): Entry => ({
  id: r.id, eventId: r.event_id ?? undefined, otherHouseholdId: r.other_household_id,
  direction: r.direction, cashPaise: r.cash_paise, inKindItem: r.in_kind_item ?? undefined,
  inKindValuePaise: r.in_kind_value_paise, paymentMode: r.payment_mode, recordedBy: r.recorded_by,
  voiceNoteUri: r.voice_note_uri ?? undefined, createdAt: r.created_at,
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
};

/** Newest-first page of entries. Full history keeps corrected entries, flagged `superseded`. */
export async function listEntriesPage(db: Db, o: EntryPageOptions): Promise<EntryWithState[]> {
  const where: string[] = ['e.is_void = 0', 'e.ledger_id = ?']; // void rows are bookkeeping, never shown
  const params: (string | number)[] = [o.ledgerId];
  if (o.householdId) { where.push('e.other_household_id = ?'); params.push(o.householdId); }
  if (o.eventId) { where.push('e.event_id = ?'); params.push(o.eventId); }
  if (o.direction) { where.push('e.direction = ?'); params.push(o.direction); }
  if (o.activeOnly) where.push('NOT EXISTS (SELECT 1 FROM entries c WHERE c.corrects_entry_id = e.id)');
  const rows = await db.getAllAsync<EntryRow>(
    `SELECT e.*, EXISTS (SELECT 1 FROM entries c WHERE c.corrects_entry_id = e.id) AS superseded,
            h.head_name AS h_name, h.father_name AS h_father, h.village AS h_village, h.photo_uri AS h_photo
     FROM entries e JOIN households h ON h.id = e.other_household_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY e.created_at DESC, e.rowid DESC LIMIT ? OFFSET ?`,
    [...params, o.limit, o.offset ?? 0],
  );
  return rows.map((r) => ({
    ...toEntry(r),
    superseded: r.superseded === 1,
    who: { headName: r.h_name ?? '', fatherName: r.h_father ?? '', village: r.h_village ?? '', photoUri: r.h_photo ?? undefined },
  }));
}

/** Self ledger, newest first, with the running (received - given) balance, paginated. */
export async function sqlSelfLedgerPage(db: Db, ledgerId: string, limit: number, offset = 0): Promise<SelfLedgerRow[]> {
  const rows = await db.getAllAsync<EntryRow & { delta: number; running: number }>(
    `SELECT * FROM (
       SELECT a.*, CASE WHEN a.direction='AAYA' THEN ${VAL} ELSE -${VAL} END AS delta,
              SUM(CASE WHEN a.direction='AAYA' THEN ${VAL} ELSE -${VAL} END)
                OVER (ORDER BY a.created_at, a.rid ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running
       FROM active_entries a WHERE a.ledger_id = ?
     ) ORDER BY created_at DESC, rid DESC LIMIT ? OFFSET ?`,
    [ledgerId, limit, offset],
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

/** Paged household search over name, father's name and village (substring, case-insensitive for Latin). */
export async function searchHouseholds(db: Db, query: string, limit: number, offset = 0): Promise<Household[]> {
  const q = query.trim();
  const rows = await db.getAllAsync<HRow>(
    `SELECT * FROM households
     ${q ? 'WHERE instr(lower(head_name), lower(?1)) > 0 OR instr(lower(father_name), lower(?1)) > 0 OR instr(lower(village), lower(?1)) > 0' : ''}
     ORDER BY head_name COLLATE NOCASE, rowid LIMIT ${q ? '?2 OFFSET ?3' : '?1 OFFSET ?2'}`,
    q ? [q, limit, offset] : [limit, offset],
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

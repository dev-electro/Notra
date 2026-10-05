import {
  isLegacyEventId, occasionName,
  type GivenRow, type GivenTotals, type GuestRow, type GuestTotals, type LedgerDocRow, type MonthRow, type NotComeRow,
  type OccasionRow, type Occasion, type PersonDocRow, type YearSummary,
} from '../core';
import { LEGACY_EVENT_LABEL } from '../core';
import type { Db } from './types';

/**
 * Report queries. Everything is aggregated or windowed in SQLite and paged with LIMIT/OFFSET (limit undefined = all rows, used by the
 * PDF/image export). उतार/चढ़ाव comes from the `entry_settlement` view (a running balance per household over ALL history, then the
 * date filter), so a year report never loses what happened before it. src/core/settlement.ts is the tested reference.
 */
export interface Range {
  from?: string;
  to?: string;
}
const lo = (r: Range) => r.from ?? '0000-01-01';
const hi = (r: Range) => r.to ?? '9999-12-31';
const NO_LIMIT = 1_000_000_000;

// ---------- a. किसको, किस दिन, कितना दिया ----------
type GivenSql = {
  occurred_on: string; head_name: string; father_name: string; village: string; occasion: Occasion | null; ev_label: string | null; ev_date: string | null;
  event_id: string | null; cash_paise: number; in_kind_item: string | null; in_kind_value_paise: number; utar: number; chadhav: number;
};
export async function sqlGivenRows(db: Db, ledgerId: string, range: Range, limit = NO_LIMIT, offset = 0): Promise<GivenRow[]> {
  const rows = await db.getAllAsync<GivenSql>(
    `SELECT s.occurred_on, h.head_name, h.father_name, h.village, ev.occasion, ev.occasion_label AS ev_label, ev.date AS ev_date, s.event_id,
            s.cash_paise, s.in_kind_item, s.in_kind_value_paise, s.utar, s.chadhav
     FROM entry_settlement s JOIN households h ON h.id = s.other_household_id LEFT JOIN events ev ON ev.id = s.event_id
     WHERE s.ledger_id = ? AND s.direction = 'GAYA' AND s.occurred_on >= ? AND s.occurred_on <= ?
     ORDER BY s.occurred_on, s.created_at, s.rid LIMIT ? OFFSET ?`,
    [ledgerId, lo(range), hi(range), limit, offset],
  );
  return rows.map((r) => ({
    date: r.occurred_on, name: r.head_name, father: r.father_name, village: r.village, occasion: r.occasion, occasionLabel: r.ev_label, eventDate: r.ev_date,
    legacy: !!r.event_id && isLegacyEventId(r.event_id), cashPaise: r.cash_paise, inKindItem: r.in_kind_item,
    inKindValuePaise: r.in_kind_value_paise, utarPaise: r.utar, chadhavPaise: r.chadhav,
  }));
}
export async function sqlGivenTotals(db: Db, ledgerId: string, range: Range): Promise<GivenTotals> {
  const r = await db.getFirstAsync<{ n: number; v: number | null; u: number | null; c: number | null }>(
    `SELECT COUNT(*) AS n, SUM(val) AS v, SUM(utar) AS u, SUM(chadhav) AS c FROM entry_settlement
     WHERE ledger_id = ? AND direction = 'GAYA' AND occurred_on >= ? AND occurred_on <= ?`,
    [ledgerId, lo(range), hi(range)],
  );
  return { count: r?.n ?? 0, totalPaise: r?.v ?? 0, utarPaise: r?.u ?? 0, chadhavPaise: r?.c ?? 0 };
}

// ---------- b. मेरे प्रोग्राम में कौन आया ----------
type GuestSql = {
  head_name: string; father_name: string; village: string; cash_paise: number; in_kind_item: string | null;
  in_kind_value_paise: number; utar: number; chadhav: number;
};
export async function sqlGuestRows(db: Db, ledgerId: string, eventId: string, limit = NO_LIMIT, offset = 0): Promise<GuestRow[]> {
  const rows = await db.getAllAsync<GuestSql>(
    `SELECT h.head_name, h.father_name, h.village, s.cash_paise, s.in_kind_item, s.in_kind_value_paise, s.utar, s.chadhav
     FROM entry_settlement s JOIN households h ON h.id = s.other_household_id
     WHERE s.ledger_id = ? AND s.event_id = ? AND s.direction = 'AAYA'
     ORDER BY s.occurred_on, s.created_at, s.rid LIMIT ? OFFSET ?`,
    [ledgerId, eventId, limit, offset],
  );
  return rows.map((r) => ({
    name: r.head_name, father: r.father_name, village: r.village, cashPaise: r.cash_paise, inKindItem: r.in_kind_item,
    inKindValuePaise: r.in_kind_value_paise, utarPaise: r.utar, chadhavPaise: r.chadhav,
  }));
}
export async function sqlGuestTotals(db: Db, ledgerId: string, eventId: string): Promise<GuestTotals> {
  const r = await db.getFirstAsync<{ g: number; v: number | null; u: number | null; c: number | null }>(
    `SELECT COUNT(DISTINCT other_household_id) AS g, SUM(val) AS v, SUM(utar) AS u, SUM(chadhav) AS c FROM entry_settlement
     WHERE ledger_id = ? AND event_id = ? AND direction = 'AAYA'`,
    [ledgerId, eventId],
  );
  return { givers: r?.g ?? 0, totalPaise: r?.v ?? 0, utarPaise: r?.u ?? 0, chadhavPaise: r?.c ?? 0 };
}

// ---------- c. साल भर का हिसाब ----------
export async function sqlYearSummary(db: Db, ledgerId: string, myId: string | null, year: number): Promise<YearSummary> {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const months = await db.getAllAsync<{ m: string; giv: number; rec: number; n: number }>(
    `SELECT substr(occurred_on, 6, 2) AS m,
            SUM(CASE WHEN direction = 'GAYA' THEN val ELSE 0 END) AS giv,
            SUM(CASE WHEN direction = 'AAYA' THEN val ELSE 0 END) AS rec, COUNT(*) AS n
     FROM entry_settlement WHERE ledger_id = ? AND occurred_on >= ? AND occurred_on <= ? GROUP BY m`,
    [ledgerId, from, to],
  );
  const by = new Map(months.map((r) => [Number(r.m), r]));
  const monthRows: MonthRow[] = Array.from({ length: 12 }, (_, i) => {
    const r = by.get(i + 1);
    return { month: i + 1, givenPaise: r?.giv ?? 0, receivedPaise: r?.rec ?? 0, entries: r?.n ?? 0 };
  });
  const t = await db.getFirstAsync<{ gu: number | null; gc: number | null; ru: number | null; rc: number | null }>(
    `SELECT SUM(CASE WHEN direction = 'GAYA' THEN utar END) AS gu, SUM(CASE WHEN direction = 'GAYA' THEN chadhav END) AS gc,
            SUM(CASE WHEN direction = 'AAYA' THEN utar END) AS ru, SUM(CASE WHEN direction = 'AAYA' THEN chadhav END) AS rc
     FROM entry_settlement WHERE ledger_id = ? AND occurred_on >= ? AND occurred_on <= ?`,
    [ledgerId, from, to],
  );
  // programs I hosted (event date in the year) and programs of other families where I gave something (entry date in the year)
  const hosted = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM events WHERE ledger_id = ? AND date >= ? AND date <= ? AND (? IS NULL OR host_household_id = ?)`,
    [ledgerId, from, to, myId, myId],
  );
  const attended = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(DISTINCT event_id) AS n FROM entry_settlement WHERE ledger_id = ? AND direction = 'GAYA' AND occurred_on >= ? AND occurred_on <= ?`,
    [ledgerId, from, to],
  );
  return {
    year,
    givenPaise: monthRows.reduce((a, r) => a + r.givenPaise, 0),
    receivedPaise: monthRows.reduce((a, r) => a + r.receivedPaise, 0),
    hosted: hosted?.n ?? 0, attended: attended?.n ?? 0, months: monthRows,
    givenUtar: t?.gu ?? 0, givenChadhav: t?.gc ?? 0, receivedUtar: t?.ru ?? 0, receivedChadhav: t?.rc ?? 0,
  };
}

// ---------- d. मेरे नोतरे में कौन नहीं आया ----------
/**
 * Families I had given to (my net balance with them, given - received, was > 0 on active entries dated BEFORE this event) who have
 * no active entry in the event. My own household is never listed. Biggest बाकी first.
 */
export async function sqlNotCome(
  db: Db, ledgerId: string, myId: string | null, eventId: string, limit = NO_LIMIT, offset = 0,
): Promise<NotComeRow[]> {
  const rows = await db.getAllAsync<{ head_name: string; father_name: string; village: string; net: number }>(
    `WITH ev AS (SELECT date FROM events WHERE id = ?1),
     bal AS (
       SELECT a.other_household_id AS h,
              SUM(CASE WHEN a.direction = 'GAYA' THEN a.cash_paise + a.in_kind_value_paise ELSE -(a.cash_paise + a.in_kind_value_paise) END) AS net
       FROM active_entries a WHERE a.ledger_id = ?2 AND a.occurred_on < (SELECT date FROM ev) AND a.event_id IS NOT ?1
       GROUP BY a.other_household_id HAVING net > 0)
     SELECT hh.head_name, hh.father_name, hh.village, bal.net
     FROM bal JOIN households hh ON hh.id = bal.h
     WHERE (?3 IS NULL OR bal.h <> ?3)
       AND NOT EXISTS (SELECT 1 FROM active_entries x WHERE x.event_id = ?1 AND x.other_household_id = bal.h)
     ORDER BY bal.net DESC, hh.head_name COLLATE NOCASE LIMIT ?4 OFFSET ?5`,
    [eventId, ledgerId, myId, limit, offset],
  );
  return rows.map((r) => ({ name: r.head_name, father: r.father_name, village: r.village, pendingPaise: r.net }));
}
export async function sqlNotComeTotal(db: Db, ledgerId: string, myId: string | null, eventId: string): Promise<{ count: number; pendingPaise: number }> {
  const rows = await sqlNotCome(db, ledgerId, myId, eventId);
  return { count: rows.length, pendingPaise: rows.reduce((a, r) => a + r.pendingPaise, 0) };
}

// ---------- e. person-wise / pending / occasion-wise / household ledger ----------
/**
 * One row per family with what I received and gave inside `range`. pendingOnly: families I still owe a return (received > given),
 * counted over everything up to range.to (a "lautana baaki" as of that day, whatever happened earlier).
 */
export async function sqlPersonRange(
  db: Db, ledgerId: string, range: Range, o: { pendingOnly?: boolean; limit?: number; offset?: number } = {},
): Promise<(PersonDocRow & { householdId: string })[]> {
  const from = o.pendingOnly ? '0000-01-01' : lo(range);
  const rows = await db.getAllAsync<{ h: string; head_name: string; father_name: string; village: string; recv: number; given: number }>(
    `SELECT hh.id AS h, hh.head_name, hh.father_name, hh.village,
            SUM(CASE WHEN a.direction = 'AAYA' THEN a.cash_paise + a.in_kind_value_paise ELSE 0 END) AS recv,
            SUM(CASE WHEN a.direction = 'GAYA' THEN a.cash_paise + a.in_kind_value_paise ELSE 0 END) AS given
     FROM active_entries a JOIN households hh ON hh.id = a.other_household_id
     WHERE a.ledger_id = ? AND a.occurred_on >= ? AND a.occurred_on <= ?
     GROUP BY hh.id ${o.pendingOnly ? 'HAVING recv > given' : ''}
     ORDER BY ${o.pendingOnly ? '(recv - given) DESC, ' : ''}hh.head_name COLLATE NOCASE, hh.rowid LIMIT ? OFFSET ?`,
    [ledgerId, from, hi(range), o.limit ?? NO_LIMIT, o.offset ?? 0],
  );
  return rows.map((r) => ({
    householdId: r.h, name: r.head_name, father: r.father_name, village: r.village, receivedPaise: r.recv, givenPaise: r.given,
  }));
}

export async function sqlOccasionRange(db: Db, ledgerId: string, range: Range): Promise<OccasionRow[]> {
  const rows = await db.getAllAsync<{ occasion: Occasion; given: number; recv: number; n: number; events: number }>(
    `SELECT COALESCE(ev.occasion, 'OTHER') AS occasion,
            SUM(CASE WHEN e.direction = 'GAYA' THEN e.cash_paise + e.in_kind_value_paise ELSE 0 END) AS given,
            SUM(CASE WHEN e.direction = 'AAYA' THEN e.cash_paise + e.in_kind_value_paise ELSE 0 END) AS recv,
            COUNT(*) AS n, COUNT(DISTINCT ev.id) AS events
     FROM active_entries e LEFT JOIN events ev ON ev.id = e.event_id
     WHERE e.ledger_id = ? AND e.occurred_on >= ? AND e.occurred_on <= ? GROUP BY 1 ORDER BY 1`,
    [ledgerId, lo(range), hi(range)],
  );
  return rows.map((r) => ({ occasion: r.occasion, totalGiven: r.given, totalReceived: r.recv, entryCount: r.n, eventCount: r.events }));
}

/** One family's full two-sided ledger, oldest first, with उतार/चढ़ाव and the program of each line. */
export async function sqlHouseholdLedger(db: Db, ledgerId: string, householdId: string): Promise<LedgerDocRow[]> {
  const rows = await db.getAllAsync<{
    occurred_on: string; direction: 'AAYA' | 'GAYA'; occasion: Occasion | null; ev_label: string | null; event_id: string | null; cash_paise: number;
    in_kind_item: string | null; in_kind_value_paise: number; utar: number; chadhav: number;
  }>(
    `SELECT s.occurred_on, s.direction, ev.occasion, ev.occasion_label AS ev_label, s.event_id, s.cash_paise, s.in_kind_item, s.in_kind_value_paise, s.utar, s.chadhav
     FROM entry_settlement s LEFT JOIN events ev ON ev.id = s.event_id
     WHERE s.ledger_id = ? AND s.other_household_id = ? ORDER BY s.occurred_on, s.created_at, s.rid`,
    [ledgerId, householdId],
  );
  return rows.map((r) => ({
    date: r.occurred_on, direction: r.direction,
    program: r.event_id && isLegacyEventId(r.event_id) ? LEGACY_EVENT_LABEL : r.occasion ? occasionName(r.occasion, r.ev_label) : '—',
    cashPaise: r.cash_paise, inKindItem: r.in_kind_item, inKindValuePaise: r.in_kind_value_paise, utarPaise: r.utar, chadhavPaise: r.chadhav,
  }));
}

import type { Db } from '../db/types';
import { applyProfile, getLocalProfile } from './profile';
import { getSyncState } from './state';
import {
  entryToWire, eventToWire, householdToWire, ledgerToWire,
  type Batch, type EntryRow, type EventRow, type HouseholdRow, type LedgerRow, type PullPage, type PushResult,
  type Rejection, type WireProfile,
} from './wire';

export const BATCH = 500;

/** The network, abstracted so the engine is testable. Throws on any failure of the whole request. */
export interface Transport {
  push(batch: Batch): Promise<PushResult>;
  pull(since: number, limit: number): Promise<PullPage>;
}

type DirtyRows = { ledgers: LedgerRow[]; households: HouseholdRow[]; events: EventRow[]; entries: EntryRow[] };

/**
 * Up to `limit` dirty rows in total: ledgers, households, events, then entries (oldest first). Rows the server already
 * rejected (sync_error set) are skipped: a poison row must never block the rows behind it, nor be retried forever.
 */
async function collectDirty(db: Db, limit: number): Promise<DirtyRows> {
  const ledgers = await db.getAllAsync<LedgerRow>(
    `SELECT id, name, kind, created_at, updated_at FROM ledgers
     WHERE dirty = 1 AND sync_error IS NULL ORDER BY updated_at, rowid LIMIT ?`, [limit]);
  const households = await db.getAllAsync<HouseholdRow>(
    `SELECT id, head_name, father_name, jati, atak, village, fala, phone, created_at, updated_at
     FROM households WHERE dirty = 1 AND sync_error IS NULL ORDER BY updated_at, rowid LIMIT ?`, [limit - ledgers.length]);
  const events = await db.getAllAsync<EventRow>(
    `SELECT id, host_household_id, occasion, date, panch_approved, invitation_type, status, ledger_id, created_at, updated_at
     FROM events WHERE dirty = 1 AND sync_error IS NULL ORDER BY updated_at, rowid LIMIT ?`, [limit - ledgers.length - households.length]);
  const entries = await db.getAllAsync<EntryRow>(
    `SELECT id, event_id, other_household_id, direction, cash_paise, in_kind_item, in_kind_value_paise, payment_mode,
            recorded_by, created_at, corrects_entry_id, is_void, ledger_id
     FROM entries WHERE dirty = 1 AND sync_error IS NULL ORDER BY created_at, rowid LIMIT ?`,
    [limit - ledgers.length - households.length - events.length]);
  return { ledgers, households, events, entries };
}

const size = (r: DirtyRows) => r.ledgers.length + r.households.length + r.events.length + r.entries.length;

type RowTable = 'ledgers' | 'households' | 'events' | 'entries';
const idsOf = (r: DirtyRows): Record<RowTable, { id: string }[]> => ({
  ledgers: r.ledgers, households: r.households, events: r.events, entries: r.entries,
});

/**
 * Settle one pushed batch in one transaction. Rejected rows get `sync_error` (and stay dirty, so they are still known and
 * are retried only after an edit or an explicit "retry"). Everything else sent is clean now. A household/event/ledger edited
 * meanwhile has a newer updated_at and stays dirty.
 */
async function settle(db: Db, r: DirtyRows, rejected: Rejection[]): Promise<number> {
  const bad = new Set<string>();
  const ids = idsOf(r);
  await db.withTransactionAsync(async () => {
    for (const x of rejected) {
      if (x.table === 'profile') continue;
      const row = ids[x.table]?.[x.index];
      if (!row) continue; // an index we never sent: ignore rather than guess
      bad.add(`${x.table}:${row.id}`);
      await db.runAsync(`UPDATE ${x.table} SET sync_error = ? WHERE id = ?`, [(x.reason || 'rejected').slice(0, 200), row.id]);
    }
    const ok = (t: RowTable, id: string) => !bad.has(`${t}:${id}`);
    for (const l of r.ledgers) if (ok('ledgers', l.id)) await db.runAsync('UPDATE ledgers SET dirty = 0 WHERE id = ? AND updated_at = ?', [l.id, l.updated_at]);
    for (const h of r.households) if (ok('households', h.id)) await db.runAsync('UPDATE households SET dirty = 0 WHERE id = ? AND updated_at = ?', [h.id, h.updated_at]);
    for (const e of r.events) if (ok('events', e.id)) await db.runAsync('UPDATE events SET dirty = 0 WHERE id = ? AND updated_at = ?', [e.id, e.updated_at]);
    for (const e of r.entries) if (ok('entries', e.id)) await db.runAsync('UPDATE entries SET dirty = 0 WHERE id = ?', [e.id]);
  });
  return bad.size;
}

/** Push every dirty row, BATCH at a time. Returns the number of rows the server accepted. */
export async function pushDirty(db: Db, t: Transport): Promise<number> {
  let total = 0;
  let profile: WireProfile | null = (await getSyncState(db)).profileDirty ? await getLocalProfile(db) : null;
  for (;;) {
    const rows = await collectDirty(db, BATCH);
    if (size(rows) === 0 && !profile) return total;
    const batch: Batch = {
      ledgers: rows.ledgers.map(ledgerToWire),
      households: rows.households.map(householdToWire),
      events: rows.events.map(eventToWire),
      entries: rows.entries.map(entryToWire),
      ...(profile ? { profile } : {}),
    };
    const res = await t.push(batch);
    const rejected = res?.rejected ?? [];
    const marked = await settle(db, rows, rejected);
    if (profile) {
      // The profile is clean again unless it changed while the request was in flight (or the server refused it).
      const refused = rejected.some((x) => x.table === 'profile');
      const now = await getLocalProfile(db);
      if (refused || now?.updatedAt === profile.updatedAt) await db.runAsync('UPDATE sync_state SET profile_dirty = 0 WHERE id = 1', []);
      profile = null;
    }
    total += size(rows) - marked;
  }
}

/**
 * Apply one pulled page and advance the cursor in ONE transaction (all or nothing). Pulled rows are never dirty.
 * Entries: insert-or-ignore (immutable). Households/events/ledgers: last-write-wins by updated_at; the local-only photo
 * column and PINs are left alone. Foreign keys are off while applying, because a page can hold an entry whose household
 * arrives on a later page (a household's server_seq is bumped whenever it is edited).
 */
export async function applyPage(db: Db, page: PullPage): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = OFF;');
  try {
    await db.withTransactionAsync(async () => {
      for (const l of page.ledgers ?? []) {
        await db.runAsync(
          `INSERT INTO ledgers (id, name, kind, created_at, updated_at, dirty) VALUES (?,?,?,?,?,0)
           ON CONFLICT(id) DO UPDATE SET name=excluded.name, updated_at=excluded.updated_at, dirty=0
           WHERE excluded.updated_at > ledgers.updated_at`,
          [l.id, l.name, l.kind, l.createdAt, l.updatedAt],
        );
      }
      for (const h of page.households) {
        await db.runAsync(
          `INSERT INTO households (id, head_name, father_name, jati, atak, village, fala, phone, created_at, updated_at, dirty)
           VALUES (?,?,?,?,?,?,?,?,?,?,0)
           ON CONFLICT(id) DO UPDATE SET head_name=excluded.head_name, father_name=excluded.father_name, jati=excluded.jati,
             atak=excluded.atak, village=excluded.village, fala=excluded.fala, phone=excluded.phone,
             updated_at=excluded.updated_at, dirty=0
           WHERE excluded.updated_at > households.updated_at`,
          [h.id, h.headName, h.fatherName, h.jati, h.atak, h.village, h.fala, h.phone, h.createdAt, h.updatedAt],
        );
      }
      for (const e of page.events) {
        await db.runAsync(
          `INSERT INTO events (id, host_household_id, occasion, date, panch_approved, invitation_type, status, ledger_id, created_at, updated_at, dirty)
           VALUES (?,?,?,?,?,?,?,?,?,?,0)
           ON CONFLICT(id) DO UPDATE SET host_household_id=excluded.host_household_id, occasion=excluded.occasion, date=excluded.date,
             panch_approved=excluded.panch_approved, invitation_type=excluded.invitation_type, status=excluded.status,
             updated_at=excluded.updated_at, dirty=0
           WHERE excluded.updated_at > events.updated_at`,
          [e.id, e.hostHouseholdId, e.occasion, e.date, e.panchApproved ? 1 : 0, e.invitationType, e.status, e.ledgerId, e.createdAt, e.updatedAt],
        );
      }
      for (const e of page.entries) {
        await db.runAsync(
          `INSERT OR IGNORE INTO entries (id, event_id, other_household_id, direction, cash_paise, in_kind_item, in_kind_value_paise,
             payment_mode, recorded_by, created_at, corrects_entry_id, is_void, ledger_id, dirty)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0)`,
          [e.id, e.eventId, e.otherHouseholdId, e.direction, e.cashPaise, e.inKindItem, e.inKindValuePaise, e.paymentMode,
            e.recordedBy, e.createdAt, e.correctsEntryId, e.isVoid ? 1 : 0, e.ledgerId],
        );
      }
      if (page.profile) await applyProfile(db, page.profile);
      await db.runAsync('UPDATE sync_state SET cursor = ? WHERE id = 1', [page.nextCursor]);
    });
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON;');
  }
}

/** Pull every page after the stored cursor (cursor 0 = full restore). Returns the number of rows received. */
export async function pullAll(db: Db, t: Transport): Promise<number> {
  let received = 0;
  for (;;) {
    const { cursor } = await getSyncState(db);
    const page = await t.pull(cursor, BATCH);
    await applyPage(db, page);
    received += (page.ledgers?.length ?? 0) + page.households.length + page.events.length + page.entries.length + (page.profile ? 1 : 0);
    if (!page.hasMore || page.nextCursor <= cursor) return received;
  }
}

export interface SyncResult {
  pushed: number;
  pulled: number;
}

/** One full cycle: push dirty rows, then pull. Throws if the network fails (the caller retries with backoff). */
export async function syncOnce(db: Db, t: Transport, now: () => Date = () => new Date()): Promise<SyncResult> {
  const pushed = await pushDirty(db, t);
  const pulled = await pullAll(db, t);
  await db.runAsync('UPDATE sync_state SET last_sync_at = ? WHERE id = 1', [now().toISOString()]);
  return { pushed, pulled };
}

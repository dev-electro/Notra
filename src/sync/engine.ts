import type { Db } from '../db/types';
import { getSyncState } from './state';
import {
  entryToWire, eventToWire, householdToWire,
  type Batch, type EntryRow, type EventRow, type HouseholdRow, type PullPage,
} from './wire';

export const BATCH = 500;

/** The network, abstracted so the engine is testable. Throws on any failure. */
export interface Transport {
  push(batch: Batch): Promise<void>;
  pull(since: number, limit: number): Promise<PullPage>;
}

type DirtyRows = { households: HouseholdRow[]; events: EventRow[]; entries: EntryRow[] };

/** Up to `limit` dirty rows in total: households first, then events, then entries (oldest first). */
async function collectDirty(db: Db, limit: number): Promise<DirtyRows> {
  const households = await db.getAllAsync<HouseholdRow>(
    `SELECT id, head_name, father_name, jati, atak, village, fala, phone, created_at, updated_at
     FROM households WHERE dirty = 1 ORDER BY updated_at, rowid LIMIT ?`, [limit]);
  const events = await db.getAllAsync<EventRow>(
    `SELECT id, host_household_id, occasion, date, panch_approved, invitation_type, status, created_at, updated_at
     FROM events WHERE dirty = 1 ORDER BY updated_at, rowid LIMIT ?`, [limit - households.length]);
  const entries = await db.getAllAsync<EntryRow>(
    `SELECT id, event_id, other_household_id, direction, cash_paise, in_kind_item, in_kind_value_paise, payment_mode,
            recorded_by, created_at, corrects_entry_id, is_void
     FROM entries WHERE dirty = 1 ORDER BY created_at, rowid LIMIT ?`, [limit - households.length - events.length]);
  return { households, events, entries };
}

const size = (r: DirtyRows) => r.households.length + r.events.length + r.entries.length;

/** Clear dirty for exactly what was sent: a household/event edited meanwhile has a newer updated_at and stays dirty. */
async function clearDirty(db: Db, r: DirtyRows): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const h of r.households) await db.runAsync('UPDATE households SET dirty = 0 WHERE id = ? AND updated_at = ?', [h.id, h.updated_at]);
    for (const e of r.events) await db.runAsync('UPDATE events SET dirty = 0 WHERE id = ? AND updated_at = ?', [e.id, e.updated_at]);
    for (const e of r.entries) await db.runAsync('UPDATE entries SET dirty = 0 WHERE id = ?', [e.id]);
  });
}

/** Push every dirty row, BATCH at a time. Returns the number of rows pushed. */
export async function pushDirty(db: Db, t: Transport): Promise<number> {
  let total = 0;
  for (;;) {
    const rows = await collectDirty(db, BATCH);
    if (size(rows) === 0) return total;
    await t.push({
      households: rows.households.map(householdToWire),
      events: rows.events.map(eventToWire),
      entries: rows.entries.map(entryToWire),
    });
    await clearDirty(db, rows);
    total += size(rows);
  }
}

/**
 * Apply one pulled page and advance the cursor in ONE transaction (all or nothing). Pulled rows are never dirty.
 * Entries: insert-or-ignore (immutable). Households/events: last-write-wins by updated_at; the local-only photo
 * column is left alone. Foreign keys are off while applying, because a page can hold an entry whose household
 * arrives on a later page (a household's server_seq is bumped whenever it is edited).
 */
export async function applyPage(db: Db, page: PullPage): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = OFF;');
  try {
    await db.withTransactionAsync(async () => {
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
          `INSERT INTO events (id, host_household_id, occasion, date, panch_approved, invitation_type, status, created_at, updated_at, dirty)
           VALUES (?,?,?,?,?,?,?,?,?,0)
           ON CONFLICT(id) DO UPDATE SET host_household_id=excluded.host_household_id, occasion=excluded.occasion, date=excluded.date,
             panch_approved=excluded.panch_approved, invitation_type=excluded.invitation_type, status=excluded.status,
             updated_at=excluded.updated_at, dirty=0
           WHERE excluded.updated_at > events.updated_at`,
          [e.id, e.hostHouseholdId, e.occasion, e.date, e.panchApproved ? 1 : 0, e.invitationType, e.status, e.createdAt, e.updatedAt],
        );
      }
      for (const e of page.entries) {
        await db.runAsync(
          `INSERT OR IGNORE INTO entries (id, event_id, other_household_id, direction, cash_paise, in_kind_item, in_kind_value_paise,
             payment_mode, recorded_by, created_at, corrects_entry_id, is_void, dirty)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0)`,
          [e.id, e.eventId, e.otherHouseholdId, e.direction, e.cashPaise, e.inKindItem, e.inKindValuePaise, e.paymentMode,
            e.recordedBy, e.createdAt, e.correctsEntryId, e.isVoid ? 1 : 0],
        );
      }
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
    received += page.households.length + page.events.length + page.entries.length;
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

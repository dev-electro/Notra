import { legacyEventId } from '../core/eventRules';
import type { Direction } from '../core/types';
import type { Db } from './types';

export const SYNC_APPLYING_KEY = 'sync_applying';

/** Marks "a sync / backup page is being applied" so the direction trigger stands aside (the rows were checked where they were written). */
export const beginApplying = (db: Db) =>
  db.runAsync('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)', [SYNC_APPLYING_KEY, '1', new Date().toISOString()]);
export const endApplying = (db: Db) => db.runAsync('DELETE FROM settings WHERE key = ?', [SYNC_APPLYING_KEY]);

/**
 * An entry that arrives without an event (rows written before every entry needed one: an old cloud copy or an old backup file) is
 * attached to the same automatic "पुराना हिसाब" event the v7 migration makes (deterministic id). Creates that event if missing and returns its id.
 */
export async function ensureLegacyEvent(
  db: Db, e: { direction: Direction; ledgerId: string; otherHouseholdId: string; occurredOn: string },
): Promise<string> {
  const id = legacyEventId(e.direction, e.ledgerId, e.otherHouseholdId);
  let host = e.otherHouseholdId;
  if (e.direction === 'AAYA') {
    const me = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'my_household_id'", []);
    host = me?.value ?? e.otherHouseholdId;
  }
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT OR IGNORE INTO events (id, host_household_id, occasion, date, panch_approved, invitation_type, status, ledger_id, created_at, updated_at, dirty)
     VALUES (?, ?, 'OTHER', ?, 0, 'CARD', 'SETTLED', ?, ?, ?, 1)`,
    [id, host, e.occurredOn, e.ledgerId, now, now],
  );
  return id;
}

import type { Db } from './types';

/**
 * Wipe this phone's ledger (explicit user choice only). Entries are append-only, so the delete trigger is dropped and
 * re-created inside the same transaction. Cloud copies are not touched.
 */
export async function clearAllLocalData(db: Db): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = OFF;');
  try {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        DROP TRIGGER entries_no_delete;
        DELETE FROM entries;
        DELETE FROM events;
        DELETE FROM households;
        DELETE FROM settings;
        UPDATE sync_state SET cursor = 0, user_id = NULL, enabled = 0, last_sync_at = NULL;
        CREATE TRIGGER entries_no_delete BEFORE DELETE ON entries
        BEGIN SELECT RAISE(ABORT, 'entries are append-only'); END;
      `);
    });
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON;');
  }
}

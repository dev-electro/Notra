import { DEFAULT_LEDGER_ID, DEFAULT_LEDGER_NAME } from '../core/ledgers';
import type { Db } from './types';

/**
 * Wipe this phone's data: every ledger, family and setting incl. PINs (explicit user choice only). Entries are append-only, so the delete trigger is dropped and
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
        DELETE FROM ledgers;
        INSERT INTO ledgers (id, name, kind, created_at, updated_at, dirty)
          VALUES ('${DEFAULT_LEDGER_ID}', '${DEFAULT_LEDGER_NAME}', 'HOUSEHOLD', '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z', 0);
        UPDATE sync_state SET cursor = 0, user_id = NULL, enabled = 0, last_sync_at = NULL, profile_dirty = 0;
        CREATE TRIGGER entries_no_delete BEFORE DELETE ON entries
        BEGIN SELECT RAISE(ABORT, 'entries are append-only'); END;
      `);
    });
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON;');
  }
}

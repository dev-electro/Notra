import type { Db } from '../db/types';

export interface SyncState {
  cursor: number;
  userId: string | null;
  enabled: boolean;
  lastSyncAt: string | null;
}

export async function getSyncState(db: Db): Promise<SyncState> {
  const r = await db.getFirstAsync<{ cursor: number; user_id: string | null; enabled: number; last_sync_at: string | null }>(
    'SELECT cursor, user_id, enabled, last_sync_at FROM sync_state WHERE id = 1',
    [],
  );
  return { cursor: r?.cursor ?? 0, userId: r?.user_id ?? null, enabled: r?.enabled === 1, lastSyncAt: r?.last_sync_at ?? null };
}

export async function setSyncEnabled(db: Db, enabled: boolean): Promise<void> {
  await db.runAsync('UPDATE sync_state SET enabled = ? WHERE id = 1', [enabled ? 1 : 0]);
}

/**
 * Remember which cloud user this phone syncs with. If it is a different user than before (someone else signed in on
 * this phone), restart: cursor 0 and every local row dirty, so this phone's data is uploaded to the new account and the
 * new account's data is pulled in.
 */
export async function bindUser(db: Db, userId: string): Promise<void> {
  const s = await getSyncState(db);
  if (s.userId === userId) return;
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE sync_state SET user_id = ?, cursor = 0, last_sync_at = NULL WHERE id = 1', [userId]);
    if (s.userId !== null) {
      await db.runAsync('UPDATE households SET dirty = 1', []);
      await db.runAsync('UPDATE events SET dirty = 1', []);
      await db.runAsync('UPDATE entries SET dirty = 1', []);
    }
  });
}

/** Rows not yet uploaded (the dirty columns have partial indexes, so this is cheap). */
export async function pendingCount(db: Db): Promise<number> {
  const r = await db.getFirstAsync<{ n: number }>(
    `SELECT (SELECT COUNT(*) FROM households WHERE dirty = 1) + (SELECT COUNT(*) FROM events WHERE dirty = 1)
          + (SELECT COUNT(*) FROM entries WHERE dirty = 1) AS n`,
    [],
  );
  return r?.n ?? 0;
}

import type { Db } from '../db/types';

export interface SyncState {
  cursor: number;
  /**
   * The cloud user who owns the data on this phone (the account it was synced to / restored from). null = this phone's data
   * has never been synced to anyone. Signing out keeps it, so a different person signing in is noticed (see account.ts).
   */
  userId: string | null;
  enabled: boolean;
  lastSyncAt: string | null;
  profileDirty: boolean;
}

export async function getSyncState(db: Db): Promise<SyncState> {
  const r = await db.getFirstAsync<{ cursor: number; user_id: string | null; enabled: number; last_sync_at: string | null; profile_dirty: number }>(
    'SELECT cursor, user_id, enabled, last_sync_at, profile_dirty FROM sync_state WHERE id = 1',
    [],
  );
  return {
    cursor: r?.cursor ?? 0, userId: r?.user_id ?? null, enabled: r?.enabled === 1, lastSyncAt: r?.last_sync_at ?? null,
    profileDirty: r?.profile_dirty === 1,
  };
}

export async function setSyncEnabled(db: Db, enabled: boolean): Promise<void> {
  await db.runAsync('UPDATE sync_state SET enabled = ? WHERE id = 1', [enabled ? 1 : 0]);
}

/** Rows waiting to be uploaded. Rows the server rejected (sync_error) are not "waiting": they are counted separately. */
export async function pendingCount(db: Db): Promise<number> {
  const r = await db.getFirstAsync<{ n: number }>(
    `SELECT (SELECT COUNT(*) FROM households WHERE dirty = 1 AND sync_error IS NULL)
          + (SELECT COUNT(*) FROM events WHERE dirty = 1 AND sync_error IS NULL)
          + (SELECT COUNT(*) FROM entries WHERE dirty = 1 AND sync_error IS NULL)
          + (SELECT COUNT(*) FROM ledgers WHERE dirty = 1 AND sync_error IS NULL) AS n`,
    [],
  );
  return r?.n ?? 0;
}

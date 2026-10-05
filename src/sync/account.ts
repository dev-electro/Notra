import { clearAllLocalData } from '../db/maintenance';
import type { Db } from '../db/types';
import { getSyncState } from './state';

/** What the person chose when the account they signed in with does not match the data on this phone. */
export type SignInChoice = 'merge' | 'wipe' | 'cancel';
export interface AskInfo {
  /** true: this phone's data was never saved to any account (wiping it loses it for good). */
  neverSynced: boolean;
}
export type AskChoice = (info: AskInfo) => Promise<SignInChoice>;

/** Anything worth protecting on the phone: families, events, entries or a personal ledger. */
export async function hasLocalData(db: Db): Promise<boolean> {
  const r = await db.getFirstAsync<{ n: number }>(
    `SELECT (SELECT COUNT(*) FROM households) + (SELECT COUNT(*) FROM events) + (SELECT COUNT(*) FROM entries)
          + (SELECT COUNT(*) FROM ledgers WHERE kind = 'PERSONAL') AS n`,
    [],
  );
  return (r?.n ?? 0) > 0;
}

/**
 * Pure decision. Local data is only ever uploaded into the account it already belongs to. Anything else (another
 * person signing in, or data that was never synced anywhere) must be confirmed first.
 */
export function decideBind(owner: string | null, signingIn: string, hasData: boolean): 'bind' | 'ask' {
  if (owner === signingIn) return 'bind';
  return hasData ? 'ask' : 'bind';
}

export interface BindOutcome {
  status: 'bound' | 'cancelled';
  choice?: SignInChoice;
}

/**
 * Attach this phone to `userId` after a successful sign-in, BEFORE anything is synced. Cancelling changes nothing.
 * `merge` restarts sync from cursor 0 with every local row dirty, so this phone's data is added to the account;
 * `wipe` clears the phone first and then restores the account's own data.
 */
export async function bindAccount(db: Db, userId: string, ask: AskChoice): Promise<BindOutcome> {
  const s = await getSyncState(db);
  const hasData = await hasLocalData(db);
  let choice: SignInChoice | undefined;
  if (decideBind(s.userId, userId, hasData) === 'ask') {
    choice = await ask({ neverSynced: s.userId === null });
    if (choice === 'cancel') return { status: 'cancelled', choice };
  }
  if (choice === 'wipe') await clearAllLocalData(db);
  if (s.userId !== userId || choice) {
    await db.withTransactionAsync(async () => {
      await db.runAsync('UPDATE sync_state SET user_id = ?, cursor = 0, last_sync_at = NULL WHERE id = 1', [userId]);
      if (choice === 'merge') {
        await db.runAsync('UPDATE households SET dirty = 1, sync_error = NULL', []);
        await db.runAsync('UPDATE events SET dirty = 1, sync_error = NULL', []);
        await db.runAsync('UPDATE entries SET dirty = 1, sync_error = NULL', []);
        await db.runAsync(`UPDATE ledgers SET dirty = 1, sync_error = NULL WHERE kind = 'PERSONAL'`, []);
        await db.runAsync(`UPDATE sync_state SET profile_dirty = 1 WHERE id = 1 AND EXISTS (SELECT 1 FROM settings WHERE key IN ('my_household_id','village_increment'))`, []);
      }
    });
  }
  return { status: 'bound', choice };
}

/** The account was deleted on the server: this phone's data no longer belongs to anyone (it stays on the phone). */
export async function releaseOwner(db: Db): Promise<void> {
  await db.runAsync('UPDATE sync_state SET user_id = NULL, cursor = 0, last_sync_at = NULL, enabled = 0, profile_dirty = 0 WHERE id = 1', []);
}

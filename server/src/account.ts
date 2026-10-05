import { withUserTx, type Db } from './db';
import { getUser } from './users';

/**
 * Delete everything that belongs to a user, in ONE transaction (all or nothing): ledgers, households, events, entries, profile,
 * sessions and linked sign-ins, OTP rows for the user's phone number, and finally the user row. Required by Play Store policy and the DPDP Act.
 * It takes the same per-user advisory lock as push/pull, so a push can never re-insert rows halfway through a deletion.
 * Idempotent: deleting an account that is already gone succeeds. (The foreign keys also cascade from users, but the explicit
 * deletes keep the intent obvious and do not depend on that.)
 */
export async function deleteAccount(db: Db, userId: string): Promise<void> {
  await withUserTx(db, userId, 'user', async (q) => {
    await q.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`sync:${userId}`]);
    const user = await getUser(q, userId);
    await q.query('DELETE FROM rishtey_interests WHERE from_user = $1 OR to_user = $1', [userId]);
    for (const table of ['entries', 'events', 'households', 'ledgers', 'profiles', 'rishtey_profiles', 'rishtey_reports', 'rishtey_blocks', 'auth_sessions', 'auth_accounts']) {
      await q.query(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
    }
    if (user?.phone_e164) {
      // OTPs in flight for this number (Better Auth's verification table is open only in the auth context).
      await q.query(`SELECT set_config('app.auth', '1', true)`);
      await q.query('DELETE FROM auth_verifications WHERE identifier = $1', [user.phone_e164]);
      await q.query(`SELECT set_config('app.auth', '', true)`);
      await q.query('DELETE FROM otp_events WHERE phone_e164 = $1', [user.phone_e164]);
    }
    const gone = await q.query('DELETE FROM users WHERE id = $1 RETURNING 1', [userId]);
    if (gone.length) await q.query(`INSERT INTO account_deletions (source) VALUES ('self')`);
  });
}

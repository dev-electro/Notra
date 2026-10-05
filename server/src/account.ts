import { withUserTx, type Db } from './db';
import { getUser } from './users';

/**
 * Delete everything that belongs to a user, in ONE transaction (all or nothing): ledgers, households, events, entries, profile,
 * refresh tokens, OTP rows for the user's phone number, and finally the user row. Required by Play Store policy and the DPDP Act.
 * It takes the same per-user advisory lock as push/pull, so a push can never re-insert rows halfway through a deletion.
 * Idempotent: deleting an account that is already gone succeeds. (The foreign keys also cascade from users, but the explicit
 * deletes keep the intent obvious and do not depend on that.)
 */
export async function deleteAccount(db: Db, userId: string): Promise<void> {
  await withUserTx(db, userId, 'user', async (q) => {
    await q.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`sync:${userId}`]);
    const user = await getUser(q, userId);
    for (const table of ['entries', 'events', 'households', 'ledgers', 'profiles', 'refresh_tokens']) {
      await q.query(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
    }
    if (user?.phone_e164) {
      await q.query('DELETE FROM otp_requests WHERE phone_e164 = $1', [user.phone_e164]);
      await q.query('DELETE FROM otp_events WHERE phone_e164 = $1', [user.phone_e164]);
    }
    const gone = await q.query('DELETE FROM users WHERE id = $1 RETURNING 1', [userId]);
    if (gone.length) await q.query(`INSERT INTO account_deletions (source) VALUES ('self')`);
  });
}

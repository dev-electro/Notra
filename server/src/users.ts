import type { Queryable } from './db';
import { ApiError } from './errors';

export interface UserRow {
  id: string;
  google_sub: string | null;
  phone_e164: string | null;
  display_name: string | null;
  status: 'active' | 'suspended';
}

export const publicUser = (u: UserRow) => ({
  id: u.id, displayName: u.display_name, phone: u.phone_e164, hasGoogle: u.google_sub !== null, hasPhone: u.phone_e164 !== null,
});

const COLS = 'id, google_sub, phone_e164, display_name, status';

/** Own row only (Row Level Security: the caller's app.user_id must be `id`). */
export async function getUser(q: Queryable, id: string): Promise<UserRow | null> {
  return (await q.query<UserRow & Record<string, unknown>>(`SELECT ${COLS} FROM users WHERE id = $1`, [id]))[0] ?? null;
}

type Identity = { googleSub: string; name: string | null; email?: string | null } | { phone: string };

/**
 * Find the user for a Google subject or phone number, creating one on first sign-in. This runs BEFORE a user id is known, so it
 * calls the narrowly scoped SECURITY DEFINER function auth_find_or_create_user (race-safe via ON CONFLICT inside it).
 */
export async function findOrCreateUser(q: Queryable, by: Identity): Promise<UserRow> {
  const g = 'googleSub' in by;
  const [u] = await q.query<UserRow & Record<string, unknown>>(
    `SELECT ${COLS} FROM auth_find_or_create_user($1, $2, $3, $4)`,
    [g ? by.googleSub : null, g ? null : by.phone, g ? by.name : null, g ? (by.email ?? null) : null],
  );
  return u!;
}

/**
 * Attach an identity to the signed-in user (call inside withUserTx for that user). Refuses (409) if it already belongs to
 * someone else or the user already has a different one.
 */
export async function linkIdentity(q: Queryable, userId: string, by: Identity): Promise<UserRow> {
  const g = 'googleSub' in by;
  const col = g ? 'google_sub' : 'phone_e164';
  const val = g ? by.googleSub : by.phone;
  const me = await getUser(q, userId);
  if (!me) throw new ApiError(401, 'unauthorized');
  const [o] = await q.query<{ owner: string | null }>('SELECT auth_identity_owner($1, $2) AS owner', [g ? val : null, g ? null : val]);
  const owner = o?.owner ?? null;
  if (owner && owner !== userId) throw new ApiError(409, 'identity_belongs_to_another_user');
  if (owner) return me; // already linked to me: idempotent
  if (me[col]) throw new ApiError(409, 'already_linked_to_different_identity');
  await q.query(`UPDATE users SET ${col} = $2, display_name = COALESCE(display_name, $3), email = COALESCE($4, email) WHERE id = $1`, [
    userId, val, g ? by.name : null, g ? (by.email ?? null) : null,
  ]);
  return (await getUser(q, userId))!;
}

/** Account state for an authenticated request: suspended? which staff role (from the database, never from the request)? */
export async function authState(q: Queryable, userId: string): Promise<{ status: 'active' | 'suspended'; role: string } | null> {
  const [r] = await q.query<{ status: 'active' | 'suspended'; role: string }>('SELECT status, role FROM auth_state($1)', [userId]);
  return r ?? null;
}

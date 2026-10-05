import type { Queryable } from './db';
import { ApiError } from './errors';

export interface UserRow {
  id: string;
  google_sub: string | null;
  phone_e164: string | null;
  display_name: string | null;
}

export const publicUser = (u: UserRow) => ({
  id: u.id, displayName: u.display_name, phone: u.phone_e164, hasGoogle: u.google_sub !== null, hasPhone: u.phone_e164 !== null,
});

const COLS = 'id, google_sub, phone_e164, display_name';

export async function getUser(q: Queryable, id: string): Promise<UserRow | null> {
  return (await q.query<UserRow & Record<string, unknown>>(`SELECT ${COLS} FROM users WHERE id = $1`, [id]))[0] ?? null;
}

/** Find the user for a Google subject or phone number, creating one on first sign-in (race-safe via ON CONFLICT). */
export async function findOrCreateUser(
  q: Queryable,
  by: { googleSub: string; name: string | null } | { phone: string },
): Promise<UserRow> {
  const isGoogle = 'googleSub' in by;
  const col = isGoogle ? 'google_sub' : 'phone_e164';
  const val = isGoogle ? by.googleSub : by.phone;
  await q.query(
    `INSERT INTO users (id, ${col}, display_name) VALUES ($1, $2, $3) ON CONFLICT (${col}) DO NOTHING`,
    [crypto.randomUUID(), val, isGoogle ? by.name : null],
  );
  const [u] = await q.query<UserRow & Record<string, unknown>>(`SELECT ${COLS} FROM users WHERE ${col} = $1`, [val]);
  return u!;
}

/** Attach an identity to an existing user. Refuses (409) if it already belongs to someone else or user has one. */
export async function linkIdentity(
  q: Queryable,
  userId: string,
  by: { googleSub: string; name: string | null } | { phone: string },
): Promise<UserRow> {
  const isGoogle = 'googleSub' in by;
  const col = isGoogle ? 'google_sub' : 'phone_e164';
  const val = isGoogle ? by.googleSub : by.phone;
  const me = await getUser(q, userId);
  if (!me) throw new ApiError(401, 'unauthorized');
  const [owner] = await q.query<{ id: string }>(`SELECT id FROM users WHERE ${col} = $1`, [val]);
  if (owner && owner.id !== userId) throw new ApiError(409, 'identity_belongs_to_another_user');
  if (owner) return me; // already linked to me: idempotent
  if (me[col]) throw new ApiError(409, 'already_linked_to_different_identity');
  await q.query(`UPDATE users SET ${col} = $2, display_name = COALESCE(display_name, $3) WHERE id = $1`, [
    userId, val, isGoogle ? by.name : null,
  ]);
  return (await getUser(q, userId))!;
}

import type { Queryable } from './db';

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

/** Account state for an authenticated request: suspended? which staff role (from the database, never from the request)? */
export async function authState(q: Queryable, userId: string): Promise<{ status: 'active' | 'suspended'; role: string } | null> {
  const [r] = await q.query<{ status: 'active' | 'suspended'; role: string }>('SELECT status, role FROM auth_state($1)', [userId]);
  return r ?? null;
}

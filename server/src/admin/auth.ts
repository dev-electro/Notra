import type { Context } from 'hono';
import type { Queryable } from '../db';
import { verifyAccessToken } from '../auth/tokens';
import { ApiError } from '../errors';
import { authState } from '../users';

export const ROLES = ['viewer', 'support', 'admin', 'owner'] as const;
export type Role = (typeof ROLES)[number];
export const rank = (r: Role): number => ROLES.indexOf(r) + 1;
export const isRole = (v: unknown): v is Role => typeof v === 'string' && (ROLES as readonly string[]).includes(v);

export interface AdminIdentity {
  /** users.id of the signed-in staff member (staff are ordinary app accounts; their role is profiles.role). */
  id: string;
  role: Role;
  /** Shown in the audit log: the account's e-mail, else phone. Filled in once the request transaction is open. */
  label: string;
}

/** Non-secret settings for the admin API. */
export interface AdminDeps {
  environment?: string;
  /** SMS_COST_PAISE: what one OTP SMS costs, in paise (for the cost estimate). */
  smsCostPaise: number;
  serverVersion: string;
  /** Exact origin of the admin web app when it is not served from the API's origin (enables credentialed CORS). */
  allowedOrigin?: string;
}

/**
 * Who is calling? The same access token the app uses (issued by /v1/auth/google or the OTP flow) -> user id -> role read from the
 * database (profiles.role via auth_state). Not staff -> 403; suspended -> 403. The role is never taken from the token or the request.
 */
export async function authenticateAdmin(
  c: Context, db: Queryable, secret: Uint8Array, now: Date,
): Promise<{ id: string; role: Role }> {
  const m = /^Bearer (\S+)$/.exec(c.req.header('authorization') ?? '');
  if (!m) throw new ApiError(401, 'unauthorized');
  const id = await verifyAccessToken(m[1]!, secret, now);
  const st = await authState(db, id);
  if (!st) throw new ApiError(401, 'unauthorized');
  if (st.status === 'suspended') throw new ApiError(403, 'account_suspended');
  if (!isRole(st.role)) throw new ApiError(403, 'not_staff');
  return { id, role: st.role };
}

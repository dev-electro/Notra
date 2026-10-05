import { jwtVerify, SignJWT } from 'jose';
import { setUserContext, type Queryable } from '../db';
import { randomToken, sha256Hex } from '../crypto';
import { ApiError } from '../errors';

export const ACCESS_TTL_S = 15 * 60;
export const REFRESH_TTL_DAYS = 60;
const ISS = 'notra-diary';
const AUD = 'notra-api';

export async function signAccessToken(userId: string, secret: Uint8Array, now: Date): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(ISS)
    .setAudience(AUD)
    .setIssuedAt(iat)
    .setExpirationTime(iat + ACCESS_TTL_S)
    .sign(secret);
}

/** Returns the user id, or throws 401. Only HS256 is accepted. */
export async function verifyAccessToken(token: string, secret: Uint8Array, now: Date): Promise<string> {
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: ISS, audience: AUD, algorithms: ['HS256'], currentDate: now });
    if (typeof payload.sub !== 'string') throw new Error('no sub');
    return payload.sub;
  } catch {
    throw new ApiError(401, 'unauthorized');
  }
}

/** Create a refresh token (new family unless `familyId` given). Only its SHA-256 is stored. */
export async function issueRefreshToken(q: Queryable, userId: string, familyId?: string): Promise<{ token: string; id: string }> {
  const token = randomToken(32);
  const id = crypto.randomUUID();
  await q.query(
    `INSERT INTO refresh_tokens (id, user_id, family_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4, now() + ($5 || ' days')::interval)`,
    [id, userId, familyId ?? crypto.randomUUID(), await sha256Hex(token), String(REFRESH_TTL_DAYS)],
  );
  return { token, id };
}

type Rotation = { ok: true; userId: string; token: string } | { ok: false };

/**
 * Rotate: the presented token is revoked and replaced. Presenting an already-rotated (revoked) token means it was
 * stolen or replayed, so the whole family is revoked. Runs inside the caller's transaction.
 * The token is found by hash through auth_refresh_lookup (SECURITY DEFINER: no user is known yet); from then on the
 * transaction acts as that token's user, so Row Level Security covers the rest.
 */
export async function rotateRefreshToken(q: Queryable, presented: string): Promise<Rotation> {
  const hash = await sha256Hex(presented);
  const row = (await q.query<{ id: string; user_id: string; family_id: string; revoked: boolean; expired: boolean }>(
    'SELECT id, user_id, family_id, revoked, expired FROM auth_refresh_lookup($1)',
    [hash],
  ))[0];
  if (!row) return { ok: false };
  await setUserContext(q, row.user_id);
  if (row.revoked) {
    await q.query('UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL', [row.family_id]);
    return { ok: false };
  }
  if (row.expired) return { ok: false };
  const next = await issueRefreshToken(q, row.user_id, row.family_id);
  await q.query('UPDATE refresh_tokens SET revoked_at = now(), replaced_by = $2 WHERE id = $1', [row.id, next.id]);
  return { ok: true, userId: row.user_id, token: next.token };
}

export async function revokeFamilyOf(q: Queryable, presented: string): Promise<void> {
  await q.query('SELECT auth_revoke_family($1)', [await sha256Hex(presented)]);
}

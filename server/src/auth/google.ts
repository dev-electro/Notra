import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { ApiError } from '../errors';

let remote: JWTVerifyGetKey | undefined;
/** Google's signing keys (jose caches and rotates them). Tests inject their own key set instead. */
export function googleKeys(): JWTVerifyGetKey {
  remote ??= createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
  return remote;
}

export interface GoogleIdentity {
  sub: string;
  name: string | null;
  email: string | null;
}

/** Verify a Google ID token: signature, issuer, audience (our client ids), expiry, verified email. */
export async function verifyGoogleIdToken(
  idToken: unknown,
  clientIds: string[],
  keys: JWTVerifyGetKey,
  now: Date,
): Promise<GoogleIdentity> {
  if (typeof idToken !== 'string' || idToken.length < 20 || idToken.length > 4096 || clientIds.length === 0) {
    throw new ApiError(401, 'invalid_google_token');
  }
  try {
    const { payload } = await jwtVerify(idToken, keys, {
      issuer: ['accounts.google.com', 'https://accounts.google.com'],
      audience: clientIds,
      algorithms: ['RS256'],
      currentDate: now,
    });
    if (payload.email_verified !== true && payload.email_verified !== 'true') throw new Error('email not verified');
    if (typeof payload.sub !== 'string' || !payload.sub) throw new Error('no sub');
    return {
      sub: payload.sub,
      name: typeof payload.name === 'string' ? payload.name.slice(0, 200) : null,
      email: typeof payload.email === 'string' && payload.email.length <= 254 ? payload.email.toLowerCase() : null,
    };
  } catch {
    throw new ApiError(401, 'invalid_google_token');
  }
}

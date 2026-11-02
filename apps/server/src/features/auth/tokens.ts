import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

const ISSUER = 'mieru';
const AUDIENCE = 'mieru-web';
export const ACCESS_TOKEN_TTL_SECONDS = 10 * 60;
const REFRESH_TOKEN_BYTES = 32;

export interface AccessTokenClaims {
  userId: string;
  sessionId: string;
}

function keyFrom(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signAccessToken(
  claims: AccessTokenClaims,
  secret: string,
  now: Date,
): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  return new SignJWT({ sid: claims.sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ACCESS_TOKEN_TTL_SECONDS)
    .sign(keyFrom(secret));
}

/** Verifies signature, issuer, audience and expiry; returns null for any invalid token. */
export async function verifyAccessToken(
  token: string,
  secret: string,
  now: Date,
): Promise<AccessTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, keyFrom(secret), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
      currentDate: now,
    });
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return null;
    return { userId: payload.sub, sessionId: payload.sid };
  } catch {
    return null;
  }
}

export function generateOpaqueToken(): string {
  return randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
}

/** Refresh and link tokens are stored only as SHA-256; a leaked table can't be replayed. */
export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

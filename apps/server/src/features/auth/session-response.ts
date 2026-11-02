import type { FastifyReply, FastifyRequest } from 'fastify';
import type { SessionResponse } from '@mieru/shared';
import type { AppConfig } from '../../config.js';
import type { UserRow } from '../users/repo.js';
import { toMe } from '../users/repo.js';
import { setRefreshCookie } from './cookies.js';
import type { IssuedSession, SessionClient } from './sessions.js';
import { signAccessToken } from './tokens.js';

export function clientOf(request: FastifyRequest): SessionClient {
  return { userAgent: request.headers['user-agent'] ?? null, ip: request.ip };
}

/** Sets the refresh cookie and returns the access token + profile body. */
export async function sendSession(
  reply: FastifyReply,
  config: AppConfig,
  user: UserRow,
  session: IssuedSession,
  now: Date,
): Promise<SessionResponse> {
  setRefreshCookie(reply, session.refreshToken, config);
  reply.header('cache-control', 'no-store');
  const accessToken = await signAccessToken(
    { userId: user.id, sessionId: session.familyId },
    config.JWT_SECRET,
    now,
  );
  return { accessToken, user: toMe(user) };
}

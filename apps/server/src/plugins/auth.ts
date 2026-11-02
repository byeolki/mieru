import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Clock } from '../clock.js';
import { unauthorized } from '../errors.js';
import { verifyAccessToken, type AccessTokenClaims } from '../features/auth/tokens.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth: AccessTokenClaims | null;
  }
}

const BEARER_PREFIX = 'Bearer ';

/** Resolves the Bearer access token (if any) on every request into `request.auth`. */
export function registerAuth(
  app: FastifyInstance,
  deps: { jwtSecret: string; clock: Clock },
): void {
  app.decorateRequest('auth', null);
  app.addHook('onRequest', async (request) => {
    const header = request.headers.authorization;
    if (!header?.startsWith(BEARER_PREFIX)) return;
    request.auth = await verifyAccessToken(
      header.slice(BEARER_PREFIX.length),
      deps.jwtSecret,
      deps.clock(),
    );
  });
}

/** preHandler for routes that need a signed-in user. */
export function requireUser(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  return request.auth ? Promise.resolve() : Promise.reject(unauthorized());
}

/** Narrows `request.auth` after `requireUser` ran. */
export function currentUser(request: FastifyRequest): AccessTokenClaims {
  if (!request.auth) throw unauthorized();
  return request.auth;
}

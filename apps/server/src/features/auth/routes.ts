import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { loginBodySchema, sessionResponseSchema, signupBodySchema } from '@mieru/shared';
import { recordAudit } from '../../audit.js';
import type { Clock } from '../../clock.js';
import type { AppConfig } from '../../config.js';
import type { DbPool } from '../../db/pool.js';
import { unauthorized } from '../../errors.js';
import { cookieRouteGuard } from '../../plugins/csrf.js';
import { currentUser, requireUser } from '../../plugins/auth.js';
import { LIMITS, routeLimit } from '../../plugins/rate-limits.js';
import { findUserById } from '../users/repo.js';
import { clearRefreshCookie, readRefreshCookie } from './cookies.js';
import { login, signup } from './service.js';
import { clientOf, sendSession } from './session-response.js';
import {
  findFamilyByToken,
  revokeAllForUser,
  revokeFamily,
  rotateRefreshToken,
} from './sessions.js';

export interface AuthRouteDeps {
  config: AppConfig;
  db: DbPool;
  clock: Clock;
  rateLimitEnabled: boolean;
}

export function registerAuthRoutes(app: FastifyInstance, deps: AuthRouteDeps): void {
  const { config, db, clock, rateLimitEnabled } = deps;
  const routes = app.withTypeProvider<ZodTypeProvider>();
  const guardCookieRoute = cookieRouteGuard(config);

  routes.post(
    '/api/auth/signup',
    {
      schema: { body: signupBodySchema, response: { 201: sessionResponseSchema } },
      config: routeLimit(LIMITS.signup, rateLimitEnabled),
    },
    async (request, reply) => {
      const now = clock();
      const { user, session } = await signup(db, request.body, clientOf(request), now);
      return reply.status(201).send(await sendSession(reply, config, user, session, now));
    },
  );

  routes.post(
    '/api/auth/login',
    {
      schema: { body: loginBodySchema, response: { 200: sessionResponseSchema } },
      config: routeLimit(LIMITS.login, rateLimitEnabled),
    },
    async (request, reply) => {
      const now = clock();
      const { user, session } = await login(db, request.body, clientOf(request), now);
      return sendSession(reply, config, user, session, now);
    },
  );

  routes.post(
    '/api/auth/refresh',
    {
      preHandler: guardCookieRoute,
      schema: { response: { 200: sessionResponseSchema } },
      config: routeLimit(LIMITS.refresh, rateLimitEnabled),
    },
    async (request, reply) => {
      const token = readRefreshCookie(request);
      if (!token) throw unauthorized('invalid_refresh', 'No session');
      const now = clock();
      try {
        const session = await rotateRefreshToken(
          db,
          token,
          clientOf(request),
          now,
          ({ userId, familyId }) =>
            recordAudit(db, {
              actorId: userId,
              action: 'auth.refresh_reuse',
              targetType: 'session',
              targetId: familyId,
              ip: request.ip,
            }),
        );
        const user = await findUserById(db, session.userId);
        if (!user) throw unauthorized('invalid_refresh', 'Session expired');
        return await sendSession(reply, config, user, session, now);
      } catch (error) {
        // A stale token after a benign race keeps the cookie: the browser already holds the newer one.
        if (!(error instanceof Error && 'code' in error && error.code === 'stale_refresh')) {
          clearRefreshCookie(reply, config);
        }
        throw error;
      }
    },
  );

  routes.post('/api/auth/logout', { preHandler: guardCookieRoute }, async (request, reply) => {
    const token = readRefreshCookie(request);
    if (token) {
      const family = await findFamilyByToken(db, token);
      if (family) await revokeFamily(db, family.familyId, 'logout', clock());
    }
    clearRefreshCookie(reply, config);
    return reply.status(204).send();
  });

  routes.post('/api/auth/logout-all', { preHandler: requireUser }, async (request, reply) => {
    await revokeAllForUser(db, currentUser(request).userId, 'logout_all', clock());
    clearRefreshCookie(reply, config);
    return reply.status(204).send();
  });
}

import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  changeEmailBodySchema,
  changePasswordBodySchema,
  deleteAccountBodySchema,
  meSchema,
  sessionResponseSchema,
  sessionSummarySchema,
  updateMeBodySchema,
} from '@mieru/shared';
import type { Clock } from '../../clock.js';
import type { AppConfig } from '../../config.js';
import type { DbPool } from '../../db/pool.js';
import { execute } from '../../db/query.js';
import { notFound, unauthorized } from '../../errors.js';
import { currentUser, requireUser } from '../../plugins/auth.js';
import { LIMITS, routeLimit } from '../../plugins/rate-limits.js';
import { clearRefreshCookie } from '../auth/cookies.js';
import { clientOf, sendSession } from '../auth/session-response.js';
import { issueSession, listActiveSessions, revokeFamily } from '../auth/sessions.js';
import { findUserById, toMe } from './repo.js';
import { changeEmail, changePassword, deleteAccount, updateProfile } from './service.js';

export interface UserRouteDeps {
  config: AppConfig;
  db: DbPool;
  clock: Clock;
  rateLimitEnabled: boolean;
}

export function registerUserRoutes(app: FastifyInstance, deps: UserRouteDeps): void {
  const { config, db, clock, rateLimitEnabled } = deps;
  const routes = app.withTypeProvider<ZodTypeProvider>();
  const sensitive = routeLimit(LIMITS.sensitiveAccountChange, rateLimitEnabled);

  routes.get(
    '/api/me',
    { preHandler: requireUser, schema: { response: { 200: meSchema } } },
    async (request) => {
      const user = await findUserById(db, currentUser(request).userId);
      if (!user) throw unauthorized();
      return toMe(user);
    },
  );

  routes.patch(
    '/api/me',
    { preHandler: requireUser, schema: { body: updateMeBodySchema, response: { 200: meSchema } } },
    async (request) =>
      toMe(await updateProfile(db, currentUser(request).userId, request.body, clock())),
  );

  routes.put(
    '/api/me/password',
    {
      preHandler: requireUser,
      schema: { body: changePasswordBodySchema, response: { 200: sessionResponseSchema } },
      config: sensitive,
    },
    async (request, reply) => {
      const { userId } = currentUser(request);
      const now = clock();
      await changePassword(db, userId, request.body.currentPassword, request.body.newPassword, now);
      const user = await findUserById(db, userId);
      if (!user) throw unauthorized();
      const session = await issueSession(db, userId, clientOf(request), now);
      return sendSession(reply, config, user, session, now);
    },
  );

  routes.put(
    '/api/me/email',
    { preHandler: requireUser, schema: { body: changeEmailBodySchema }, config: sensitive },
    async (request, reply) => {
      await changeEmail(
        db,
        currentUser(request).userId,
        request.body.currentPassword,
        request.body.newEmail,
      );
      return reply.status(204).send();
    },
  );

  routes.get(
    '/api/me/sessions',
    { preHandler: requireUser, schema: { response: { 200: z.array(sessionSummarySchema) } } },
    async (request) => {
      const { userId, sessionId } = currentUser(request);
      const rows = await listActiveSessions(db, userId, clock());
      return rows.map((row) => ({
        familyId: row.family_id,
        userAgent: row.user_agent || null,
        ip: row.ip || null,
        createdAt: new Date(row.created_at).toISOString(),
        lastUsedAt: new Date(row.last_used_at).toISOString(),
        current: row.family_id === sessionId,
      }));
    },
  );

  routes.delete(
    '/api/me/sessions/:familyId',
    { preHandler: requireUser, schema: { params: z.object({ familyId: z.uuid() }) } },
    async (request, reply) => {
      const { userId } = currentUser(request);
      const result = await execute(
        db,
        `UPDATE refresh_tokens SET revoked_at = ?, revoke_reason = 'session_revoked'
          WHERE family_id = ? AND user_id = ? AND revoked_at IS NULL`,
        [clock(), request.params.familyId, userId],
      );
      if (result.affectedRows === 0) throw notFound('Session not found');
      return reply.status(204).send();
    },
  );

  routes.delete(
    '/api/me',
    { preHandler: requireUser, schema: { body: deleteAccountBodySchema }, config: sensitive },
    async (request, reply) => {
      const { userId, sessionId } = currentUser(request);
      const now = clock();
      await deleteAccount(
        { pool: db, storageDir: config.STORAGE_DIR, log: request.log },
        userId,
        request.body.password,
        request.body.confirmUsername,
        now,
      );
      await revokeFamily(db, sessionId, 'account_deleted', now);
      clearRefreshCookie(reply, config);
      return reply.status(204).send();
    },
  );
}

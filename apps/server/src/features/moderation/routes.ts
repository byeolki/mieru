import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  adminReportListResponseSchema,
  createReportBodySchema,
  reportStatusSchema,
  resolveReportBodySchema,
  takedownBodySchema,
} from '@mieru/shared';
import type { Clock } from '../../clock.js';
import type { DbPool } from '../../db/pool.js';
import { selectOne } from '../../db/query.js';
import { forbidden } from '../../errors.js';
import { currentUser, requireUser } from '../../plugins/auth.js';
import type { ModelGateFactory } from '../../plugins/model-access.js';
import { LIMITS, routeLimit } from '../../plugins/rate-limits.js';
import {
  createReport,
  listReports,
  resolveReport,
  restoreModel,
  takedownModel,
} from './service.js';

export interface ModerationRouteDeps {
  db: DbPool;
  clock: Clock;
  rateLimitEnabled: boolean;
  requireModelAccess: ModelGateFactory;
}

const idParams = z.object({ id: z.uuid() });

/**
 * Reads the role from the database on every request (not from the access token) so that
 * revoking admin rights takes effect immediately.
 */
function adminGate(db: DbPool) {
  return async (request: FastifyRequest): Promise<void> => {
    const row = await selectOne<{ role: string }>(db, 'SELECT role FROM users WHERE id = ?', [
      currentUser(request).userId,
    ]);
    if (row?.role !== 'admin') throw forbidden('Admins only');
  };
}

export function registerModerationRoutes(app: FastifyInstance, deps: ModerationRouteDeps): void {
  const { db, clock, rateLimitEnabled, requireModelAccess } = deps;
  const routes = app.withTypeProvider<ZodTypeProvider>();
  const requireAdmin = [requireUser, adminGate(db)];

  routes.post(
    '/api/models/:id/reports',
    {
      preHandler: requireModelAccess('viewer'),
      config: routeLimit(LIMITS.report, rateLimitEnabled),
      schema: { params: idParams, body: createReportBodySchema },
    },
    async (request, reply) => {
      await createReport(
        db,
        request.params.id,
        request.body,
        { userId: request.auth?.userId ?? null, ip: request.ip },
        clock(),
      );
      return reply.status(204).send();
    },
  );

  routes.get(
    '/api/admin/reports',
    {
      preHandler: requireAdmin,
      schema: {
        querystring: z.object({ status: reportStatusSchema.default('open') }),
        response: { 200: adminReportListResponseSchema },
      },
    },
    async (request, reply) => {
      reply.header('cache-control', 'private, no-store');
      return { items: await listReports(db, request.query.status) };
    },
  );

  routes.post(
    '/api/admin/reports/:id/resolve',
    { preHandler: requireAdmin, schema: { params: idParams, body: resolveReportBodySchema } },
    async (request, reply) => {
      await resolveReport(
        db,
        request.params.id,
        request.body,
        currentUser(request).userId,
        clock(),
      );
      return reply.status(204).send();
    },
  );

  routes.post(
    '/api/admin/models/:id/takedown',
    { preHandler: requireAdmin, schema: { params: idParams, body: takedownBodySchema } },
    async (request, reply) => {
      await takedownModel(
        db,
        request.params.id,
        request.body.reason,
        currentUser(request).userId,
        clock(),
      );
      return reply.status(204).send();
    },
  );

  routes.post(
    '/api/admin/models/:id/restore',
    { preHandler: requireAdmin, schema: { params: idParams } },
    async (request, reply) => {
      await restoreModel(db, request.params.id, currentUser(request).userId, clock());
      return reply.status(204).send();
    },
  );
}

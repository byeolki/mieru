import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { tensorFiltersSchema, tensorListResponseSchema, tensorStatsSchema } from '@mieru/shared';
import type { AppConfig } from '../../config.js';
import type { DbPool } from '../../db/pool.js';
import type { ModelGateFactory } from '../../plugins/model-access.js';
import { listTensors, tensorFilters, tensorStats } from './service.js';

export interface WeightRouteDeps {
  config: AppConfig;
  db: DbPool;
  requireModelAccess: ModelGateFactory;
}

const idParams = z.object({ id: z.uuid() });
const versionQuery = { version: z.coerce.number().int().positive().optional() };
const tensorQuery = z.object({ name: z.string().min(1).max(1024), ...versionQuery });

export function registerWeightRoutes(app: FastifyInstance, deps: WeightRouteDeps): void {
  const { config, db, requireModelAccess } = deps;
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/api/models/:id/tensors',
    {
      preHandler: requireModelAccess('viewer'),
      schema: {
        params: idParams,
        querystring: z.object(versionQuery),
        response: { 200: tensorListResponseSchema },
      },
    },
    async (request) => ({
      items: await listTensors(
        db,
        config.STORAGE_DIR,
        request.params.id,
        request.query.version ?? null,
      ),
    }),
  );

  routes.get(
    '/api/models/:id/tensors/stats',
    {
      preHandler: requireModelAccess('viewer'),
      schema: { params: idParams, querystring: tensorQuery, response: { 200: tensorStatsSchema } },
    },
    async (request) =>
      tensorStats(
        db,
        config.STORAGE_DIR,
        request.params.id,
        request.query.name,
        request.query.version ?? null,
      ),
  );

  // Filter images are the raw weights, so they follow the download permission (plan D33).
  routes.get(
    '/api/models/:id/tensors/filters',
    {
      preHandler: requireModelAccess('viewer', { download: true }),
      schema: {
        params: idParams,
        querystring: tensorQuery,
        response: { 200: tensorFiltersSchema },
      },
    },
    async (request) =>
      tensorFilters(
        db,
        config.STORAGE_DIR,
        request.params.id,
        request.query.name,
        request.query.version ?? null,
      ),
  );
}

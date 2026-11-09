import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { designListResponseSchema, designSchema, saveDesignBodySchema } from '@mieru/shared';
import type { Clock } from '../../clock.js';
import type { DbPool } from '../../db/pool.js';
import { currentUser, requireUser } from '../../plugins/auth.js';
import { createDesign, deleteDesign, getDesign, listDesigns, updateDesign } from './service.js';

export interface DesignRouteDeps {
  db: DbPool;
  clock: Clock;
}

const idParams = z.object({ id: z.uuid() });
// A 200-layer spec is a few tens of KB; this leaves room without inviting abuse.
const DESIGN_BODY_LIMIT = 256 * 1024;

export function registerDesignRoutes(app: FastifyInstance, deps: DesignRouteDeps): void {
  const { db, clock } = deps;
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/api/designs',
    { preHandler: requireUser, schema: { response: { 200: designListResponseSchema } } },
    async (request) => ({ items: await listDesigns(db, currentUser(request).userId) }),
  );

  routes.post(
    '/api/designs',
    {
      preHandler: requireUser,
      bodyLimit: DESIGN_BODY_LIMIT,
      schema: { body: saveDesignBodySchema, response: { 201: designSchema } },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(await createDesign(db, currentUser(request).userId, request.body, clock())),
  );

  routes.get(
    '/api/designs/:id',
    { schema: { params: idParams, response: { 200: designSchema } } },
    async (request) => getDesign(db, request.params.id, request.auth?.userId ?? null),
  );

  routes.put(
    '/api/designs/:id',
    {
      preHandler: requireUser,
      bodyLimit: DESIGN_BODY_LIMIT,
      schema: { params: idParams, body: saveDesignBodySchema, response: { 200: designSchema } },
    },
    async (request) =>
      updateDesign(db, request.params.id, currentUser(request).userId, request.body, clock()),
  );

  routes.delete(
    '/api/designs/:id',
    { preHandler: requireUser, schema: { params: idParams } },
    async (request, reply) => {
      await deleteDesign(db, request.params.id, currentUser(request).userId);
      return reply.status(204).send();
    },
  );
}

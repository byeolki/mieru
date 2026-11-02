import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createShareLinkBodySchema,
  resolvedLinkSchema,
  shareLinkSchema,
  shareSchema,
  updateShareLinkBodySchema,
  upsertShareBodySchema,
  userSummarySchema,
  usernameSchema,
} from '@mieru/shared';
import type { Clock } from '../../clock.js';
import type { AppConfig } from '../../config.js';
import type { DbPool } from '../../db/pool.js';
import { notFound } from '../../errors.js';
import { currentUser, requireUser } from '../../plugins/auth.js';
import type { ModelGateFactory } from '../../plugins/model-access.js';
import { LIMITS, routeLimit } from '../../plugins/rate-limits.js';
import {
  createShareLink,
  listShareLinks,
  listShares,
  removeShare,
  resolveShareLink,
  revokeShareLink,
  searchUsers,
  updateShareLink,
  upsertShare,
} from './service.js';

export interface SharingRouteDeps {
  config: AppConfig;
  db: DbPool;
  clock: Clock;
  rateLimitEnabled: boolean;
  requireModelAccess: ModelGateFactory;
}

const idParams = z.object({ id: z.uuid() });

export function registerSharingRoutes(app: FastifyInstance, deps: SharingRouteDeps): void {
  const { config, db, clock, rateLimitEnabled, requireModelAccess } = deps;
  const routes = app.withTypeProvider<ZodTypeProvider>();
  const ownerOnly = [requireUser, requireModelAccess('owner', { loggedIn: true })];
  const linkContext = { appOrigin: config.APP_ORIGIN, linkTokenKey: config.LINK_TOKEN_KEY };

  routes.get(
    '/api/models/:id/shares',
    {
      preHandler: ownerOnly,
      schema: { params: idParams, response: { 200: z.array(shareSchema) } },
    },
    async (request) => listShares(db, request.params.id),
  );

  routes.put(
    '/api/models/:id/shares/:username',
    {
      preHandler: ownerOnly,
      schema: {
        params: idParams.extend({ username: usernameSchema }),
        body: upsertShareBodySchema,
        response: { 200: shareSchema },
      },
    },
    async (request) =>
      upsertShare(
        db,
        request.params.id,
        currentUser(request).userId,
        request.params.username,
        request.body.role,
        request.body.allowDownload,
      ),
  );

  routes.delete(
    '/api/models/:id/shares/:username',
    { preHandler: ownerOnly, schema: { params: idParams.extend({ username: usernameSchema }) } },
    async (request, reply) => {
      await removeShare(db, request.params.id, request.params.username);
      return reply.status(204).send();
    },
  );

  routes.get(
    '/api/models/:id/share-links',
    {
      preHandler: ownerOnly,
      schema: { params: idParams, response: { 200: z.array(shareLinkSchema) } },
    },
    async (request) => listShareLinks(db, request.params.id, linkContext),
  );

  routes.post(
    '/api/models/:id/share-links',
    {
      preHandler: ownerOnly,
      schema: {
        params: idParams,
        body: createShareLinkBodySchema,
        response: { 201: shareLinkSchema },
      },
    },
    async (request, reply) => {
      const link = await createShareLink(
        db,
        request.params.id,
        currentUser(request).userId,
        request.body,
        linkContext,
      );
      return reply.status(201).send(link);
    },
  );

  routes.patch(
    '/api/models/:id/share-links/:linkId',
    {
      preHandler: ownerOnly,
      schema: {
        params: idParams.extend({ linkId: z.uuid() }),
        body: updateShareLinkBodySchema,
        response: { 200: shareLinkSchema },
      },
    },
    async (request) =>
      updateShareLink(db, request.params.id, request.params.linkId, request.body, linkContext),
  );

  routes.delete(
    '/api/models/:id/share-links/:linkId',
    { preHandler: ownerOnly, schema: { params: idParams.extend({ linkId: z.uuid() }) } },
    async (request, reply) => {
      await revokeShareLink(db, request.params.id, request.params.linkId, clock());
      return reply.status(204).send();
    },
  );

  routes.post(
    '/api/share-links/resolve',
    {
      config: routeLimit(LIMITS.shareLinkResolve, rateLimitEnabled),
      schema: { response: { 200: resolvedLinkSchema } },
    },
    async (request, reply) => {
      const header = request.headers['x-share-link'];
      if (typeof header !== 'string' || header.length === 0 || header.length > 128)
        throw notFound('Link not found');
      reply.header('cache-control', 'no-store');
      return resolveShareLink(db, header, request.auth?.userId ?? null, clock());
    },
  );

  routes.get(
    '/api/users/search',
    {
      preHandler: requireUser,
      config: routeLimit(LIMITS.userSearch, rateLimitEnabled),
      schema: {
        querystring: z.object({ q: z.string().trim().min(1).max(30) }),
        response: { 200: z.array(userSummarySchema) },
      },
    },
    async (request) => {
      const rows = await searchUsers(db, request.query.q, currentUser(request).userId);
      return rows.map((row) => ({
        id: row.id,
        username: row.username,
        displayName: row.display_name,
      }));
    },
  );
}

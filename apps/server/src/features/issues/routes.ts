import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  activityResponseSchema,
  createIssueBodySchema,
  issueKindSchema,
  issueListResponseSchema,
  issueSchema,
  issueStateSchema,
  replyBodySchema,
  updateIssueBodySchema,
} from '@mieru/shared';
import type { Clock } from '../../clock.js';
import type { AppConfig } from '../../config.js';
import type { DbPool } from '../../db/pool.js';
import { AppError } from '../../errors.js';
import { currentUser, requireUser } from '../../plugins/auth.js';
import { currentModelAccess, type ModelGateFactory } from '../../plugins/model-access.js';
import { LIMITS, routeLimit } from '../../plugins/rate-limits.js';
import { isKnownNodeRef } from './node-refs.js';
import {
  activityFeed,
  createIssue,
  createReply,
  deleteIssue,
  deleteReply,
  getIssue,
  listIssues,
  nodeIssueCounts,
  updateIssue,
  updateReply,
} from './service.js';

export interface IssueRouteDeps {
  config: AppConfig;
  db: DbPool;
  clock: Clock;
  rateLimitEnabled: boolean;
  requireModelAccess: ModelGateFactory;
}

const issueParams = z.object({ id: z.uuid(), number: z.coerce.number().int().positive() });

export function registerIssueRoutes(app: FastifyInstance, deps: IssueRouteDeps): void {
  const { config, db, clock, rateLimitEnabled, requireModelAccess } = deps;
  const routes = app.withTypeProvider<ZodTypeProvider>();
  const viewer = requireModelAccess('viewer');
  const signedInViewer = [requireUser, requireModelAccess('viewer', { loggedIn: true })];

  routes.get(
    '/api/models/:id/issues',
    {
      preHandler: viewer,
      schema: {
        params: z.object({ id: z.uuid() }),
        querystring: z.object({
          state: issueStateSchema.default('open'),
          kind: issueKindSchema.optional(),
          nodeRef: z.string().max(512).optional(),
          limit: z.coerce.number().int().min(1).max(50).default(25),
          cursor: z.string().max(200).optional(),
        }),
        response: { 200: issueListResponseSchema },
      },
    },
    async (request) => listIssues(db, request.params.id, request.query),
  );

  routes.get(
    '/api/models/:id/issues/node-counts',
    {
      preHandler: viewer,
      schema: {
        params: z.object({ id: z.uuid() }),
        response: { 200: z.record(z.string(), z.number()) },
      },
    },
    async (request) => nodeIssueCounts(db, request.params.id),
  );

  routes.post(
    '/api/models/:id/issues',
    {
      preHandler: signedInViewer,
      config: routeLimit(LIMITS.issueCreate, rateLimitEnabled),
      schema: {
        params: z.object({ id: z.uuid() }),
        body: createIssueBodySchema,
        response: { 201: issueSchema },
      },
    },
    async (request, reply) => {
      const { userId } = currentUser(request);
      if (
        request.body.nodeRef &&
        (await isKnownNodeRef(db, config.STORAGE_DIR, request.params.id, request.body.nodeRef)) ===
          false
      ) {
        throw new AppError(422, 'unknown_node', 'That node does not exist in the current version');
      }
      const now = clock();
      const number = await createIssue(db, request.params.id, userId, request.body, now);
      return reply
        .status(201)
        .send(
          await getIssue(db, request.params.id, number, currentModelAccess(request), userId, now),
        );
    },
  );

  routes.get(
    '/api/models/:id/issues/:number',
    { preHandler: viewer, schema: { params: issueParams, response: { 200: issueSchema } } },
    async (request) =>
      getIssue(
        db,
        request.params.id,
        request.params.number,
        currentModelAccess(request),
        request.auth?.userId ?? null,
        clock(),
      ),
  );

  routes.patch(
    '/api/models/:id/issues/:number',
    {
      preHandler: signedInViewer,
      schema: { params: issueParams, body: updateIssueBodySchema, response: { 200: issueSchema } },
    },
    async (request) => {
      const { userId } = currentUser(request);
      const access = currentModelAccess(request);
      const now = clock();
      await updateIssue(
        db,
        request.params.id,
        request.params.number,
        access,
        userId,
        request.body,
        now,
      );
      return getIssue(db, request.params.id, request.params.number, access, userId, now);
    },
  );

  routes.delete(
    '/api/models/:id/issues/:number',
    { preHandler: signedInViewer, schema: { params: issueParams } },
    async (request, reply) => {
      await deleteIssue(
        db,
        request.params.id,
        request.params.number,
        currentModelAccess(request),
        currentUser(request).userId,
        clock(),
      );
      return reply.status(204).send();
    },
  );

  routes.post(
    '/api/models/:id/issues/:number/replies',
    {
      preHandler: signedInViewer,
      config: routeLimit(LIMITS.replyCreate, rateLimitEnabled),
      schema: { params: issueParams, body: replyBodySchema, response: { 201: issueSchema } },
    },
    async (request, reply) => {
      const { userId } = currentUser(request);
      const access = currentModelAccess(request);
      const now = clock();
      await createReply(
        db,
        request.params.id,
        request.params.number,
        access,
        userId,
        request.body.body,
        now,
      );
      return reply
        .status(201)
        .send(await getIssue(db, request.params.id, request.params.number, access, userId, now));
    },
  );

  routes.patch(
    '/api/models/:id/issues/:number/replies/:replyId',
    {
      preHandler: signedInViewer,
      schema: { params: issueParams.extend({ replyId: z.uuid() }), body: replyBodySchema },
    },
    async (request, reply) => {
      await updateReply(
        db,
        request.params.id,
        request.params.number,
        request.params.replyId,
        currentUser(request).userId,
        request.body.body,
      );
      return reply.status(204).send();
    },
  );

  routes.delete(
    '/api/models/:id/issues/:number/replies/:replyId',
    { preHandler: signedInViewer, schema: { params: issueParams.extend({ replyId: z.uuid() }) } },
    async (request, reply) => {
      await deleteReply(
        db,
        request.params.id,
        request.params.number,
        request.params.replyId,
        currentModelAccess(request),
        currentUser(request).userId,
        clock(),
      );
      return reply.status(204).send();
    },
  );

  routes.get(
    '/api/me/activity',
    { preHandler: requireUser, schema: { response: { 200: activityResponseSchema } } },
    async (request) => activityFeed(db, currentUser(request).userId),
  );
}

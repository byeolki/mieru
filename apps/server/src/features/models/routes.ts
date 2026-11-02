import { createReadStream } from 'node:fs';
import { access as fileAccess } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  PARSER_VERSION,
  createModelBodySchema,
  fileTicketBodySchema,
  fileTicketResponseSchema,
  modelDetailSchema,
  modelListResponseSchema,
  readmeResponseSchema,
  updateModelBodySchema,
  updateReadmeBodySchema,
} from '@mieru/shared';
import type { Clock } from '../../clock.js';
import type { AppConfig } from '../../config.js';
import type { DbPool } from '../../db/pool.js';
import { selectOne } from '../../db/query.js';
import { AppError, notFound, unauthorized } from '../../errors.js';
import { currentUser, requireUser } from '../../plugins/auth.js';
import {
  currentModelAccess,
  principalOf,
  type ModelGateFactory,
} from '../../plugins/model-access.js';
import { sidecarPath } from '../../storage/disk.js';
import { pathFor } from '../../storage/paths.js';
import { sendStoredFile } from './files.js';
import type { ProcessingQueue } from './processing.js';
import {
  createModel,
  deleteModel,
  getModelDetail,
  getReadme,
  listModels,
  saveReadme,
  updateModel,
} from './service.js';
import { createTicket, verifyTicket } from './tickets.js';
import { recordView, viewerHash } from '../explore/views.js';

export interface ModelRouteDeps {
  config: AppConfig;
  db: DbPool;
  clock: Clock;
  queue: ProcessingQueue;
  requireModelAccess: ModelGateFactory;
}

const idParams = z.object({ id: z.uuid() });

interface StoredVersion {
  version_id: string;
  status: string;
  blob_id: string | null;
  storage_key: string | null;
  original_name: string | null;
}

async function findStoredVersion(
  db: DbPool,
  modelId: string,
  versionNumber: number | undefined,
  kind: 'model' | 'labels',
): Promise<StoredVersion | null> {
  const versionFilter =
    versionNumber === undefined ? 'v.id = m.current_version_id' : 'v.version_number = ?';
  return selectOne<StoredVersion>(
    db,
    `SELECT v.id AS version_id, v.status, b.id AS blob_id, b.storage_key, f.original_name
       FROM models m
       JOIN model_versions v ON v.model_id = m.id AND ${versionFilter}
       LEFT JOIN model_files f ON f.version_id = v.id AND f.kind = ?
       LEFT JOIN blobs b ON b.id = f.blob_id
      WHERE m.id = ?`,
    versionNumber === undefined ? [kind, modelId] : [versionNumber, kind, modelId],
  );
}

export function registerModelRoutes(app: FastifyInstance, deps: ModelRouteDeps): void {
  const { config, db, clock, queue, requireModelAccess } = deps;
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/api/models',
    {
      preHandler: requireUser,
      schema: {
        querystring: z.object({
          scope: z.enum(['owned', 'shared']).default('owned'),
          limit: z.coerce.number().int().min(1).max(50).default(20),
          cursor: z.string().max(200).optional(),
        }),
        response: { 200: modelListResponseSchema },
      },
    },
    async (request) =>
      listModels(db, currentUser(request).userId, request.query.scope, {
        limit: request.query.limit,
        cursor: request.query.cursor,
        now: clock(),
      }),
  );

  routes.post(
    '/api/models',
    {
      preHandler: requireUser,
      schema: { body: createModelBodySchema, response: { 202: modelDetailSchema } },
    },
    async (request, reply) => {
      const { userId } = currentUser(request);
      const { modelId, versionId } = await createModel(db, userId, request.body, clock());
      queue.enqueueVersion(versionId);
      const detail = await getModelDetail(
        db,
        modelId,
        { role: 'owner', canDownload: true, via: 'owner' },
        userId,
      );
      return reply.status(202).send(detail);
    },
  );

  routes.get(
    '/api/models/:id',
    {
      preHandler: requireModelAccess('viewer'),
      schema: { params: idParams, response: { 200: modelDetailSchema } },
    },
    async (request, reply) => {
      reply.header('cache-control', 'private, no-store');
      const access = currentModelAccess(request);
      const detail = await getModelDetail(
        db,
        request.params.id,
        access,
        request.auth?.userId ?? null,
      );
      // Owners and editors don't count as views, so they can't inflate trending.
      if (access.role === 'viewer') {
        const now = clock();
        const hash = viewerHash(
          {
            userId: request.auth?.userId ?? null,
            ip: request.ip,
            userAgent: request.headers['user-agent'] ?? null,
          },
          config.VIEW_SALT_SECRET,
          now,
        );
        recordView(db, request.params.id, hash, now).catch((error: unknown) => {
          request.log.warn({ err: error }, 'view not recorded');
        });
      }
      return detail;
    },
  );

  routes.patch(
    '/api/models/:id',
    {
      preHandler: [requireUser, requireModelAccess('editor', { loggedIn: true })],
      schema: {
        params: idParams,
        body: updateModelBodySchema,
        response: { 200: modelDetailSchema },
      },
    },
    async (request) => {
      const access = currentModelAccess(request);
      await updateModel(db, request.params.id, access, request.body, clock());
      return getModelDetail(db, request.params.id, access, currentUser(request).userId);
    },
  );

  routes.delete(
    '/api/models/:id',
    {
      preHandler: [requireUser, requireModelAccess('owner', { loggedIn: true })],
      schema: { params: idParams },
    },
    async (request, reply) => {
      await deleteModel(db, config.STORAGE_DIR, request.params.id, request.log);
      return reply.status(204).send();
    },
  );

  routes.get(
    '/api/models/:id/readme',
    {
      preHandler: requireModelAccess('viewer'),
      schema: { params: idParams, response: { 200: readmeResponseSchema } },
    },
    async (request) => getReadme(db, request.params.id),
  );

  routes.put(
    '/api/models/:id/readme',
    {
      preHandler: [requireUser, requireModelAccess('editor', { loggedIn: true })],
      bodyLimit: 512 * 1024,
      schema: {
        params: idParams,
        body: updateReadmeBodySchema,
        response: { 200: readmeResponseSchema },
      },
    },
    async (request) => {
      await saveReadme(
        db,
        request.params.id,
        currentUser(request).userId,
        request.body.markdown,
        request.body.baseUpdatedAt,
        clock(),
      );
      return getReadme(db, request.params.id);
    },
  );

  routes.get(
    '/api/models/:id/graph',
    {
      preHandler: requireModelAccess('viewer'),
      schema: {
        params: idParams,
        querystring: z.object({ version: z.coerce.number().int().positive().optional() }),
      },
    },
    async (request, reply) => {
      const stored = await findStoredVersion(db, request.params.id, request.query.version, 'model');
      if (!stored) throw notFound('Version not found');
      if (stored.status !== 'ready' || !stored.storage_key || !stored.blob_id) {
        throw new AppError(409, 'not_ready', 'This version is still being processed', {
          retryAfterSec: 2,
        });
      }
      const etag = `"${stored.storage_key}.v${PARSER_VERSION}"`;
      reply
        .header('etag', etag)
        .header('cache-control', 'private, no-cache')
        .header('vary', 'Authorization, X-Share-Link');
      if (request.headers['if-none-match'] === etag) return reply.status(304).send();
      const filePath = sidecarPath(config.STORAGE_DIR, stored.storage_key, 'graph', PARSER_VERSION);
      try {
        await fileAccess(filePath);
      } catch {
        queue.enqueueReparse(stored.blob_id);
        throw new AppError(409, 'not_ready', 'The view is being updated', { retryAfterSec: 2 });
      }
      return reply
        .header('content-type', 'application/json; charset=utf-8')
        .header('content-encoding', 'gzip')
        .send(createReadStream(filePath));
    },
  );

  routes.post(
    '/api/models/:id/file-ticket',
    {
      preHandler: requireModelAccess('viewer', { download: true }),
      schema: {
        params: idParams,
        body: fileTicketBodySchema,
        response: { 200: fileTicketResponseSchema },
      },
    },
    async (request) => {
      const stored = await findStoredVersion(
        db,
        request.params.id,
        request.body.version,
        request.body.kind,
      );
      if (!stored?.storage_key) throw notFound('File not found');
      const principal = principalOf(request);
      const { token, expiresAt } = createTicket(
        {
          modelId: request.params.id,
          versionId: stored.version_id,
          kind: request.body.kind,
          userId: principal.userId,
          linkTokenHash: principal.linkTokenHash?.toString('hex') ?? null,
        },
        config.TICKET_SECRET,
        clock(),
      );
      return {
        url: `/api/models/${request.params.id}/file?ticket=${token}`,
        expiresAt: expiresAt.toISOString(),
      };
    },
  );

  routes.get(
    '/api/models/:id/file',
    {
      preHandler: [
        (request) => {
          const { ticket } = request.query as { ticket?: string };
          const verified = ticket ? verifyTicket(ticket, config.TICKET_SECRET, clock()) : null;
          const { id } = request.params;
          if (!verified) {
            return Promise.reject(
              unauthorized('invalid_ticket', 'Download link expired; request a new one'),
            );
          }
          if (verified.modelId !== id) return Promise.reject(notFound('Model not found'));
          request.ticketPrincipal = verified.principal;
          return Promise.resolve();
        },
        requireModelAccess('viewer', { download: true }),
      ],
      schema: { params: idParams, querystring: z.object({ ticket: z.string().max(2048) }) },
    },
    async (request, reply) => {
      const verified = verifyTicket(request.query.ticket, config.TICKET_SECRET, clock());
      if (!verified)
        throw unauthorized('invalid_ticket', 'Download link expired; request a new one');
      const stored = await selectOne<{ storage_key: string; original_name: string }>(
        db,
        `SELECT b.storage_key, f.original_name FROM model_files f JOIN blobs b ON b.id = f.blob_id
          WHERE f.version_id = ? AND f.kind = ?`,
        [verified.versionId, verified.kind],
      );
      if (!stored) throw notFound('File not found');
      return sendStoredFile(
        reply,
        pathFor(config.STORAGE_DIR, 'blobs', stored.storage_key),
        stored.original_name,
        request.headers.range,
      );
    },
  );
}

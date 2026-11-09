import path from 'node:path';
import { FileStore } from '@tus/file-store';
import { Server, type Upload } from '@tus/server';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { hasRoleAtLeast } from '@mieru/shared';
import type { Clock } from '../../clock.js';
import type { AppConfig } from '../../config.js';
import type { DbPool } from '../../db/pool.js';
import { execute, selectOne } from '../../db/query.js';
import { conflict, notFound, unauthorized } from '../../errors.js';
import { newId } from '../../ids.js';
import { LIMITS, routeLimit } from '../../plugins/rate-limits.js';
import { freeBytes } from '../../storage/disk.js';
import { isStorageKey } from '../../storage/paths.js';
import { repositoryBytes } from '../models/versions.js';
import { resolveModelAccess } from '../sharing/access-service.js';
import { formatFromFilename, maxBytesFor, sanitizeFilename } from './formats.js';

const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
// Set by this server after authenticating the request; any client-sent copy is removed first.
const USER_HEADER = 'x-mieru-authenticated-user';

/** The error shape tus turns into an HTTP response; the body uses our API error format. */
class TusRejection extends Error {
  readonly status_code: number;
  readonly body: string;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.status_code = status;
    this.body = JSON.stringify({ error: details ? { code, message, details } : { code, message } });
  }
}

function reject(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): TusRejection {
  return new TusRejection(status, code, message, details);
}

export interface UploadDeps {
  config: AppConfig;
  db: DbPool;
  clock: Clock;
  rateLimitEnabled: boolean;
}

/**
 * An upload meant as a new version must come from an editor of that repository and keep the
 * repository under its size limit, so oversized pushes fail before any byte is sent.
 */
async function assertCanAddVersion(
  db: DbPool,
  config: AppConfig,
  target: { modelId: string; userId: string; size: number; now: Date },
): Promise<void> {
  if (!isStorageKey(target.modelId)) throw reject(404, 'not_found', 'Model not found');
  const access = await resolveModelAccess(
    db,
    target.modelId,
    { userId: target.userId, linkTokenHash: null },
    target.now,
  );
  if (!access) throw reject(404, 'not_found', 'Model not found');
  if (!hasRoleAtLeast(access.role, 'editor')) {
    throw reject(403, 'forbidden', 'Only editors can add versions');
  }
  const used = await repositoryBytes(db, target.modelId);
  if (used + target.size > config.MAX_REPO_BYTES) {
    throw reject(
      413,
      'repository_too_large',
      'This version would push the repository over its limit',
      {
        maxBytes: config.MAX_REPO_BYTES,
        usedBytes: used,
      },
    );
  }
}

export function createTusServer({ config, db, clock }: UploadDeps): Server {
  return new Server({
    path: '/api/uploads',
    datastore: new FileStore({
      directory: path.join(path.resolve(config.STORAGE_DIR), 'uploads'),
      expirationPeriodInMilliseconds: UPLOAD_TTL_MS,
    }),
    relativeLocation: true,
    respectForwardedHeaders: false,
    maxSize: config.MAX_SAFETENSORS_BYTES,
    namingFunction: () => newId(),
    onUploadCreate: async (request, upload: Upload) => {
      const userId = request.headers.get(USER_HEADER);
      if (!userId) throw reject(401, 'unauthorized', 'Authentication required');
      if (upload.size === undefined)
        throw reject(400, 'length_required', 'Upload-Length is required');
      const filename = sanitizeFilename(upload.metadata?.filename ?? '');
      const format = formatFromFilename(filename);
      if (!format.ok) {
        throw reject(415, 'unsupported_format', 'Only .onnx and .safetensors files are supported', {
          hint: format.hint,
        });
      }
      if (upload.size > maxBytesFor(format.format, config)) {
        throw reject(413, 'file_too_large', 'File is larger than the limit for this format', {
          maxBytes: maxBytesFor(format.format, config),
        });
      }
      if ((await freeBytes(config.STORAGE_DIR)) < upload.size + config.DISK_RESERVE_BYTES) {
        throw reject(507, 'server_storage_low', 'The server is running low on storage');
      }
      const now = clock();
      const targetModelId = upload.metadata?.targetModelId ?? null;
      if (targetModelId) {
        await assertCanAddVersion(db, config, {
          modelId: targetModelId,
          userId,
          size: upload.size,
          now,
        });
      }
      await execute(
        db,
        `INSERT INTO uploads (id, user_id, original_name, declared_size, target_model_id, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          upload.id,
          userId,
          filename,
          upload.size,
          targetModelId,
          new Date(now.getTime() + UPLOAD_TTL_MS),
          now,
        ],
      );
      return { metadata: { ...upload.metadata, filename } };
    },
    onUploadFinish: async (_request, upload: Upload) => {
      await execute(db, 'UPDATE uploads SET completed_at = ? WHERE id = ?', [clock(), upload.id]);
      return {};
    },
  });
}

/**
 * Mounts the tus 1.0 protocol under /api/uploads. Fastify authenticates and checks ownership,
 * then hands the raw request to tus, which streams chunks straight to disk.
 */
export function registerUploadRoutes(app: FastifyInstance, deps: UploadDeps): Server {
  const tus = createTusServer(deps);

  // tus reads the PATCH body itself; Fastify must leave the stream untouched.
  app.addContentTypeParser('application/offset+octet-stream', (_request, _payload, done) => {
    done(null);
  });

  const handOff = async (request: FastifyRequest, reply: FastifyReply) => {
    // tus builds its request from rawHeaders, so both views are rewritten: any client-sent
    // copy is dropped and only the identity verified by Fastify is passed on.
    const raw = request.raw;
    Reflect.deleteProperty(raw.headers, USER_HEADER);
    const rawHeaders: string[] = [];
    for (let index = 0; index < raw.rawHeaders.length; index += 2) {
      const name = raw.rawHeaders[index] ?? '';
      if (name.toLowerCase() !== USER_HEADER)
        rawHeaders.push(name, raw.rawHeaders[index + 1] ?? '');
    }
    if (request.auth) {
      raw.headers[USER_HEADER] = request.auth.userId;
      rawHeaders.push(USER_HEADER, request.auth.userId);
    }
    raw.rawHeaders = rawHeaders;
    reply.hijack();
    await tus.handle(request.raw, reply.raw);
  };

  const requireOwnedUpload = async (request: FastifyRequest) => {
    if (!request.auth) throw unauthorized();
    const { uploadId } = request.params as { uploadId: string };
    if (!isStorageKey(uploadId)) throw notFound('Upload not found');
    const row = await selectOne<{ user_id: string; consumed_at: Date | null }>(
      deps.db,
      'SELECT user_id, consumed_at FROM uploads WHERE id = ?',
      [uploadId],
    );
    if (row?.user_id !== request.auth.userId) throw notFound('Upload not found');
    // Once a repository or version took the upload, its file belongs to the processing job;
    // terminating it now would delete the file out from under the parser.
    if (row.consumed_at && request.method === 'DELETE') {
      throw conflict('upload_consumed', 'This upload is already part of a model');
    }
  };

  app.options('/api/uploads', handOff);
  app.options('/api/uploads/:uploadId', handOff);
  app.post(
    '/api/uploads',
    {
      preHandler: (request) => (request.auth ? Promise.resolve() : Promise.reject(unauthorized())),
      config: routeLimit(LIMITS.uploadCreate, deps.rateLimitEnabled),
    },
    handOff,
  );
  app.route({
    method: ['HEAD', 'PATCH', 'DELETE'],
    url: '/api/uploads/:uploadId',
    preHandler: requireOwnedUpload,
    handler: handOff,
  });

  return tus;
}

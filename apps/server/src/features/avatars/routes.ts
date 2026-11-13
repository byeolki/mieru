import { createReadStream } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { meSchema } from '@mieru/shared';
import type { AppConfig } from '../../config.js';
import type { DbPool } from '../../db/pool.js';
import { selectOne } from '../../db/query.js';
import { notFound, unauthorized } from '../../errors.js';
import { currentUser, requireUser } from '../../plugins/auth.js';
import { LIMITS, routeLimit } from '../../plugins/rate-limits.js';
import { pathFor } from '../../storage/paths.js';
import { findUserById, toMe } from '../users/repo.js';
import { AVATAR_MAX_BYTES } from './png.js';
import { clearAvatar, setAvatar } from './service.js';

const YEAR_SECONDS = 365 * 24 * 60 * 60;

export function registerAvatarRoutes(
  app: FastifyInstance,
  deps: { config: AppConfig; db: DbPool; rateLimitEnabled: boolean },
): void {
  const { config, db, rateLimitEnabled } = deps;
  const routes = app.withTypeProvider<ZodTypeProvider>();

  // Raw PNG bytes; a little headroom so oversized files reach the clearer 400 below.
  app.addContentTypeParser(
    'image/png',
    { parseAs: 'buffer', bodyLimit: AVATAR_MAX_BYTES * 2 },
    (_request, body, done) => {
      done(null, body);
    },
  );

  const meAfterChange = async (userId: string) => {
    const user = await findUserById(db, userId);
    if (!user) throw unauthorized();
    return toMe(user);
  };

  routes.put(
    '/api/me/avatar',
    {
      preHandler: requireUser,
      config: routeLimit(LIMITS.sensitiveAccountChange, rateLimitEnabled),
      schema: { response: { 200: meSchema } },
    },
    async (request) => {
      const { userId } = currentUser(request);
      const body = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
      await setAvatar(db, config.STORAGE_DIR, userId, body);
      return meAfterChange(userId);
    },
  );

  routes.delete(
    '/api/me/avatar',
    { preHandler: requireUser, schema: { response: { 200: meSchema } } },
    async (request) => {
      const { userId } = currentUser(request);
      await clearAvatar(db, config.STORAGE_DIR, userId);
      return meAfterChange(userId);
    },
  );

  routes.get(
    '/api/avatars/:key',
    { schema: { params: z.object({ key: z.uuid() }) } },
    async (request, reply) => {
      const owner = await selectOne<{ id: string }>(
        db,
        'SELECT id FROM users WHERE avatar_key = ?',
        [request.params.key],
      );
      if (!owner) throw notFound('Avatar not found');
      return reply
        .header('content-type', 'image/png')
        .header('x-content-type-options', 'nosniff')
        .header('cache-control', `public, max-age=${String(YEAR_SECONDS)}, immutable`)
        .send(createReadStream(pathFor(config.STORAGE_DIR, 'avatars', request.params.key)));
    },
  );
}

import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { modelListResponseSchema, starResponseSchema } from '@mieru/shared';
import type { Clock } from '../../clock.js';
import type { DbPool } from '../../db/pool.js';
import { execute, limitParam, selectOne, selectRows, withTransaction } from '../../db/query.js';
import { currentUser, requireUser } from '../../plugins/auth.js';
import type { ModelGateFactory } from '../../plugins/model-access.js';
import { LIMITS, routeLimit } from '../../plugins/rate-limits.js';
import { MODEL_SELECT, toListItem, type ModelRow } from '../models/repo.js';
import { resolveModelAccess } from '../sharing/access-service.js';

export interface StarRouteDeps {
  db: DbPool;
  clock: Clock;
  rateLimitEnabled: boolean;
  requireModelAccess: ModelGateFactory;
}

const STARS_PAGE = 100;

/** Stars a repository; the counter changes only when a row was actually inserted or removed. */
async function setStar(db: DbPool, userId: string, modelId: string, starred: boolean, now: Date) {
  return withTransaction(db, async (connection) => {
    const result = starred
      ? await execute(
          connection,
          'INSERT IGNORE INTO stars (user_id, model_id, created_at) VALUES (?, ?, ?)',
          [userId, modelId, now],
        )
      : await execute(connection, 'DELETE FROM stars WHERE user_id = ? AND model_id = ?', [
          userId,
          modelId,
        ]);
    if (result.affectedRows === 1) {
      await execute(
        connection,
        `UPDATE models SET star_count = ${starred ? 'star_count + 1' : 'GREATEST(star_count, 1) - 1'} WHERE id = ?`,
        [modelId],
      );
    }
    const row = await selectOne<{ star_count: number }>(
      connection,
      'SELECT star_count FROM models WHERE id = ?',
      [modelId],
    );
    return { starred, starCount: row?.star_count ?? 0 };
  });
}

export function registerStarRoutes(app: FastifyInstance, deps: StarRouteDeps): void {
  const { db, clock, rateLimitEnabled, requireModelAccess } = deps;
  const routes = app.withTypeProvider<ZodTypeProvider>();
  const options = {
    preHandler: [requireUser, requireModelAccess('viewer', { loggedIn: true })],
    config: routeLimit(LIMITS.star, rateLimitEnabled),
    schema: { params: z.object({ id: z.uuid() }), response: { 200: starResponseSchema } },
  };

  routes.put('/api/models/:id/star', options, async (request) =>
    setStar(db, currentUser(request).userId, request.params.id, true, clock()),
  );
  routes.delete('/api/models/:id/star', options, async (request) =>
    setStar(db, currentUser(request).userId, request.params.id, false, clock()),
  );

  routes.get(
    '/api/me/stars',
    { preHandler: requireUser, schema: { response: { 200: modelListResponseSchema } } },
    async (request) => {
      const { userId } = currentUser(request);
      const rows = await selectRows<ModelRow>(
        db,
        `${MODEL_SELECT} JOIN stars st ON st.model_id = m.id AND st.user_id = ? ORDER BY st.created_at DESC LIMIT ?`,
        [userId, limitParam(STARS_PAGE)],
      );
      const items = [];
      for (const row of rows) {
        // Starred repositories you can no longer see are hidden, but the star stays.
        const access = await resolveModelAccess(
          db,
          row.id,
          { userId, linkTokenHash: null },
          clock(),
        );
        if (access) items.push(toListItem(row, access.role));
      }
      return { items, nextCursor: null };
    },
  );
}

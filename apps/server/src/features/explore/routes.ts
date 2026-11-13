import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  exploreResponseSchema,
  exploreSearchQuerySchema,
  exploreSearchResponseSchema,
  modelListResponseSchema,
  profileSchema,
  usernameSchema,
  type ExploreResponse,
  type ModelListItem,
} from '@mieru/shared';
import type { Clock } from '../../clock.js';
import type { DbPool } from '../../db/pool.js';
import { limitParam, selectOne, selectRows, type SqlParam } from '../../db/query.js';
import { notFound } from '../../errors.js';
import { MODEL_SELECT, toListItem, type ModelRow } from '../models/repo.js';

const SECTION_SIZE = 12;
const SEARCH_PAGE = 20;
const MIN_TRENDING = 4;
const CACHE_MS = 60_000;
const PUBLIC = `m.visibility = 'public' AND m.taken_down_at IS NULL AND m.current_version_id IS NOT NULL`;

async function section(
  db: DbPool,
  extraJoin: string,
  orderBy: string,
  params: SqlParam[] = [],
): Promise<ModelListItem[]> {
  const rows = await selectRows<ModelRow>(
    db,
    `${MODEL_SELECT} ${extraJoin} WHERE ${PUBLIC} ORDER BY ${orderBy} LIMIT ?`,
    [...params, limitParam(SECTION_SIZE)],
  );
  return rows.map((row) => toListItem(row, null));
}

export function registerExploreRoutes(
  app: FastifyInstance,
  deps: { db: DbPool; clock: Clock },
): void {
  const { db, clock } = deps;
  const routes = app.withTypeProvider<ZodTypeProvider>();
  let cached: { at: number; value: ExploreResponse } | null = null;

  routes.get(
    '/api/explore',
    { schema: { response: { 200: exploreResponseSchema } } },
    async (_request, reply) => {
      reply.header('cache-control', 'public, max-age=60');
      const now = clock().getTime();
      if (cached && now - cached.at < CACHE_MS) return cached.value;
      const trending = await section(
        db,
        'JOIN model_trending t ON t.model_id = m.id',
        't.score DESC, m.id',
      );
      const mostStarred = await section(db, '', 'm.star_count DESC, m.published_at DESC');
      const newest = await section(db, '', 'm.published_at DESC, m.id DESC');
      // Early on (or in quiet weeks) too few models qualify; show the most starred instead.
      const trendingIsFallback = trending.length < MIN_TRENDING;
      const value = {
        trending: trendingIsFallback ? mostStarred : trending,
        trendingIsFallback,
        newest,
        mostStarred,
      };
      cached = { at: now, value };
      return value;
    },
  );

  routes.get(
    '/api/explore/search',
    {
      schema: {
        querystring: exploreSearchQuerySchema,
        response: { 200: exploreSearchResponseSchema },
      },
    },
    async (request) => {
      const { q, format, downloadable, sort, page } = request.query;
      const clauses = [PUBLIC];
      const params: SqlParam[] = [];
      let join = 'LEFT JOIN model_trending t ON t.model_id = m.id';
      if (q) {
        clauses.push('MATCH (m.name, m.description, m.readme_md) AGAINST (? IN BOOLEAN MODE)');
        params.push(q);
      }
      if (format) {
        clauses.push('b.format = ?');
        params.push(format);
      }
      if (downloadable === 'true') clauses.push('m.public_allow_download = 1');
      const orderBy =
        sort === 'stars'
          ? 'm.star_count DESC, m.published_at DESC'
          : sort === 'recent'
            ? 'm.published_at DESC'
            : 'COALESCE(t.score, 0) DESC, m.star_count DESC, m.published_at DESC';
      if (!q && sort !== 'trending') join = '';
      const rows = await selectRows<ModelRow>(
        db,
        `${MODEL_SELECT} ${join} WHERE ${clauses.join(' AND ')} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
        [...params, limitParam(SEARCH_PAGE + 1), limitParam((page - 1) * SEARCH_PAGE)],
      );
      return {
        items: rows.slice(0, SEARCH_PAGE).map((row) => toListItem(row, null)),
        hasMore: rows.length > SEARCH_PAGE,
      };
    },
  );

  routes.get(
    '/api/users/:username',
    {
      schema: { params: z.object({ username: usernameSchema }), response: { 200: profileSchema } },
    },
    async (request) => {
      const row = await selectOne<{
        id: string;
        username: string;
        display_name: string;
        bio: string | null;
        avatar_key: string | null;
        created_at: Date;
        public_models: number;
        stars_received: string | number | null;
      }>(
        db,
        `SELECT u.id, u.username, u.display_name, u.bio, u.avatar_key, u.created_at,
                (SELECT COUNT(*) FROM models m WHERE m.owner_id = u.id AND ${PUBLIC}) AS public_models,
                (SELECT SUM(m.star_count) FROM models m WHERE m.owner_id = u.id AND ${PUBLIC}) AS stars_received
           FROM users u WHERE u.username = ?`,
        [request.params.username],
      );
      if (!row) throw notFound('User not found');
      return {
        username: row.username,
        displayName: row.display_name,
        bio: row.bio,
        avatarKey: row.avatar_key,
        createdAt: row.created_at.toISOString(),
        publicModelCount: row.public_models,
        starsReceived: Number(row.stars_received ?? 0),
      };
    },
  );

  routes.get(
    '/api/users/:username/models',
    {
      schema: {
        params: z.object({ username: usernameSchema }),
        response: { 200: modelListResponseSchema },
      },
    },
    async (request) => {
      const rows = await selectRows<ModelRow>(
        db,
        `${MODEL_SELECT} WHERE o.username = ? AND ${PUBLIC} ORDER BY m.updated_at DESC LIMIT ?`,
        [request.params.username, limitParam(100)],
      );
      return { items: rows.map((row) => toListItem(row, null)), nextCursor: null };
    },
  );

  routes.get(
    '/api/users/:username/stars',
    {
      schema: {
        params: z.object({ username: usernameSchema }),
        response: { 200: modelListResponseSchema },
      },
    },
    async (request) => {
      const rows = await selectRows<ModelRow>(
        db,
        `${MODEL_SELECT} JOIN stars st ON st.model_id = m.id JOIN users su ON su.id = st.user_id AND su.username = ?
          WHERE ${PUBLIC} ORDER BY st.created_at DESC LIMIT ?`,
        [request.params.username, limitParam(100)],
      );
      return { items: rows.map((row) => toListItem(row, null)), nextCursor: null };
    },
  );
}

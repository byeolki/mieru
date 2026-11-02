import type { Pool } from 'mysql2/promise';
import { execute, selectRows, withTransaction } from '../../db/query.js';

const WINDOW_DAYS = 7;
const HALF_LIFE_HOURS = 33;
const HOUR_MS = 60 * 60 * 1000;
export const TRENDING_WEIGHTS = { star: 3, view: 1, issue: 2 } as const;
/** One person can't push their own model up: activity must come from at least this many people. */
export const MIN_DISTINCT_ACTORS = 2;

export interface TrendingEvent {
  modelId: string;
  kind: keyof typeof TRENDING_WEIGHTS;
  at: Date;
  actor: string;
}

export interface TrendingScore {
  modelId: string;
  score: number;
  stars: number;
  views: number;
  issues: number;
}

/** Pure scoring: weighted events with exponential decay, filtered by distinct actors. */
export function scoreTrending(events: readonly TrendingEvent[], now: Date): TrendingScore[] {
  const byModel = new Map<
    string,
    { score: number; stars: number; views: number; issues: number; actors: Set<string> }
  >();
  for (const event of events) {
    const ageHours = Math.max(0, (now.getTime() - event.at.getTime()) / HOUR_MS);
    const entry = byModel.get(event.modelId) ?? {
      score: 0,
      stars: 0,
      views: 0,
      issues: 0,
      actors: new Set<string>(),
    };
    entry.score += TRENDING_WEIGHTS[event.kind] * 0.5 ** (ageHours / HALF_LIFE_HOURS);
    entry[event.kind === 'star' ? 'stars' : event.kind === 'view' ? 'views' : 'issues'] += 1;
    entry.actors.add(event.actor);
    byModel.set(event.modelId, entry);
  }
  return [...byModel.entries()]
    .filter(([, entry]) => entry.actors.size >= MIN_DISTINCT_ACTORS)
    .map(([modelId, entry]) => ({
      modelId,
      score: entry.score,
      stars: entry.stars,
      views: entry.views,
      issues: entry.issues,
    }))
    .sort((a, b) => b.score - a.score);
}

const ELIGIBLE = `m.visibility = 'public' AND m.taken_down_at IS NULL AND m.current_version_id IS NOT NULL`;

/** Recomputes the trending table from the last 7 days of stars, unique views and issues. */
export async function refreshTrending(pool: Pool, now: Date): Promise<number> {
  const since = new Date(now.getTime() - WINDOW_DAYS * 24 * HOUR_MS);
  const stars = await selectRows<{ model_id: string; created_at: Date; user_id: string }>(
    pool,
    `SELECT s.model_id, s.created_at, s.user_id FROM stars s JOIN models m ON m.id = s.model_id
      WHERE s.created_at >= ? AND s.user_id <> m.owner_id AND ${ELIGIBLE}`,
    [since],
  );
  const views = await selectRows<{ model_id: string; day: Date | string; viewer_hash: Buffer }>(
    pool,
    `SELECT v.model_id, v.day, v.viewer_hash FROM model_view_days v JOIN models m ON m.id = v.model_id
      WHERE v.day >= DATE(?) AND ${ELIGIBLE}`,
    [since],
  );
  const issues = await selectRows<{ model_id: string; created_at: Date; author_id: string }>(
    pool,
    `SELECT i.model_id, i.created_at, i.author_id FROM issues i JOIN models m ON m.id = i.model_id
      WHERE i.created_at >= ? AND i.deleted_at IS NULL AND i.author_id IS NOT NULL AND i.author_id <> m.owner_id AND ${ELIGIBLE}`,
    [since],
  );
  const events: TrendingEvent[] = [
    ...stars.map((row) => ({
      modelId: row.model_id,
      kind: 'star' as const,
      at: row.created_at,
      actor: `u:${row.user_id}`,
    })),
    // A view counts at noon UTC of its day; viewer hashes are already unique per day.
    ...views.map((row) => ({
      modelId: row.model_id,
      kind: 'view' as const,
      at: new Date(
        `${typeof row.day === 'string' ? row.day : row.day.toISOString().slice(0, 10)}T12:00:00Z`,
      ),
      actor: `v:${row.viewer_hash.toString('hex')}`,
    })),
    ...issues.map((row) => ({
      modelId: row.model_id,
      kind: 'issue' as const,
      at: row.created_at,
      actor: `u:${row.author_id}`,
    })),
  ];
  const scores = scoreTrending(events, now);
  await withTransaction(pool, async (connection) => {
    await execute(connection, 'DELETE FROM model_trending');
    for (const score of scores) {
      await execute(
        connection,
        'INSERT INTO model_trending (model_id, score, stars_7d, views_7d, issues_7d, computed_at) VALUES (?, ?, ?, ?, ?, ?)',
        [score.modelId, score.score, score.stars, score.views, score.issues, now],
      );
    }
  });
  return scores.length;
}

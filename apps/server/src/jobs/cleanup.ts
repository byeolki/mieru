import type { Pool } from 'mysql2/promise';
import { execute } from '../db/query.js';

export interface CleanupLogger {
  warn: (object: object, message: string) => void;
}

/**
 * Nightly housekeeping: purges data that has outlived its purpose and re-derives counters
 * from source rows, logging any drift (which would point at a bug in a write path).
 */
export async function runCleanup(pool: Pool, now: Date, log: CleanupLogger): Promise<void> {
  await execute(pool, 'DELETE FROM model_view_days WHERE day < DATE(? - INTERVAL 30 DAY)', [now]);
  await execute(pool, 'DELETE FROM refresh_tokens WHERE family_expires_at < ? - INTERVAL 7 DAY', [
    now,
  ]);
  await execute(
    pool,
    'DELETE FROM uploads WHERE consumed_at IS NOT NULL AND consumed_at < ? - INTERVAL 7 DAY',
    [now],
  );
  await execute(pool, 'DELETE FROM uploads WHERE consumed_at IS NULL AND expires_at < ?', [now]);
  await execute(pool, 'DELETE FROM released_usernames WHERE released_at < ? - INTERVAL 30 DAY', [
    now,
  ]);

  const stars = await execute(
    pool,
    `UPDATE models m
        SET m.star_count = (SELECT COUNT(*) FROM stars s WHERE s.model_id = m.id)
      WHERE m.star_count <> (SELECT COUNT(*) FROM stars s WHERE s.model_id = m.id)`,
  );
  const issues = await execute(
    pool,
    `UPDATE models m
        SET m.open_issue_count = (SELECT COUNT(*) FROM issues i
                                   WHERE i.model_id = m.id AND i.state = 'open' AND i.deleted_at IS NULL)
      WHERE m.open_issue_count <> (SELECT COUNT(*) FROM issues i
                                    WHERE i.model_id = m.id AND i.state = 'open' AND i.deleted_at IS NULL)`,
  );
  const replies = await execute(
    pool,
    `UPDATE issues i
        SET i.reply_count = (SELECT COUNT(*) FROM issue_replies r WHERE r.issue_id = i.id AND r.deleted_at IS NULL)
      WHERE i.reply_count <> (SELECT COUNT(*) FROM issue_replies r WHERE r.issue_id = i.id AND r.deleted_at IS NULL)`,
  );
  const drift = {
    stars: stars.affectedRows,
    openIssues: issues.affectedRows,
    replies: replies.affectedRows,
  };
  if (drift.stars + drift.openIssues + drift.replies > 0)
    log.warn(drift, 'counter drift corrected');
}

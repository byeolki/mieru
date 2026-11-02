import { createHash, createHmac } from 'node:crypto';
import { execute, type Queryable } from '../../db/query.js';

const HASH_BYTES = 16;

function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * A per-day viewer fingerprint: the salt changes every day and needs VIEW_SALT_SECRET, so
 * hashes can't be linked across days or reversed into user ids or IP addresses.
 */
export function viewerHash(
  viewer: { userId: string | null; ip: string; userAgent: string | null },
  secret: string,
  now: Date,
): Buffer {
  const salt = createHmac('sha256', secret).update(dayKey(now)).digest();
  const identity = viewer.userId
    ? `user:${viewer.userId}`
    : `anon:${viewer.ip}|${viewer.userAgent ?? ''}`;
  return createHash('sha256').update(salt).update(identity).digest().subarray(0, HASH_BYTES);
}

/** Records one unique view per viewer per day (duplicates are ignored by the primary key). */
export async function recordView(
  db: Queryable,
  modelId: string,
  hash: Buffer,
  now: Date,
): Promise<void> {
  await execute(
    db,
    'INSERT IGNORE INTO model_view_days (model_id, day, viewer_hash) VALUES (?, ?, ?)',
    [modelId, dayKey(now), hash],
  );
}

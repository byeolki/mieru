import { readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Pool } from 'mysql2/promise';
import { PARSER_VERSION } from '@mieru/shared';
import { selectRows } from '../db/query.js';

/** Files younger than this are never collected: they may belong to work still in flight. */
export const GC_SAFETY_WINDOW_MS = 60 * 60 * 1000;
const UPLOAD_GRACE_MS = 24 * 60 * 60 * 1000;
const KEY = /^([0-9a-f-]{36})/;

export interface GcCandidate {
  path: string;
  reason: string;
}

async function listOlderThan(dir: string, cutoff: number): Promise<string[]> {
  const entries = await readdir(dir).catch(() => [] as string[]);
  const old: string[] = [];
  for (const entry of entries) {
    const info = await stat(path.join(dir, entry)).catch(() => null);
    if (info?.isFile() && info.mtimeMs < cutoff) old.push(entry);
  }
  return old;
}

/**
 * Finds files on disk that no database row needs anymore (failed cleanups, crashes mid-job,
 * stale parser versions, abandoned uploads). With `apply`, deletes them.
 */
export async function collectGarbage(
  pool: Pool,
  storageDir: string,
  options: { apply: boolean; now: Date },
): Promise<GcCandidate[]> {
  const root = path.resolve(storageDir);
  const cutoff = options.now.getTime() - GC_SAFETY_WINDOW_MS;
  const blobKeys = new Set(
    (await selectRows<{ storage_key: string }>(pool, 'SELECT storage_key FROM blobs')).map(
      (row) => row.storage_key,
    ),
  );
  const liveUploads = new Set(
    (
      await selectRows<{ id: string }>(
        pool,
        `SELECT u.id FROM uploads u
          WHERE (u.consumed_at IS NULL AND u.expires_at > ?)
             OR EXISTS (SELECT 1 FROM model_versions v WHERE v.upload_id = u.id AND v.status = 'processing')`,
        [options.now],
      )
    ).map((row) => row.id),
  );

  const candidates: GcCandidate[] = [];
  for (const entry of await listOlderThan(path.join(root, 'blobs'), cutoff)) {
    if (!blobKeys.has(entry))
      candidates.push({ path: path.join(root, 'blobs', entry), reason: 'unreferenced blob' });
  }
  for (const entry of await listOlderThan(path.join(root, 'parsed'), cutoff)) {
    const key = KEY.exec(entry)?.[1];
    if (!key || !blobKeys.has(key)) {
      candidates.push({ path: path.join(root, 'parsed', entry), reason: 'sidecar without blob' });
    } else if (entry.includes('.tmp-')) {
      candidates.push({ path: path.join(root, 'parsed', entry), reason: 'abandoned temp file' });
    } else if (!entry.endsWith(`.v${PARSER_VERSION}.json.gz`)) {
      candidates.push({ path: path.join(root, 'parsed', entry), reason: 'stale parser version' });
    }
  }
  const uploadCutoff = options.now.getTime() - UPLOAD_GRACE_MS;
  for (const entry of await listOlderThan(
    path.join(root, 'uploads'),
    Math.min(cutoff, uploadCutoff),
  )) {
    const key = KEY.exec(entry)?.[1];
    if (!key || !liveUploads.has(key)) {
      candidates.push({
        path: path.join(root, 'uploads', entry),
        reason: 'expired or orphaned upload',
      });
    }
  }

  if (options.apply) {
    for (const candidate of candidates) await rm(candidate.path, { force: true });
  }
  return candidates;
}

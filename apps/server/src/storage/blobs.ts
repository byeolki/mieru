import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import type { Pool } from 'mysql2/promise';
import { execute, selectOne, withTransaction } from '../db/query.js';
import { pathFor } from './paths.js';

export interface BlobLogger {
  warn: (object: object, message: string) => void;
}

async function removeSidecars(storageDir: string, storageKey: string): Promise<void> {
  const parsedDir = path.join(path.resolve(storageDir), 'parsed');
  const entries = await readdir(parsedDir).catch(() => [] as string[]);
  await Promise.all(
    entries
      .filter((entry) => entry.startsWith(`${storageKey}.`))
      .map((entry) => rm(path.join(parsedDir, entry), { force: true })),
  );
}

/**
 * Deletes blobs that no `model_files` row references anymore: the DB row first (in a
 * transaction that re-checks references), then the files. A failed unlink leaves an orphan
 * file for `storage:gc`, never a row pointing at a missing file.
 */
export async function releaseUnreferencedBlobs(
  pool: Pool,
  storageDir: string,
  blobIds: readonly string[],
  log: BlobLogger,
): Promise<void> {
  for (const blobId of new Set(blobIds)) {
    const storageKey = await withTransaction(pool, async (connection) => {
      const blob = await selectOne<{ storage_key: string; referenced: number }>(
        connection,
        `SELECT storage_key,
                EXISTS (SELECT 1 FROM model_files WHERE blob_id = blobs.id) AS referenced
           FROM blobs WHERE id = ? FOR UPDATE`,
        [blobId],
      );
      if (!blob || blob.referenced) return null;
      await execute(connection, 'DELETE FROM blobs WHERE id = ?', [blobId]);
      return blob.storage_key;
    });
    if (!storageKey) continue;
    try {
      await rm(pathFor(storageDir, 'blobs', storageKey), { force: true });
      await removeSidecars(storageDir, storageKey);
    } catch (error) {
      log.warn({ err: error, blobId }, 'blob file cleanup failed; storage:gc will retry');
    }
  }
}

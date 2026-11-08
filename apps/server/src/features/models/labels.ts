import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import type { Pool } from 'mysql2/promise';
import { isDuplicateKeyError } from '../../db/errors.js';
import { execute, selectOne, withTransaction } from '../../db/query.js';
import { AppError } from '../../errors.js';
import { newId } from '../../ids.js';
import { releaseUnreferencedBlobs, type BlobLogger } from '../../storage/blobs.js';
import { removeQuietly } from '../../storage/disk.js';
import { pathFor } from '../../storage/paths.js';

const LABELS_FILE_NAME = 'labels.json';

const notReady = () =>
  new AppError(409, 'not_ready', 'Labels attach to a processed version', { retryAfterSec: 2 });

/** Stores the JSON once per distinct content, like model files; returns the blob id. */
async function storeLabelsBlob(pool: Pool, storageDir: string, json: string): Promise<string> {
  const bytes = Buffer.from(json, 'utf8');
  const sha256 = createHash('sha256').update(bytes).digest();
  const existing = await selectOne<{ id: string }>(pool, 'SELECT id FROM blobs WHERE sha256 = ?', [
    sha256,
  ]);
  if (existing) return existing.id;
  const storageKey = newId();
  const filePath = pathFor(storageDir, 'blobs', storageKey);
  await writeFile(filePath, bytes, { flag: 'wx', mode: 0o600 });
  const blobId = newId();
  try {
    await execute(
      pool,
      `INSERT INTO blobs (id, storage_key, sha256, size_bytes, format)
       VALUES (?, ?, ?, ?, 'labels_json')`,
      [blobId, storageKey, sha256, bytes.length],
    );
    return blobId;
  } catch (error) {
    await removeQuietly(filePath);
    if (!isDuplicateKeyError(error, 'uq_blobs_sha256')) throw error;
    const winner = await selectOne<{ id: string }>(pool, 'SELECT id FROM blobs WHERE sha256 = ?', [
      sha256,
    ]);
    if (!winner) throw error;
    return winner.id;
  }
}

/**
 * Replaces the labels of the repository's current version. An empty list removes them.
 * @throws AppError 409 `not_ready` while the first version is still processing.
 */
export async function saveLabels(
  pool: Pool,
  storageDir: string,
  modelId: string,
  labels: readonly string[],
  log: BlobLogger,
): Promise<void> {
  const blobId =
    labels.length > 0 ? await storeLabelsBlob(pool, storageDir, JSON.stringify(labels)) : null;
  const previousBlobId = await withTransaction(pool, async (connection) => {
    const model = await selectOne<{ current_version_id: string | null }>(
      connection,
      'SELECT current_version_id FROM models WHERE id = ? FOR UPDATE',
      [modelId],
    );
    if (!model?.current_version_id) throw notReady();
    const previous = await selectOne<{ blob_id: string }>(
      connection,
      "SELECT blob_id FROM model_files WHERE version_id = ? AND kind = 'labels'",
      [model.current_version_id],
    );
    await execute(connection, "DELETE FROM model_files WHERE version_id = ? AND kind = 'labels'", [
      model.current_version_id,
    ]);
    if (blobId) {
      await execute(
        connection,
        "INSERT INTO model_files (id, version_id, kind, blob_id, original_name) VALUES (?, ?, 'labels', ?, ?)",
        [newId(), model.current_version_id, blobId, LABELS_FILE_NAME],
      );
    }
    return previous?.blob_id ?? null;
  });
  if (previousBlobId && previousBlobId !== blobId) {
    await releaseUnreferencedBlobs(pool, storageDir, [previousBlobId], log);
  }
}

/** Labels of the current version, or an empty list when none were set. */
export async function readLabels(
  pool: Pool,
  storageDir: string,
  modelId: string,
): Promise<string[]> {
  const row = await selectOne<{ storage_key: string }>(
    pool,
    `SELECT b.storage_key
       FROM models m
       JOIN model_files f ON f.version_id = m.current_version_id AND f.kind = 'labels'
       JOIN blobs b ON b.id = f.blob_id
      WHERE m.id = ?`,
    [modelId],
  );
  if (!row) return [];
  const parsed: unknown = JSON.parse(
    await readFile(pathFor(storageDir, 'blobs', row.storage_key), 'utf8'),
  );
  return Array.isArray(parsed)
    ? parsed.filter((label): label is string => typeof label === 'string')
    : [];
}

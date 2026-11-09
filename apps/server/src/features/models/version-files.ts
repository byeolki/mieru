import type { Pool } from 'mysql2/promise';
import { selectRows } from '../../db/query.js';
import { AppError, notFound } from '../../errors.js';
import type { TensorIndexEntry } from '../../parsing/tensor-index.js';
import { pathFor } from '../../storage/paths.js';

/** The stored files of one ready version: the model blob and its external data blobs by name. */
export interface VersionFiles {
  versionId: string;
  blobId: string;
  storageKey: string;
  originalName: string;
  /** External data blobs keyed by file name, which is what tensors' `location` refers to. */
  externalData: ReadonlyMap<string, { blobId: string; storageKey: string; sizeBytes: number }>;
}

interface FileRow {
  version_id: string;
  status: string;
  kind: 'model' | 'external_data' | null;
  blob_id: string | null;
  storage_key: string | null;
  original_name: string | null;
  size_bytes: number | string | null;
}

/**
 * Loads a version's files; `version` null means the repository's current version.
 * @throws AppError 404 when the version doesn't exist, 409 `not_ready` while it is processing.
 */
export async function versionFiles(
  pool: Pool,
  modelId: string,
  version: number | null,
): Promise<VersionFiles> {
  const filter = version === null ? 'v.id = m.current_version_id' : 'v.version_number = ?';
  const rows = await selectRows<FileRow>(
    pool,
    `SELECT v.id AS version_id, v.status, f.kind, b.id AS blob_id, b.storage_key, f.original_name,
            b.size_bytes
       FROM models m
       JOIN model_versions v ON v.model_id = m.id AND ${filter}
       LEFT JOIN model_files f ON f.version_id = v.id AND f.kind IN ('model', 'external_data')
       LEFT JOIN blobs b ON b.id = f.blob_id
      WHERE m.id = ?`,
    version === null ? [modelId] : [version, modelId],
  );
  const first = rows[0];
  if (!first) throw notFound('Version not found');
  const model = rows.find((row) => row.kind === 'model');
  if (first.status !== 'ready' || !model?.blob_id || !model.storage_key) {
    throw new AppError(409, 'not_ready', 'This version is still being processed', {
      retryAfterSec: 2,
    });
  }
  const externalData = new Map<string, { blobId: string; storageKey: string; sizeBytes: number }>();
  for (const row of rows) {
    if (row.kind !== 'external_data' || !row.blob_id || !row.storage_key || !row.original_name)
      continue;
    externalData.set(row.original_name, {
      blobId: row.blob_id,
      storageKey: row.storage_key,
      sizeBytes: Number(row.size_bytes),
    });
  }
  return {
    versionId: first.version_id,
    blobId: model.blob_id,
    storageKey: model.storage_key,
    originalName: model.original_name ?? '',
    externalData,
  };
}

/** External data `location`s may carry a directory; files are matched by their base name. */
export function externalDataName(location: string): string {
  return location.split(/[\\/]/).filter(Boolean).at(-1) ?? location;
}

/**
 * Absolute path of the file holding a tensor's bytes.
 * @throws AppError 404 when its external data file isn't part of the version.
 */
export function tensorFilePath(
  storageDir: string,
  files: VersionFiles,
  entry: TensorIndexEntry,
): string {
  if (entry.location === null) return pathFor(storageDir, 'blobs', files.storageKey);
  const data = files.externalData.get(externalDataName(entry.location));
  if (!data) throw notFound('External data file not found');
  return pathFor(storageDir, 'blobs', data.storageKey);
}

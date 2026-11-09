import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import type { Pool } from 'mysql2/promise';
import {
  PARSER_VERSION,
  parsedModelSchema,
  createVersionBodySchema,
  type ModelDiff,
  type VersionListItem,
  type VersionStatus,
} from '@mieru/shared';
import { execute, selectOne, selectRows, withTransaction } from '../../db/query.js';
import { badRequest, conflict, notFound } from '../../errors.js';
import { newId } from '../../ids.js';
import type { TensorIndexEntry } from '../../parsing/tensor-index.js';
import { releaseUnreferencedBlobs, type BlobLogger } from '../../storage/blobs.js';
import { readGzipJson, sidecarPath } from '../../storage/disk.js';
import { formatFromFilename } from '../uploads/formats.js';
import type { z } from 'zod';
import { claimDataUploads } from './data-uploads.js';
import { computeModelDiff } from './diff.js';
import { tensorFilePath, versionFiles, type VersionFiles } from './version-files.js';

interface VersionRow {
  version_number: number;
  status: VersionStatus;
  failure_reason: string | null;
  failure_detail: string | null;
  original_name: string;
  note: string | null;
  created_at: Date;
  // BIGINT columns: mysql2 may return them as strings once they exceed 2^53.
  size_bytes: number | string | null;
  total_params: number | string | null;
  creator_username: string | null;
  creator_display_name: string | null;
  is_current: number;
}

export async function listVersions(pool: Pool, modelId: string): Promise<VersionListItem[]> {
  const rows = await selectRows<VersionRow>(
    pool,
    `SELECT v.version_number, v.status, v.failure_reason, v.failure_detail, v.original_name, v.note, v.created_at,
            b.size_bytes + COALESCE((SELECT SUM(xb.size_bytes) FROM model_files xf JOIN blobs xb ON xb.id = xf.blob_id
                                      WHERE xf.version_id = v.id AND xf.kind = 'external_data'), 0) AS size_bytes,
            b.total_params, u.username AS creator_username,
            u.display_name AS creator_display_name, (m.current_version_id = v.id) AS is_current
       FROM model_versions v
       JOIN models m ON m.id = v.model_id
       LEFT JOIN model_files f ON f.version_id = v.id AND f.kind = 'model'
       LEFT JOIN blobs b ON b.id = f.blob_id
       LEFT JOIN users u ON u.id = v.created_by
      WHERE v.model_id = ?
      ORDER BY v.version_number DESC`,
    [modelId],
  );
  return rows.map((row) => ({
    number: row.version_number,
    status: row.status,
    failureReason: row.failure_reason,
    failureDetail: row.failure_detail,
    originalName: row.original_name,
    note: row.note,
    sizeBytes: row.size_bytes === null ? null : Number(row.size_bytes),
    totalParams: row.total_params === null ? null : Number(row.total_params),
    createdAt: row.created_at.toISOString(),
    createdBy: row.creator_username
      ? {
          username: row.creator_username,
          displayName: row.creator_display_name ?? row.creator_username,
        }
      : null,
    isCurrent: row.is_current === 1,
  }));
}

/** Bytes the repository occupies: every distinct file across its versions, counted once. */
export async function repositoryBytes(pool: Pool, modelId: string): Promise<number> {
  const row = await selectOne<{ total: string | number | null }>(
    pool,
    `SELECT SUM(b.size_bytes) AS total FROM blobs b
      WHERE b.id IN (SELECT f.blob_id FROM model_files f
                       JOIN model_versions v ON v.id = f.version_id
                      WHERE v.model_id = ?)`,
    [modelId],
  );
  return Number(row?.total ?? 0);
}

type CreateVersionBody = z.output<typeof createVersionBodySchema>;

interface UploadRow {
  user_id: string;
  original_name: string;
  role: 'model' | 'external_data';
  completed_at: Date | null;
  consumed_at: Date | null;
  expires_at: Date;
  target_model_id: string | null;
}

/**
 * Turns a finished upload into the next version of a repository. The file must have the
 * repository's format and must have been uploaded for this repository.
 * @returns the new version's id, to be queued for processing.
 */
export async function createVersion(
  pool: Pool,
  modelId: string,
  userId: string,
  body: CreateVersionBody,
  now: Date,
): Promise<string> {
  return withTransaction(pool, async (connection) => {
    const model = await selectOne<{ format: string | null }>(
      connection,
      `SELECT b.format FROM models m
         LEFT JOIN model_files f ON f.version_id = m.current_version_id AND f.kind = 'model'
         LEFT JOIN blobs b ON b.id = f.blob_id
        WHERE m.id = ? FOR UPDATE`,
      [modelId],
    );
    if (!model) throw notFound('Model not found');
    const upload = await selectOne<UploadRow>(
      connection,
      `SELECT user_id, original_name, role, completed_at, consumed_at, expires_at, target_model_id
         FROM uploads WHERE id = ? FOR UPDATE`,
      [body.uploadId],
    );
    if (upload?.user_id !== userId || upload.target_model_id !== modelId) {
      throw notFound('Upload not found');
    }
    if (!upload.completed_at)
      throw conflict('upload_incomplete', 'The upload has not finished yet');
    if (upload.consumed_at) throw conflict('upload_consumed', 'This upload was already used');
    if (upload.expires_at <= now)
      throw conflict('upload_expired', 'The upload expired; upload the file again');
    const format = formatFromFilename(upload.original_name);
    if (!format.ok || upload.role !== 'model')
      throw badRequest('unsupported_format', 'Unsupported file format');
    if (body.dataUploadIds.length > 0 && format.format !== 'onnx') {
      throw badRequest('external_data_onnx_only', 'Only ONNX models can have external data files');
    }
    if (model.format && model.format !== format.format) {
      throw badRequest('format_mismatch', `New versions must also be ${model.format} files`);
    }
    const next = await selectOne<{ next: number }>(
      connection,
      'SELECT COALESCE(MAX(version_number), 0) + 1 AS next FROM model_versions WHERE model_id = ?',
      [modelId],
    );
    const versionId = newId();
    await execute(
      connection,
      `INSERT INTO model_versions (id, model_id, version_number, status, upload_id, original_name, note, created_by, created_at)
       VALUES (?, ?, ?, 'processing', ?, ?, ?, ?, ?)`,
      [
        versionId,
        modelId,
        next?.next ?? 1,
        body.uploadId,
        upload.original_name,
        body.note || null,
        userId,
        now,
      ],
    );
    await execute(connection, 'UPDATE uploads SET consumed_at = ? WHERE id = ?', [
      now,
      body.uploadId,
    ]);
    await claimDataUploads(connection, {
      userId,
      versionId,
      targetModelId: modelId,
      uploadIds: body.dataUploadIds,
      now,
    });
    await execute(connection, 'UPDATE models SET updated_at = ? WHERE id = ?', [now, modelId]);
    return versionId;
  });
}

/**
 * Deletes one version. The last remaining version can't be deleted (delete the repository
 * instead); deleting the current one promotes the newest remaining ready version.
 */
export async function deleteVersion(
  pool: Pool,
  storageDir: string,
  modelId: string,
  versionNumber: number,
  log: BlobLogger,
): Promise<void> {
  const blobIds = await withTransaction(pool, async (connection) => {
    await selectOne(connection, 'SELECT id FROM models WHERE id = ? FOR UPDATE', [modelId]);
    const version = await selectOne<{ id: string }>(
      connection,
      'SELECT id FROM model_versions WHERE model_id = ? AND version_number = ?',
      [modelId, versionNumber],
    );
    if (!version) throw notFound('Version not found');
    const count = await selectOne<{ count: number }>(
      connection,
      'SELECT COUNT(*) AS count FROM model_versions WHERE model_id = ?',
      [modelId],
    );
    if ((count?.count ?? 0) <= 1) {
      throw conflict('last_version', 'A repository keeps at least one version');
    }
    const files = await selectRows<{ blob_id: string }>(
      connection,
      'SELECT blob_id FROM model_files WHERE version_id = ?',
      [version.id],
    );
    await execute(connection, 'DELETE FROM model_versions WHERE id = ?', [version.id]);
    await execute(
      connection,
      `UPDATE models SET current_version_id = (
         SELECT id FROM model_versions
          WHERE model_id = ? AND status = 'ready'
          ORDER BY version_number DESC LIMIT 1)
        WHERE id = ? AND current_version_id IS NULL`,
      [modelId, modelId],
    );
    return files.map((file) => file.blob_id);
  });
  await releaseUnreferencedBlobs(pool, storageDir, blobIds, log);
}

/** Identifies a version's stored bytes: the model blob plus its external data blobs. */
function filesKey(files: VersionFiles): string {
  const data = [...files.externalData.values()].map((blob) => blob.blobId).sort();
  return [files.blobId, ...data].join('+');
}

/**
 * SHA-256 of each tensor's bytes, read by offset so the rest of the file is never loaded.
 * Tensors in external data are read from their own file.
 */
async function hashTensors(
  storageDir: string,
  files: VersionFiles,
  entries: readonly TensorIndexEntry[],
): Promise<Map<string, string>> {
  const byPath = new Map<string, TensorIndexEntry[]>();
  for (const entry of entries) {
    const filePath = tensorFilePath(storageDir, files, entry);
    byPath.set(filePath, [...(byPath.get(filePath) ?? []), entry]);
  }
  const hashes = new Map<string, string>();
  const chunk = Buffer.alloc(1024 * 1024);
  for (const [filePath, fileEntries] of byPath) {
    const handle = await open(filePath, 'r');
    try {
      for (const entry of fileEntries) {
        const hash = createHash('sha256');
        let position = entry.offset;
        let remaining = entry.length;
        while (remaining > 0) {
          const { bytesRead } = await handle.read(
            chunk,
            0,
            Math.min(chunk.length, remaining),
            position,
          );
          if (bytesRead === 0) break;
          hash.update(chunk.subarray(0, bytesRead));
          position += bytesRead;
          remaining -= bytesRead;
        }
        hashes.set(entry.name, hash.digest('hex'));
      }
    } finally {
      await handle.close();
    }
  }
  return hashes;
}

async function loadSide(storageDir: string, side: VersionFiles) {
  const parsed = parsedModelSchema.parse(
    await readGzipJson(sidecarPath(storageDir, side.storageKey, 'graph', PARSER_VERSION)),
  );
  const index = (await readGzipJson(
    sidecarPath(storageDir, side.storageKey, 'tensors', PARSER_VERSION),
  )) as TensorIndexEntry[];
  return { parsed, index };
}

const DIFF_CACHE_SIZE = 32;
// Diffs of immutable blobs never change, so recent ones are kept in memory; large models
// would otherwise re-hash every tensor on each request.
const diffCache = new Map<string, Omit<ModelDiff, 'from' | 'to'>>();

function remember(key: string, diff: Omit<ModelDiff, 'from' | 'to'>): void {
  diffCache.delete(key);
  diffCache.set(key, diff);
  if (diffCache.size > DIFF_CACHE_SIZE) diffCache.delete(diffCache.keys().next().value ?? '');
}

/**
 * Compares two versions of a repository. Tensors are hashed only when present in both
 * versions with the same dtype and shape, and identical files are not read at all.
 * @throws AppError 409 `not_ready` if either version is still processing.
 */
export async function diffVersions(
  pool: Pool,
  storageDir: string,
  modelId: string,
  fromNumber: number,
  toNumber: number,
): Promise<ModelDiff> {
  const [from, to] = await Promise.all([
    versionFiles(pool, modelId, fromNumber),
    versionFiles(pool, modelId, toNumber),
  ]);
  const key = `${filesKey(from)}:${filesKey(to)}`;
  const cached = diffCache.get(key);
  if (cached) return { from: fromNumber, to: toNumber, ...cached };

  const [fromData, toData] = await Promise.all([
    loadSide(storageDir, from),
    loadSide(storageDir, to),
  ]);
  const toByName = new Map(toData.index.map((entry) => [entry.name, entry]));
  const shared = fromData.index.filter((entry) => {
    const other = toByName.get(entry.name);
    return other?.dtype === entry.dtype && other.length === entry.length;
  });
  const sharedNames = new Set(shared.map((entry) => entry.name));
  const sameFile = filesKey(from) === filesKey(to);
  const [fromHashes, toHashes] = sameFile
    ? [new Map<string, string>(), new Map<string, string>()]
    : await Promise.all([
        hashTensors(storageDir, from, shared),
        hashTensors(
          storageDir,
          to,
          toData.index.filter((entry) => sharedNames.has(entry.name)),
        ),
      ]);
  const diff = computeModelDiff(
    { from: fromNumber, to: toNumber },
    { from: fromData.parsed, to: toData.parsed },
    {
      from: { index: fromData.index, hashes: fromHashes },
      to: { index: toData.index, hashes: toHashes },
    },
  );
  const { from: _from, to: _to, ...rest } = diff;
  remember(key, rest);
  return diff;
}

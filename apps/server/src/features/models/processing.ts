import { open, rename, stat } from 'node:fs/promises';
import type { Pool } from 'mysql2/promise';
import { PARSER_VERSION, type ModelFormat } from '@mieru/shared';
import type { Clock } from '../../clock.js';
import { isDuplicateKeyError } from '../../db/errors.js';
import { execute, selectOne, selectRows, withTransaction } from '../../db/query.js';
import { newId } from '../../ids.js';
import { runExclusively } from '../../jobs/scheduler.js';
import { ParseError } from '../../parsing/errors.js';
import { runParser } from '../../parsing/run-parser.js';
import type { TensorIndexEntry } from '../../parsing/tensor-index.js';
import { releaseUnreferencedBlobs } from '../../storage/blobs.js';
import {
  readGzipJson,
  removeQuietly,
  sha256OfFile,
  sidecarPath,
  writeGzipJson,
} from '../../storage/disk.js';
import { pathFor } from '../../storage/paths.js';
import { formatFromFilename, hasExpectedMagic } from '../uploads/formats.js';
import { externalDataName } from './version-files.js';

export interface ProcessingLogger {
  info: (object: object, message: string) => void;
  warn: (object: object, message: string) => void;
  error: (object: object, message: string) => void;
}

interface PendingVersion {
  id: string;
  model_id: string;
  version_number: number;
  status: string;
  upload_id: string | null;
  original_name: string;
}

interface BlobRow {
  id: string;
  storage_key: string;
  parser_version: number | null;
}

interface DataUploadRow {
  upload_id: string;
  original_name: string;
}

/** An external data file stored as a blob, ready to be listed under the version. */
interface DataBlob {
  blobId: string;
  name: string;
}

/** Most missing file names written into `failure_detail` (VARCHAR(1000)). */
const MAX_DETAIL_LENGTH = 1000;

async function sizeOf(filePath: string): Promise<number | null> {
  try {
    return (await stat(filePath)).size;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

const MAGIC_BYTES = 16;

async function readHead(filePath: string): Promise<Buffer> {
  const handle = await open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(MAGIC_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, MAGIC_BYTES, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/**
 * In-process job queue for turning uploads into published versions. Concurrency is one:
 * freeride shares its RAM with other services, and parsing is memory-bound.
 * Each version is guarded by an advisory lock so overlapping deploys never process it twice.
 */
export class ProcessingQueue {
  private chain: Promise<void> = Promise.resolve();
  private readonly queued = new Set<string>();

  constructor(
    private readonly deps: { pool: Pool; storageDir: string; clock: Clock; log: ProcessingLogger },
  ) {}

  enqueueVersion(versionId: string): void {
    this.enqueue(`version:${versionId}`, () => this.processVersion(versionId));
  }

  enqueueReparse(blobId: string): void {
    this.enqueue(`blob:${blobId}`, () => this.reparseBlob(blobId));
  }

  /** Resolves when everything queued so far has finished (used by tests and shutdown). */
  idle(): Promise<void> {
    return this.chain;
  }

  /** Re-queues versions left `processing` by a crash or deploy. */
  async recover(): Promise<void> {
    const rows = await selectRows<{ id: string }>(
      this.deps.pool,
      "SELECT id FROM model_versions WHERE status = 'processing' ORDER BY created_at",
    );
    for (const row of rows) this.enqueueVersion(row.id);
  }

  private enqueue(key: string, job: () => Promise<void>): void {
    if (this.queued.has(key)) return;
    this.queued.add(key);
    this.chain = this.chain.then(async () => {
      this.queued.delete(key);
      const startedAt = Date.now();
      try {
        await runExclusively(this.deps.pool, key.replace(':', '_'), job);
        this.deps.log.info(
          { job: key, ms: Date.now() - startedAt, rss: process.memoryUsage().rss },
          'processing job finished',
        );
      } catch (error) {
        this.deps.log.error({ job: key, err: error }, 'processing job crashed');
      }
    });
  }

  private async failVersion(
    version: PendingVersion,
    code: string,
    uploadPath: string | null,
    detail: string | null = null,
  ): Promise<void> {
    await execute(
      this.deps.pool,
      `UPDATE model_versions SET status = 'failed', failure_reason = ?, failure_detail = ?
        WHERE id = ? AND status = 'processing'`,
      [code, detail?.slice(0, MAX_DETAIL_LENGTH) ?? null, version.id],
    );
    if (uploadPath) {
      await removeQuietly(uploadPath);
      await removeQuietly(`${uploadPath}.json`);
    }
    await this.removeDataUploads(await this.dataUploadsOf(version.id));
  }

  private dataUploadsOf(versionId: string): Promise<DataUploadRow[]> {
    return selectRows<DataUploadRow>(
      this.deps.pool,
      'SELECT upload_id, original_name FROM version_data_uploads WHERE version_id = ?',
      [versionId],
    );
  }

  private async removeDataUploads(uploads: readonly DataUploadRow[]): Promise<void> {
    for (const upload of uploads) {
      const uploadPath = pathFor(this.deps.storageDir, 'uploads', upload.upload_id);
      await removeQuietly(uploadPath);
      await removeQuietly(`${uploadPath}.json`);
    }
  }

  private async processVersion(versionId: string): Promise<void> {
    const { pool, storageDir } = this.deps;
    const version = await selectOne<PendingVersion>(
      pool,
      'SELECT id, model_id, version_number, status, upload_id, original_name FROM model_versions WHERE id = ?',
      [versionId],
    );
    if (version?.status !== 'processing' || !version.upload_id) return;

    const uploadPath = pathFor(storageDir, 'uploads', version.upload_id);
    const format = formatFromFilename(version.original_name);
    if (!format.ok) return this.failVersion(version, 'bad_header', uploadPath);

    let fileSize: number;
    try {
      fileSize = (await stat(uploadPath)).size;
    } catch {
      return this.failVersion(version, 'truncated', null);
    }
    if (!hasExpectedMagic(format.format, await readHead(uploadPath), fileSize)) {
      return this.failVersion(version, 'bad_header', uploadPath);
    }

    const sha256 = await sha256OfFile(uploadPath);
    let blob = await selectOne<BlobRow>(
      pool,
      'SELECT id, storage_key, parser_version FROM blobs WHERE sha256 = ?',
      [sha256],
    );
    if (blob) {
      await removeQuietly(uploadPath);
    } else {
      const created = await this.createBlob(uploadPath, format.format, sha256, fileSize, version);
      if (!created) return;
      blob = created;
    }
    await removeQuietly(`${uploadPath}.json`);
    const dataBlobs = await this.storeExternalData(version, blob, format.format);
    if (!dataBlobs) {
      await releaseUnreferencedBlobs(pool, storageDir, [blob.id], this.deps.log);
      return;
    }
    await this.publish(version, blob.id, dataBlobs);
  }

  /** Byte length each external data file must have, from the model's tensor index. */
  private async externalRequirements(blob: BlobRow): Promise<Map<string, number>> {
    if (blob.parser_version !== PARSER_VERSION) await this.reparseBlob(blob.id);
    const index = (await readGzipJson(
      sidecarPath(this.deps.storageDir, blob.storage_key, 'tensors', PARSER_VERSION),
    )) as TensorIndexEntry[];
    const required = new Map<string, number>();
    for (const entry of index) {
      if (entry.location === null) continue;
      const name = externalDataName(entry.location);
      required.set(name, Math.max(required.get(name) ?? 0, entry.offset + entry.length));
    }
    return required;
  }

  /**
   * Stores the data files the model's tensors point into. Fails the version, naming the files,
   * when one is missing or shorter than its tensors need. Uploaded files nothing points into are
   * dropped. Returns null when the version failed.
   */
  private async storeExternalData(
    version: PendingVersion,
    blob: BlobRow,
    format: ModelFormat,
  ): Promise<DataBlob[] | null> {
    const uploads = await this.dataUploadsOf(version.id);
    const required =
      format === 'onnx' ? await this.externalRequirements(blob) : new Map<string, number>();
    if (required.size === 0 && uploads.length === 0) return [];

    const byName = new Map(uploads.map((upload) => [upload.original_name, upload]));
    const missing: string[] = [];
    for (const [name, requiredBytes] of required) {
      const upload = byName.get(name);
      const size = upload
        ? await sizeOf(pathFor(this.deps.storageDir, 'uploads', upload.upload_id))
        : null;
      if (size === null || size < requiredBytes) missing.push(name);
    }
    if (missing.length > 0) {
      this.deps.log.warn({ versionId: version.id, missing }, 'external data files missing');
      await this.failVersion(version, 'external_data_missing', null, missing.join(', '));
      return null;
    }

    const stored: DataBlob[] = [];
    for (const name of required.keys()) {
      const upload = byName.get(name);
      if (!upload) continue;
      stored.push({ blobId: await this.storeDataBlob(upload), name });
    }
    await this.removeDataUploads(uploads.filter((upload) => !required.has(upload.original_name)));
    return stored;
  }

  /** Moves one data upload into blob storage, reusing an identical blob when one exists. */
  private async storeDataBlob(upload: DataUploadRow): Promise<string> {
    const { pool, storageDir } = this.deps;
    const uploadPath = pathFor(storageDir, 'uploads', upload.upload_id);
    const size = (await stat(uploadPath)).size;
    const sha256 = await sha256OfFile(uploadPath);
    const existing = await selectOne<{ id: string }>(
      pool,
      'SELECT id FROM blobs WHERE sha256 = ?',
      [sha256],
    );
    if (existing) {
      await removeQuietly(uploadPath);
      await removeQuietly(`${uploadPath}.json`);
      return existing.id;
    }
    const storageKey = newId();
    const blobId = newId();
    await rename(uploadPath, pathFor(storageDir, 'blobs', storageKey));
    await removeQuietly(`${uploadPath}.json`);
    try {
      await execute(
        pool,
        `INSERT INTO blobs (id, storage_key, sha256, size_bytes, format) VALUES (?, ?, ?, ?, 'onnx_data')`,
        [blobId, storageKey, sha256, size],
      );
      return blobId;
    } catch (error) {
      if (!isDuplicateKeyError(error, 'uq_blobs_sha256')) throw error;
      // Someone stored identical bytes meanwhile; keep theirs and drop ours.
      await removeQuietly(pathFor(storageDir, 'blobs', storageKey));
      const winner = await selectOne<{ id: string }>(
        pool,
        'SELECT id FROM blobs WHERE sha256 = ?',
        [sha256],
      );
      if (!winner) throw error;
      return winner.id;
    }
  }

  private async createBlob(
    uploadPath: string,
    format: ModelFormat,
    sha256: Buffer,
    fileSize: number,
    version: PendingVersion,
  ): Promise<BlobRow | null> {
    const { pool, storageDir } = this.deps;
    let parsed;
    try {
      parsed = await runParser(uploadPath, format, fileSize);
    } catch (error) {
      const code = error instanceof ParseError ? error.code : 'internal';
      this.deps.log.warn({ versionId: version.id, code }, 'model file rejected');
      await this.failVersion(version, code, uploadPath);
      return null;
    }

    const storageKey = newId();
    await writeGzipJson(
      sidecarPath(storageDir, storageKey, 'graph', PARSER_VERSION),
      parsed.parsed,
    );
    await writeGzipJson(
      sidecarPath(storageDir, storageKey, 'tensors', PARSER_VERSION),
      parsed.tensorIndex,
    );
    await rename(uploadPath, pathFor(storageDir, 'blobs', storageKey));

    const { summary } = parsed.parsed;
    const blobId = newId();
    try {
      await execute(
        pool,
        `INSERT INTO blobs (id, storage_key, sha256, size_bytes, format, parser_version, total_params,
                            node_count, tensor_count, summary)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          blobId,
          storageKey,
          sha256,
          fileSize,
          format,
          PARSER_VERSION,
          summary.totalParams,
          summary.nodeCount ?? null,
          summary.tensorCount,
          JSON.stringify(summary),
        ],
      );
      return { id: blobId, storage_key: storageKey, parser_version: PARSER_VERSION };
    } catch (error) {
      if (!isDuplicateKeyError(error, 'uq_blobs_sha256')) throw error;
      // Someone published identical bytes meanwhile; keep theirs and drop ours.
      await removeQuietly(pathFor(storageDir, 'blobs', storageKey));
      await removeQuietly(sidecarPath(storageDir, storageKey, 'graph', PARSER_VERSION));
      await removeQuietly(sidecarPath(storageDir, storageKey, 'tensors', PARSER_VERSION));
      return selectOne<BlobRow>(
        pool,
        'SELECT id, storage_key, parser_version FROM blobs WHERE sha256 = ?',
        [sha256],
      );
    }
  }

  private async publish(
    version: PendingVersion,
    blobId: string,
    dataBlobs: readonly DataBlob[],
  ): Promise<void> {
    await withTransaction(this.deps.pool, async (connection) => {
      const current = await selectOne<{ status: string }>(
        connection,
        'SELECT status FROM model_versions WHERE id = ? FOR UPDATE',
        [version.id],
      );
      // The repository may have been deleted while this file was being parsed.
      if (current?.status !== 'processing') return;
      await execute(
        connection,
        "INSERT INTO model_files (id, version_id, kind, blob_id, original_name) VALUES (?, ?, 'model', ?, ?)",
        [newId(), version.id, blobId, version.original_name],
      );
      for (const data of dataBlobs) {
        await execute(
          connection,
          "INSERT INTO model_files (id, version_id, kind, blob_id, original_name) VALUES (?, ?, 'external_data', ?, ?)",
          [newId(), version.id, data.blobId, data.name],
        );
      }
      await execute(
        connection,
        "UPDATE model_versions SET status = 'ready', failure_reason = NULL, failure_detail = NULL WHERE id = ?",
        [version.id],
      );
      await execute(
        connection,
        `UPDATE models m
            LEFT JOIN model_versions cv ON cv.id = m.current_version_id
            SET m.current_version_id = ?
          WHERE m.id = ? AND (cv.id IS NULL OR cv.version_number < ?)`,
        [version.id, version.model_id, version.version_number],
      );
    });
  }

  private async reparseBlob(blobId: string): Promise<void> {
    const { pool, storageDir } = this.deps;
    const blob = await selectOne<{
      storage_key: string;
      format: ModelFormat | 'labels_json';
      size_bytes: number;
    }>(pool, 'SELECT storage_key, format, size_bytes FROM blobs WHERE id = ?', [blobId]);
    if (!blob || blob.format === 'labels_json') return;
    const filePath = pathFor(storageDir, 'blobs', blob.storage_key);
    try {
      const parsed = await runParser(filePath, blob.format, blob.size_bytes);
      await writeGzipJson(
        sidecarPath(storageDir, blob.storage_key, 'graph', PARSER_VERSION),
        parsed.parsed,
      );
      await writeGzipJson(
        sidecarPath(storageDir, blob.storage_key, 'tensors', PARSER_VERSION),
        parsed.tensorIndex,
      );
      await execute(pool, 'UPDATE blobs SET parser_version = ?, summary = ? WHERE id = ?', [
        PARSER_VERSION,
        JSON.stringify(parsed.parsed.summary),
        blobId,
      ]);
    } catch (error) {
      this.deps.log.error({ blobId, err: error }, 'reparse failed');
    }
  }
}

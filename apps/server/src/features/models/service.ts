import type { Pool } from 'mysql2/promise';
import {
  utf8ByteLength,
  type CreateModelBody,
  type ModelAccess,
  type ModelDetail,
  type ModelListItem,
  type ReadmeResponse,
  type Role,
  type UpdateModelBody,
} from '@mieru/shared';
import { createModelBodySchema } from '@mieru/shared';
import type { z } from 'zod';
import {
  execute,
  limitParam,
  selectOne,
  selectRows,
  withTransaction,
  type Queryable,
} from '../../db/query.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../../errors.js';
import { newId } from '../../ids.js';
import { releaseUnreferencedBlobs, type BlobLogger } from '../../storage/blobs.js';
import { resolveModelAccess } from '../sharing/access-service.js';
import { formatFromFilename } from '../uploads/formats.js';
import {
  MODEL_SELECT,
  decodeCursor,
  encodeCursor,
  findVersions,
  latestVersionId,
  toListItem,
  type ModelRow,
} from './repo.js';

type ParsedCreateBody = z.output<typeof createModelBodySchema>;

const PAGE_SIZE_MAX = 50;

interface UploadRow {
  user_id: string;
  original_name: string;
  completed_at: Date | null;
  consumed_at: Date | null;
  expires_at: Date;
}

/**
 * Creates a repository from a finished upload: rows only, the heavy work happens in the
 * processing queue. Returns the new model and version ids.
 * @throws AppError 404 for someone else's or unknown uploads, 409 if not finished or already used.
 */
export async function createModel(
  pool: Pool,
  userId: string,
  body: ParsedCreateBody,
  now: Date,
): Promise<{ modelId: string; versionId: string }> {
  return withTransaction(pool, async (connection) => {
    const upload = await selectOne<UploadRow>(
      connection,
      'SELECT user_id, original_name, completed_at, consumed_at, expires_at FROM uploads WHERE id = ? FOR UPDATE',
      [body.uploadId],
    );
    if (upload?.user_id !== userId) throw notFound('Upload not found');
    if (!upload.completed_at)
      throw conflict('upload_incomplete', 'The upload has not finished yet');
    if (upload.consumed_at) throw conflict('upload_consumed', 'This upload was already used');
    if (upload.expires_at <= now)
      throw conflict('upload_expired', 'The upload expired; upload the file again');
    if (!formatFromFilename(upload.original_name).ok)
      throw badRequest('unsupported_format', 'Unsupported file format');

    const modelId = newId();
    const versionId = newId();
    const hasReadme = body.readme !== undefined && body.readme.trim().length > 0;
    await execute(
      connection,
      `INSERT INTO models (id, owner_id, name, description, readme_md, readme_updated_at, readme_updated_by,
                           license, visibility, public_allow_download, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        modelId,
        userId,
        body.name,
        body.description || null,
        hasReadme ? (body.readme ?? null) : null,
        hasReadme ? now : null,
        hasReadme ? userId : null,
        body.license ?? null,
        body.visibility,
        body.publicAllowDownload ? 1 : 0,
        body.visibility === 'public' ? now : null,
      ],
    );
    await execute(
      connection,
      `INSERT INTO model_versions (id, model_id, version_number, status, upload_id, original_name, created_by)
       VALUES (?, ?, 1, 'processing', ?, ?, ?)`,
      [versionId, modelId, body.uploadId, upload.original_name, userId],
    );
    await execute(connection, 'UPDATE uploads SET consumed_at = ? WHERE id = ?', [
      now,
      body.uploadId,
    ]);
    return { modelId, versionId };
  });
}

async function findModelRow(db: Queryable, modelId: string): Promise<ModelRow | null> {
  return selectOne<ModelRow>(db, `${MODEL_SELECT} WHERE m.id = ?`, [modelId]);
}

export async function getModelDetail(
  pool: Pool,
  modelId: string,
  access: ModelAccess,
  userId: string | null,
): Promise<ModelDetail> {
  const row = await findModelRow(pool, modelId);
  if (!row) throw notFound('Model not found');
  const latestId = await latestVersionId(pool, modelId);
  const versionIds = [row.current_version_id, latestId].filter((id): id is string => id !== null);
  const versions = await findVersions(pool, modelId, { ids: versionIds });
  const starred = userId
    ? await selectOne(pool, 'SELECT 1 AS starred FROM stars WHERE user_id = ? AND model_id = ?', [
        userId,
        modelId,
      ])
    : null;
  return {
    ...toListItem(row, access.role),
    license: row.license,
    hasReadme: row.has_readme === 1,
    currentVersion: versions.find((version) => version.id === row.current_version_id) ?? null,
    latestVersion: versions.find((version) => version.id === latestId) ?? null,
    myAccess: access,
    starredByMe: starred !== null,
    takenDown: row.taken_down_at !== null,
    takenDownReason: row.taken_down_at ? row.taken_down_reason : null,
  };
}

/**
 * Lists the caller's own repositories or those shared with them (direct shares and visited
 * links), newest activity first, with keyset pagination.
 */
export async function listModels(
  pool: Pool,
  userId: string,
  scope: 'owned' | 'shared',
  options: { limit: number; cursor?: string; now: Date },
): Promise<{ items: ModelListItem[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(options.limit, 1), PAGE_SIZE_MAX);
  const cursor = decodeCursor(options.cursor);
  const params: (string | Date)[] = [];
  let where: string;
  if (scope === 'owned') {
    where = 'm.owner_id = ?';
    params.push(userId);
  } else {
    where = `m.owner_id <> ? AND m.taken_down_at IS NULL AND (
      (m.visibility IN ('users', 'link', 'public') AND EXISTS (
        SELECT 1 FROM shares s WHERE s.model_id = m.id AND s.user_id = ?))
      OR (m.visibility IN ('link', 'public') AND EXISTS (
        SELECT 1 FROM link_visits v JOIN share_links l ON l.id = v.link_id
         WHERE v.user_id = ? AND l.model_id = m.id AND l.revoked_at IS NULL
           AND (l.expires_at IS NULL OR l.expires_at > ?))))`;
    params.push(userId, userId, userId, options.now);
  }
  if (cursor) {
    where += ' AND (m.updated_at < ? OR (m.updated_at = ? AND m.id < ?))';
    params.push(new Date(cursor.updatedAt), new Date(cursor.updatedAt), cursor.id);
  }
  const rows = await selectRows<ModelRow>(
    pool,
    `${MODEL_SELECT} WHERE ${where} ORDER BY m.updated_at DESC, m.id DESC LIMIT ?`,
    [...params, limitParam(limit + 1)],
  );
  const page = rows.slice(0, limit);
  const items: ModelListItem[] = [];
  for (const row of page) {
    let role: Role | null = 'owner';
    if (scope === 'shared') {
      const access = await resolveModelAccess(
        pool,
        row.id,
        { userId, linkTokenHash: null },
        options.now,
      );
      if (!access) continue;
      role = access.role;
    }
    items.push(toListItem(row, role));
  }
  const last = page.at(-1);
  return {
    items,
    nextCursor:
      rows.length > limit && last
        ? encodeCursor({ updatedAt: last.updated_at.toISOString(), id: last.id })
        : null,
  };
}

/**
 * Updates repository fields. Visibility and public download are owner-only even though the
 * route admits editors; going public the first time stamps `published_at` for Explore.
 */
export async function updateModel(
  pool: Pool,
  modelId: string,
  access: ModelAccess,
  body: UpdateModelBody,
  now: Date,
): Promise<void> {
  const changesAccess = body.visibility !== undefined || body.publicAllowDownload !== undefined;
  if (changesAccess && access.role !== 'owner')
    throw forbidden('Only the owner can change who has access');
  const assignments: string[] = [];
  const params: (string | number | Date | null)[] = [];
  if (body.name !== undefined) {
    assignments.push('name = ?');
    params.push(body.name);
  }
  if (body.description !== undefined) {
    assignments.push('description = ?');
    params.push(body.description || null);
  }
  if (body.license !== undefined) {
    assignments.push('license = ?');
    params.push(body.license);
  }
  if (body.visibility !== undefined) {
    assignments.push('visibility = ?');
    params.push(body.visibility);
    if (body.visibility === 'public') {
      assignments.push('published_at = COALESCE(published_at, ?)');
      params.push(now);
    }
  }
  if (body.publicAllowDownload !== undefined) {
    assignments.push('public_allow_download = ?');
    params.push(body.publicAllowDownload ? 1 : 0);
  }
  await execute(pool, `UPDATE models SET ${assignments.join(', ')} WHERE id = ?`, [
    ...params,
    modelId,
  ]);
}

/** Deletes a repository: rows first in one transaction, then any files nobody else references. */
export async function deleteModel(
  pool: Pool,
  storageDir: string,
  modelId: string,
  log: BlobLogger,
): Promise<void> {
  const blobIds = await withTransaction(pool, async (connection) => {
    const rows = await selectRows<{ blob_id: string }>(
      connection,
      `SELECT DISTINCT f.blob_id FROM model_files f JOIN model_versions v ON v.id = f.version_id WHERE v.model_id = ?`,
      [modelId],
    );
    await execute(connection, 'DELETE FROM models WHERE id = ?', [modelId]);
    return rows.map((row) => row.blob_id);
  });
  await releaseUnreferencedBlobs(pool, storageDir, blobIds, log);
}

interface ReadmeRow {
  readme_md: string | null;
  readme_updated_at: Date | null;
  editor_username: string | null;
  editor_display_name: string | null;
}

export async function getReadme(pool: Pool, modelId: string): Promise<ReadmeResponse> {
  const row = await selectOne<ReadmeRow>(
    pool,
    `SELECT m.readme_md, m.readme_updated_at, u.username AS editor_username, u.display_name AS editor_display_name
       FROM models m LEFT JOIN users u ON u.id = m.readme_updated_by WHERE m.id = ?`,
    [modelId],
  );
  if (!row) throw notFound('Model not found');
  return {
    markdown: row.readme_md ?? '',
    updatedAt: row.readme_updated_at?.toISOString() ?? null,
    updatedBy: row.editor_username
      ? {
          username: row.editor_username,
          displayName: row.editor_display_name ?? row.editor_username,
        }
      : null,
  };
}

/**
 * Saves the README if nobody saved since the editor loaded it (`baseUpdatedAt`), so two
 * editors can't silently overwrite each other.
 * @throws AppError 409 `readme_conflict`.
 */
export async function saveReadme(
  pool: Pool,
  modelId: string,
  userId: string,
  markdown: string,
  baseUpdatedAt: string | null,
  now: Date,
): Promise<void> {
  if (utf8ByteLength(markdown) > 256 * 1024)
    throw new AppError(413, 'readme_too_large', 'README is larger than 256 KiB');
  const result = await execute(
    pool,
    `UPDATE models SET readme_md = ?, readme_updated_at = ?, readme_updated_by = ?
      WHERE id = ? AND ((? IS NULL AND readme_updated_at IS NULL) OR readme_updated_at = ?)`,
    [
      markdown || null,
      now,
      userId,
      modelId,
      baseUpdatedAt,
      baseUpdatedAt ? new Date(baseUpdatedAt) : null,
    ],
  );
  if (result.affectedRows === 0)
    throw conflict('readme_conflict', 'Someone else saved the README in the meantime');
}

export { type CreateModelBody };

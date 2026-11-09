import type { PoolConnection } from 'mysql2/promise';
import { execute, selectRows } from '../../db/query.js';
import { badRequest, conflict, notFound } from '../../errors.js';

interface DataUploadRow {
  id: string;
  user_id: string;
  original_name: string;
  role: 'model' | 'external_data';
  target_model_id: string | null;
  completed_at: Date | null;
  consumed_at: Date | null;
  expires_at: Date;
}

export interface ClaimDataUploadsInput {
  userId: string;
  versionId: string;
  /** The repository a new version is for, or null when the repository is being created. */
  targetModelId: string | null;
  uploadIds: readonly string[];
  now: Date;
}

/**
 * Attaches finished external data uploads to a processing version and marks them consumed.
 * Runs inside the caller's transaction, after the version row exists.
 * @throws AppError 404 for unknown or foreign uploads, 409 for unfinished, used or expired ones,
 *   400 when an upload isn't a data file or two files share a name.
 */
export async function claimDataUploads(
  connection: PoolConnection,
  { userId, versionId, targetModelId, uploadIds, now }: ClaimDataUploadsInput,
): Promise<void> {
  const ids = [...new Set(uploadIds)];
  if (ids.length === 0) return;
  const rows = await selectRows<DataUploadRow>(
    connection,
    `SELECT id, user_id, original_name, role, target_model_id, completed_at, consumed_at, expires_at
       FROM uploads WHERE id IN (${ids.map(() => '?').join(', ')}) FOR UPDATE`,
    ids,
  );
  const names = new Set<string>();
  for (const id of ids) {
    const upload = rows.find((row) => row.id === id);
    if (upload?.user_id !== userId || upload.target_model_id !== targetModelId) {
      throw notFound('Upload not found');
    }
    if (upload.role !== 'external_data') {
      throw badRequest('not_external_data', 'This upload is not an external data file');
    }
    if (!upload.completed_at)
      throw conflict('upload_incomplete', 'The upload has not finished yet');
    if (upload.consumed_at) throw conflict('upload_consumed', 'This upload was already used');
    if (upload.expires_at <= now)
      throw conflict('upload_expired', 'The upload expired; upload the file again');
    if (names.has(upload.original_name)) {
      throw badRequest('duplicate_data_file', `Two data files are named ${upload.original_name}`);
    }
    names.add(upload.original_name);
  }
  for (const upload of rows) {
    await execute(
      connection,
      'INSERT INTO version_data_uploads (version_id, upload_id, original_name) VALUES (?, ?, ?)',
      [versionId, upload.id, upload.original_name],
    );
  }
  await execute(
    connection,
    `UPDATE uploads SET consumed_at = ? WHERE id IN (${ids.map(() => '?').join(', ')})`,
    [now, ...ids],
  );
}

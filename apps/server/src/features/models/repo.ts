import type {
  ModelFormat,
  ModelListItem,
  ModelSummary,
  Role,
  VersionStatus,
  VersionSummary,
  Visibility,
} from '@mieru/shared';
import { limitParam, selectRows, type Queryable, type SqlParam } from '../../db/query.js';
import { formatFromFilename } from '../uploads/formats.js';

export interface ModelRow {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  license: string | null;
  visibility: Visibility;
  public_allow_download: number;
  star_count: number;
  open_issue_count: number;
  has_readme: number;
  taken_down_at: Date | null;
  taken_down_reason: string | null;
  current_version_id: string | null;
  updated_at: Date;
  slug: string;
  owner_username: string;
  owner_display_name: string;
  // Columns from the current (or latest) version and its model blob.
  version_status: VersionStatus | null;
  version_original_name: string | null;
  blob_format: ModelFormat | null;
  // SUM() comes back as a DECIMAL string.
  blob_size: number | string | null;
  blob_params: number | null;
  blob_summary: ModelSummary | null;
}

/**
 * Selects models with owner and display-version columns. The display version is the current
 * ready version, or the latest one while the first upload is still processing or failed.
 */
export const MODEL_SELECT = `
  SELECT m.id, m.owner_id, m.name, m.description, m.license, m.visibility, m.public_allow_download,
         m.star_count, m.open_issue_count, (m.readme_md IS NOT NULL AND m.readme_md <> '') AS has_readme,
         m.taken_down_at, m.taken_down_reason, m.current_version_id, m.updated_at,
         m.slug, o.username AS owner_username, o.display_name AS owner_display_name,
         dv.status AS version_status, dv.original_name AS version_original_name,
         b.format AS blob_format,
         b.size_bytes + COALESCE((SELECT SUM(xb.size_bytes) FROM model_files xf JOIN blobs xb ON xb.id = xf.blob_id
                                   WHERE xf.version_id = dv.id AND xf.kind = 'external_data'), 0) AS blob_size, b.total_params AS blob_params, b.summary AS blob_summary
    FROM models m
    JOIN users o ON o.id = m.owner_id
    LEFT JOIN model_versions dv ON dv.id = COALESCE(
      m.current_version_id,
      (SELECT lv.id FROM model_versions lv WHERE lv.model_id = m.id ORDER BY lv.version_number DESC LIMIT 1))
    LEFT JOIN model_files f ON f.version_id = dv.id AND f.kind = 'model'
    LEFT JOIN blobs b ON b.id = f.blob_id`;

export function toListItem(row: ModelRow, myRole: Role | null): ModelListItem {
  const fallbackFormat = row.version_original_name
    ? formatFromFilename(row.version_original_name)
    : null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    format: row.blob_format ?? (fallbackFormat?.ok ? fallbackFormat.format : null),
    slug: row.slug,
    owner: { username: row.owner_username, displayName: row.owner_display_name },
    myRole,
    status: row.version_status,
    sizeBytes: row.blob_size === null ? null : Number(row.blob_size),
    totalParams: row.blob_params,
    visibility: row.visibility,
    publicAllowDownload: row.public_allow_download === 1,
    starCount: row.star_count,
    openIssueCount: row.open_issue_count,
    strip: row.blob_summary?.strip ?? [],
    updatedAt: row.updated_at.toISOString(),
  };
}

interface VersionRow {
  id: string;
  version_number: number;
  status: VersionStatus;
  failure_reason: string | null;
  failure_detail: string | null;
  original_name: string;
  created_at: Date;
  sha256: Buffer | null;
  summary: ModelSummary | null;
}

export function toVersionSummary(row: VersionRow): VersionSummary {
  return {
    id: row.id,
    number: row.version_number,
    status: row.status,
    failureReason: row.failure_reason,
    failureDetail: row.failure_detail,
    originalName: row.original_name,
    sha256: row.sha256 ? row.sha256.toString('hex') : null,
    summary: row.summary,
    createdAt: row.created_at.toISOString(),
  };
}

export async function findVersions(
  db: Queryable,
  modelId: string,
  where: 'all' | { ids: string[] },
): Promise<VersionSummary[]> {
  const filter =
    where === 'all' ? '' : `AND v.id IN (${where.ids.map(() => '?').join(', ') || 'NULL'})`;
  const params: SqlParam[] = where === 'all' ? [modelId] : [modelId, ...where.ids];
  const rows = await selectRows<VersionRow>(
    db,
    `SELECT v.id, v.version_number, v.status, v.failure_reason, v.failure_detail, v.original_name, v.created_at,
            b.sha256, b.summary
       FROM model_versions v
       LEFT JOIN model_files f ON f.version_id = v.id AND f.kind = 'model'
       LEFT JOIN blobs b ON b.id = f.blob_id
      WHERE v.model_id = ? ${filter}
      ORDER BY v.version_number DESC`,
    params,
  );
  return rows.map(toVersionSummary);
}

export async function latestVersionId(db: Queryable, modelId: string): Promise<string | null> {
  const rows = await selectRows<{ id: string }>(
    db,
    'SELECT id FROM model_versions WHERE model_id = ? ORDER BY version_number DESC LIMIT ?',
    [modelId, limitParam(1)],
  );
  return rows[0]?.id ?? null;
}

export interface ListCursor {
  updatedAt: string;
  id: string;
}

export function encodeCursor(cursor: ListCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

export function decodeCursor(value: string | undefined): ListCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Partial<ListCursor>;
    return typeof parsed.updatedAt === 'string' && typeof parsed.id === 'string'
      ? { updatedAt: parsed.updatedAt, id: parsed.id }
      : null;
  } catch {
    return null;
  }
}

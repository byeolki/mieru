import type { GrantableRole, ModelAccess, Visibility } from '@mieru/shared';
import { selectOne, selectRows, type Queryable } from '../../db/query.js';
import { combineGrants, type LinkGrant } from './grants.js';

export interface Principal {
  userId: string | null;
  /** SHA-256 of the share-link token presented with the request, if any. */
  linkTokenHash: Buffer | null;
}

interface AccessRow {
  owner_id: string;
  visibility: Visibility;
  public_allow_download: number;
  taken_down_at: Date | null;
  user_role: 'user' | 'admin' | null;
  share_role: GrantableRole | null;
  share_download: number | null;
  link_role: GrantableRole | null;
  link_download: number | null;
  link_expires_at: Date | null;
  link_revoked_at: Date | null;
}

interface VisitRow {
  role: GrantableRole;
  allow_download: number;
  expires_at: Date | null;
  revoked_at: Date | null;
}

// A value that can never match a real token hash, used when no link header was sent.
const NO_LINK_HASH = Buffer.alloc(32);

/**
 * Resolves what `principal` may do on a model. This and `combineGrants` are the only place
 * permissions are decided; every model route goes through `requireModelAccess`.
 */
export async function resolveModelAccess(
  db: Queryable,
  modelId: string,
  principal: Principal,
  now: Date,
): Promise<ModelAccess | null> {
  const row = await selectOne<AccessRow>(
    db,
    `SELECT m.owner_id, m.visibility, m.public_allow_download, m.taken_down_at,
            u.role AS user_role,
            s.role AS share_role, s.allow_download AS share_download,
            l.role AS link_role, l.allow_download AS link_download,
            l.expires_at AS link_expires_at, l.revoked_at AS link_revoked_at
       FROM models m
       LEFT JOIN users u ON u.id = ?
       LEFT JOIN shares s ON s.model_id = m.id AND s.user_id = ?
       LEFT JOIN share_links l ON l.model_id = m.id AND l.token_hash = ?
      WHERE m.id = ?`,
    [
      principal.userId ?? '',
      principal.userId ?? '',
      principal.linkTokenHash ?? NO_LINK_HASH,
      modelId,
    ],
  );
  if (!row) return null;

  const visits = principal.userId
    ? await selectRows<VisitRow>(
        db,
        `SELECT l.role, l.allow_download, l.expires_at, l.revoked_at
           FROM link_visits v JOIN share_links l ON l.id = v.link_id
          WHERE v.user_id = ? AND l.model_id = ?`,
        [principal.userId, modelId],
      )
    : [];

  const toLink = (
    role: GrantableRole,
    allowDownload: number | null,
    expiresAt: Date | null,
    revokedAt: Date | null,
  ): LinkGrant => ({
    role,
    allowDownload: allowDownload === 1,
    expiresAt,
    revokedAt,
  });

  return combineGrants({
    model: {
      ownerId: row.owner_id,
      visibility: row.visibility,
      publicAllowDownload: row.public_allow_download === 1,
      takenDown: row.taken_down_at !== null,
    },
    userId: principal.userId,
    isAdmin: row.user_role === 'admin',
    share: row.share_role
      ? { role: row.share_role, allowDownload: row.share_download === 1 }
      : null,
    headerLink: row.link_role
      ? toLink(row.link_role, row.link_download, row.link_expires_at, row.link_revoked_at)
      : null,
    visitedLinks: visits.map((visit) =>
      toLink(visit.role, visit.allow_download, visit.expires_at, visit.revoked_at),
    ),
    now,
  });
}

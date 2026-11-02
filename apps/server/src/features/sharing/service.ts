import type { Pool } from 'mysql2/promise';
import type { GrantableRole, ResolvedLink, Share, ShareLink } from '@mieru/shared';
import { isDuplicateKeyError } from '../../db/errors.js';
import { execute, selectOne, selectRows } from '../../db/query.js';
import { AppError, notFound } from '../../errors.js';
import { newId } from '../../ids.js';
import { generateOpaqueToken, hashToken } from '../auth/tokens.js';
import { resolveModelAccess } from './access-service.js';
import { decryptLinkToken, encryptLinkToken } from './link-tokens.js';

interface ShareRow {
  user_id: string;
  username: string;
  display_name: string;
  role: GrantableRole;
  allow_download: number;
  created_at: Date;
}

const toShare = (row: ShareRow): Share => ({
  user: { id: row.user_id, username: row.username, displayName: row.display_name },
  role: row.role,
  allowDownload: row.role === 'editor' || row.allow_download === 1,
  createdAt: row.created_at.toISOString(),
});

export async function listShares(pool: Pool, modelId: string): Promise<Share[]> {
  const rows = await selectRows<ShareRow>(
    pool,
    `SELECT s.user_id, u.username, u.display_name, s.role, s.allow_download, s.created_at
       FROM shares s JOIN users u ON u.id = s.user_id
      WHERE s.model_id = ? ORDER BY s.created_at`,
    [modelId],
  );
  return rows.map(toShare);
}

/**
 * Grants (or changes) a person's access by username. Editors always get download rights,
 * since they can upload new versions anyway.
 * @throws AppError 404 `user_not_found`, 422 `cannot_share_with_owner`.
 */
export async function upsertShare(
  pool: Pool,
  modelId: string,
  actorId: string,
  username: string,
  role: GrantableRole,
  allowDownload: boolean,
): Promise<Share> {
  const target = await selectOne<{ id: string }>(pool, 'SELECT id FROM users WHERE username = ?', [
    username,
  ]);
  if (!target) throw new AppError(404, 'user_not_found', 'No user with that username');
  const owner = await selectOne<{ owner_id: string }>(
    pool,
    'SELECT owner_id FROM models WHERE id = ?',
    [modelId],
  );
  if (owner?.owner_id === target.id)
    throw new AppError(422, 'cannot_share_with_owner', 'The owner already has full access');
  await execute(
    pool,
    `INSERT INTO shares (model_id, user_id, role, allow_download, created_by) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE role = VALUES(role), allow_download = VALUES(allow_download)`,
    [modelId, target.id, role, role === 'editor' || allowDownload ? 1 : 0, actorId],
  );
  const row = await selectOne<ShareRow>(
    pool,
    `SELECT s.user_id, u.username, u.display_name, s.role, s.allow_download, s.created_at
       FROM shares s JOIN users u ON u.id = s.user_id WHERE s.model_id = ? AND s.user_id = ?`,
    [modelId, target.id],
  );
  if (!row) throw new Error('Share vanished right after upsert');
  return toShare(row);
}

export async function removeShare(pool: Pool, modelId: string, username: string): Promise<void> {
  const result = await execute(
    pool,
    'DELETE s FROM shares s JOIN users u ON u.id = s.user_id WHERE s.model_id = ? AND u.username = ?',
    [modelId, username],
  );
  if (result.affectedRows === 0) throw notFound('Share not found');
}

interface LinkRow {
  id: string;
  token_ciphertext: Buffer;
  label: string | null;
  role: GrantableRole;
  allow_download: number;
  expires_at: Date | null;
  revoked_at: Date | null;
  last_used_at: Date | null;
  created_at: Date;
  visitor_count: number;
}

export interface LinkContext {
  appOrigin: string;
  linkTokenKey: string;
}

function toShareLink(row: LinkRow, context: LinkContext): ShareLink {
  const token = decryptLinkToken(row.token_ciphertext, context.linkTokenKey);
  return {
    id: row.id,
    url: `${new URL(context.appOrigin).origin}/s/${token}`,
    label: row.label,
    role: row.role,
    // The stored choice; signed-in editors download through their role regardless.
    allowDownload: row.allow_download === 1,
    expiresAt: row.expires_at?.toISOString() ?? null,
    revokedAt: row.revoked_at?.toISOString() ?? null,
    lastUsedAt: row.last_used_at?.toISOString() ?? null,
    visitorCount: row.visitor_count,
    createdAt: row.created_at.toISOString(),
  };
}

const LINK_SELECT = `
  SELECT l.id, l.token_ciphertext, l.label, l.role, l.allow_download, l.expires_at, l.revoked_at,
         l.last_used_at, l.created_at,
         (SELECT COUNT(*) FROM link_visits v WHERE v.link_id = l.id) AS visitor_count
    FROM share_links l`;

export async function listShareLinks(
  pool: Pool,
  modelId: string,
  context: LinkContext,
): Promise<ShareLink[]> {
  const rows = await selectRows<LinkRow>(
    pool,
    `${LINK_SELECT} WHERE l.model_id = ? ORDER BY l.created_at DESC`,
    [modelId],
  );
  return rows.map((row) => toShareLink(row, context));
}

async function findLink(
  pool: Pool,
  modelId: string,
  linkId: string,
  context: LinkContext,
): Promise<ShareLink> {
  const row = await selectOne<LinkRow>(pool, `${LINK_SELECT} WHERE l.model_id = ? AND l.id = ?`, [
    modelId,
    linkId,
  ]);
  if (!row) throw notFound('Link not found');
  return toShareLink(row, context);
}

export interface LinkSettings {
  role: GrantableRole;
  allowDownload: boolean;
  expiresAt: string | null;
  label: string | null;
}

export async function createShareLink(
  pool: Pool,
  modelId: string,
  actorId: string,
  settings: LinkSettings,
  context: LinkContext,
): Promise<ShareLink> {
  const token = generateOpaqueToken();
  const id = newId();
  await execute(
    pool,
    `INSERT INTO share_links (id, model_id, token_hash, token_ciphertext, label, role, allow_download, expires_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      modelId,
      hashToken(token),
      encryptLinkToken(token, context.linkTokenKey),
      settings.label,
      settings.role,
      settings.allowDownload ? 1 : 0,
      settings.expiresAt ? new Date(settings.expiresAt) : null,
      actorId,
    ],
  );
  return findLink(pool, modelId, id, context);
}

export async function updateShareLink(
  pool: Pool,
  modelId: string,
  linkId: string,
  changes: Partial<LinkSettings>,
  context: LinkContext,
): Promise<ShareLink> {
  const current = await findLink(pool, modelId, linkId, context);
  const role = changes.role ?? current.role;
  const allowDownload = changes.allowDownload ?? current.allowDownload;
  const expiresAt = changes.expiresAt === undefined ? current.expiresAt : changes.expiresAt;
  const label = changes.label === undefined ? current.label : changes.label;
  await execute(
    pool,
    'UPDATE share_links SET role = ?, allow_download = ?, expires_at = ?, label = ? WHERE id = ? AND model_id = ?',
    [role, allowDownload ? 1 : 0, expiresAt ? new Date(expiresAt) : null, label, linkId, modelId],
  );
  return findLink(pool, modelId, linkId, context);
}

export async function revokeShareLink(
  pool: Pool,
  modelId: string,
  linkId: string,
  now: Date,
): Promise<void> {
  const result = await execute(
    pool,
    'UPDATE share_links SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ? AND model_id = ?',
    [now, linkId, modelId],
  );
  if (result.affectedRows === 0) throw notFound('Link not found');
}

/**
 * Resolves a presented link token to the model it opens and what it allows. Signed-in
 * visitors get a remembered visit, so the model stays in "shared with me" while the link lives.
 * Unknown, expired, revoked and not-shareable all answer the same 404.
 */
export async function resolveShareLink(
  pool: Pool,
  token: string,
  userId: string | null,
  now: Date,
): Promise<ResolvedLink> {
  const tokenHash = hashToken(token);
  const link = await selectOne<{ id: string; model_id: string }>(
    pool,
    'SELECT id, model_id FROM share_links WHERE token_hash = ?',
    [tokenHash],
  );
  if (!link) throw notFound('Link not found');
  const access = await resolveModelAccess(
    pool,
    link.model_id,
    { userId, linkTokenHash: tokenHash },
    now,
  );
  if (!access) throw notFound('Link not found');
  const usable = await selectOne(
    pool,
    `SELECT 1 AS ok FROM share_links l JOIN models m ON m.id = l.model_id
      WHERE l.id = ? AND l.revoked_at IS NULL AND (l.expires_at IS NULL OR l.expires_at > ?)
        AND m.visibility IN ('link', 'public') AND m.taken_down_at IS NULL`,
    [link.id, now],
  );
  if (!usable) throw notFound('Link not found');
  await execute(pool, 'UPDATE share_links SET last_used_at = ? WHERE id = ?', [now, link.id]);
  if (userId) {
    try {
      await execute(
        pool,
        `INSERT INTO link_visits (user_id, link_id, first_opened_at, last_opened_at) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE last_opened_at = VALUES(last_opened_at)`,
        [userId, link.id, now, now],
      );
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
    }
  }
  return { modelId: link.model_id, role: access.role, canDownload: access.canDownload };
}

/** Prefix search over usernames and display names for the share picker. */
export async function searchUsers(pool: Pool, query: string, excludeUserId: string) {
  const escaped = query.replace(/[\\%_]/g, (char) => `\\${char}`);
  return selectRows<{ id: string; username: string; display_name: string }>(
    pool,
    `SELECT id, username, display_name FROM users
      WHERE id <> ? AND (username LIKE ? OR display_name LIKE ?)
      ORDER BY username LIMIT 10`,
    [excludeUserId, `${escaped.toLowerCase()}%`, `${escaped}%`],
  );
}

import type { Pool } from 'mysql2/promise';
import { execute, selectOne, selectRows, withTransaction, type Queryable } from '../../db/query.js';
import { newId } from '../../ids.js';
import { unauthorized } from '../../errors.js';
import { generateOpaqueToken, hashToken } from './tokens.js';

const DAY_MS = 24 * 60 * 60 * 1000;
export const REFRESH_TOKEN_TTL_MS = 30 * DAY_MS;
export const SESSION_TTL_MS = 90 * DAY_MS;
/** A token rotated this recently is a multi-tab race, not theft. */
export const ROTATION_GRACE_MS = 10_000;

export type RevokeReason =
  | 'logout'
  | 'logout_all'
  | 'reuse_detected'
  | 'password_changed'
  | 'account_deleted'
  | 'session_revoked';

export interface SessionClient {
  userAgent: string | null;
  ip: string | null;
}

export interface IssuedSession {
  userId: string;
  familyId: string;
  refreshToken: string;
}

interface RefreshTokenRow {
  id: string;
  user_id: string;
  family_id: string;
  replaced_by_id: string | null;
  rotated_at: Date | null;
  revoked_at: Date | null;
  expires_at: Date;
  family_expires_at: Date;
  created_at: Date;
}

async function insertRefreshToken(
  db: Queryable,
  values: {
    userId: string;
    familyId: string;
    token: string;
    now: Date;
    familyExpiresAt: Date;
    client: SessionClient;
  },
): Promise<string> {
  const id = newId();
  const expiresAt = new Date(
    Math.min(values.now.getTime() + REFRESH_TOKEN_TTL_MS, values.familyExpiresAt.getTime()),
  );
  await execute(
    db,
    `INSERT INTO refresh_tokens
       (id, user_id, family_id, token_hash, expires_at, family_expires_at, user_agent, ip, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      values.userId,
      values.familyId,
      hashToken(values.token),
      expiresAt,
      values.familyExpiresAt,
      values.client.userAgent?.slice(0, 255) ?? null,
      values.client.ip,
      values.now,
    ],
  );
  return id;
}

/** Starts a new session family for a user who just proved their identity. */
export async function issueSession(
  db: Queryable,
  userId: string,
  client: SessionClient,
  now: Date,
): Promise<IssuedSession> {
  const familyId = newId();
  const refreshToken = generateOpaqueToken();
  await insertRefreshToken(db, {
    userId,
    familyId,
    token: refreshToken,
    now,
    familyExpiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    client,
  });
  return { userId, familyId, refreshToken };
}

export async function revokeFamily(
  db: Queryable,
  familyId: string,
  reason: RevokeReason,
  now: Date,
): Promise<void> {
  await execute(
    db,
    `UPDATE refresh_tokens SET revoked_at = ?, revoke_reason = ?
     WHERE family_id = ? AND revoked_at IS NULL`,
    [now, reason, familyId],
  );
}

export async function revokeAllForUser(
  db: Queryable,
  userId: string,
  reason: RevokeReason,
  now: Date,
  exceptFamilyId?: string,
): Promise<void> {
  await execute(
    db,
    `UPDATE refresh_tokens SET revoked_at = ?, revoke_reason = ?
     WHERE user_id = ? AND revoked_at IS NULL AND family_id <> ?`,
    [now, reason, userId, exceptFamilyId ?? ''],
  );
}

export interface RotationOutcome extends IssuedSession {
  passwordChangedAt: Date | null;
}

type RotationResult =
  | { kind: 'rotated'; session: IssuedSession }
  | { kind: 'rejected'; code: 'invalid_refresh' | 'stale_refresh' }
  | { kind: 'reused'; userId: string; familyId: string };

/**
 * Exchanges a refresh token for a new one in the same family.
 * Replaying an already-rotated token outside the grace window revokes the whole family,
 * because only a stolen copy can still be presented after the legitimate client rotated it.
 * Revocations commit before the error is thrown, so a rejected request can't undo them.
 * @throws AppError 401 with code `invalid_refresh`, `stale_refresh` or `refresh_reuse`.
 */
export async function rotateRefreshToken(
  pool: Pool,
  token: string,
  client: SessionClient,
  now: Date,
  onReuse: (row: { userId: string; familyId: string }) => Promise<void>,
): Promise<IssuedSession> {
  const result = await withTransaction<RotationResult>(pool, async (connection) => {
    const row = await selectOne<RefreshTokenRow>(
      connection,
      `SELECT id, user_id, family_id, replaced_by_id, rotated_at, revoked_at, expires_at,
              family_expires_at, created_at
         FROM refresh_tokens WHERE token_hash = ? FOR UPDATE`,
      [hashToken(token)],
    );
    if (!row || row.revoked_at) return { kind: 'rejected', code: 'invalid_refresh' };

    if (row.replaced_by_id) {
      const rotatedAgo = now.getTime() - (row.rotated_at?.getTime() ?? 0);
      if (rotatedAgo <= ROTATION_GRACE_MS) return { kind: 'rejected', code: 'stale_refresh' };
      await revokeFamily(connection, row.family_id, 'reuse_detected', now);
      return { kind: 'reused', userId: row.user_id, familyId: row.family_id };
    }

    if (row.expires_at <= now || row.family_expires_at <= now) {
      return { kind: 'rejected', code: 'invalid_refresh' };
    }

    const user = await selectOne<{ password_changed_at: Date | null }>(
      connection,
      'SELECT password_changed_at FROM users WHERE id = ?',
      [row.user_id],
    );
    if (!user || (user.password_changed_at && user.password_changed_at > row.created_at)) {
      await revokeFamily(connection, row.family_id, 'password_changed', now);
      return { kind: 'rejected', code: 'invalid_refresh' };
    }

    const refreshToken = generateOpaqueToken();
    const successorId = await insertRefreshToken(connection, {
      userId: row.user_id,
      familyId: row.family_id,
      token: refreshToken,
      now,
      familyExpiresAt: row.family_expires_at,
      client,
    });
    await execute(
      connection,
      'UPDATE refresh_tokens SET replaced_by_id = ?, rotated_at = ? WHERE id = ?',
      [successorId, now, row.id],
    );
    return {
      kind: 'rotated',
      session: { userId: row.user_id, familyId: row.family_id, refreshToken },
    };
  });

  switch (result.kind) {
    case 'rotated':
      return result.session;
    case 'reused':
      await onReuse({ userId: result.userId, familyId: result.familyId });
      throw unauthorized('refresh_reuse', 'Session revoked');
    case 'rejected':
      throw unauthorized(
        result.code,
        result.code === 'stale_refresh'
          ? 'Session was just refreshed elsewhere'
          : 'Session expired',
      );
  }
}

/** Finds the family a presented refresh token belongs to (used by logout). */
export async function findFamilyByToken(
  db: Queryable,
  token: string,
): Promise<{ familyId: string; userId: string } | null> {
  const row = await selectOne<{ family_id: string; user_id: string }>(
    db,
    'SELECT family_id, user_id FROM refresh_tokens WHERE token_hash = ?',
    [hashToken(token)],
  );
  return row ? { familyId: row.family_id, userId: row.user_id } : null;
}

export interface SessionRow {
  family_id: string;
  user_agent: string | null;
  ip: string | null;
  created_at: Date;
  last_used_at: Date;
}

/** Active session families with their first and latest token times. */
export function listActiveSessions(
  db: Queryable,
  userId: string,
  now: Date,
): Promise<SessionRow[]> {
  return selectRows<SessionRow>(
    db,
    `SELECT family_id,
            SUBSTRING_INDEX(GROUP_CONCAT(COALESCE(user_agent, '') ORDER BY created_at DESC SEPARATOR '\\n'), '\\n', 1) AS user_agent,
            SUBSTRING_INDEX(GROUP_CONCAT(COALESCE(ip, '') ORDER BY created_at DESC), ',', 1) AS ip,
            MIN(created_at) AS created_at,
            MAX(created_at) AS last_used_at
       FROM refresh_tokens
      WHERE user_id = ? AND revoked_at IS NULL AND family_expires_at > ?
      GROUP BY family_id
     HAVING SUM(replaced_by_id IS NULL AND expires_at > ?) > 0
      ORDER BY last_used_at DESC`,
    [userId, now, now],
  );
}

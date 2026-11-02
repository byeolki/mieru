import { rm } from 'node:fs/promises';
import type { Pool } from 'mysql2/promise';
import type { UpdateMeBody } from '@mieru/shared';
import { recordAudit } from '../../audit.js';
import { isDuplicateKeyError } from '../../db/errors.js';
import { execute, selectRows, withTransaction } from '../../db/query.js';
import { AppError, badRequest, conflict, unauthorized } from '../../errors.js';
import { releaseUnreferencedBlobs, type BlobLogger } from '../../storage/blobs.js';
import { pathFor } from '../../storage/paths.js';
import { hashPassword, verifyPassword } from '../auth/passwords.js';
import { revokeAllForUser } from '../auth/sessions.js';
import { isValidUsername } from '../auth/username.js';
import { findUserById, isUsernameAvailable, updatePasswordHash, type UserRow } from './repo.js';

const USERNAME_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

async function requireUserRow(pool: Pool, userId: string): Promise<UserRow> {
  const user = await findUserById(pool, userId);
  if (!user) throw unauthorized();
  return user;
}

async function requirePassword(user: UserRow, password: string): Promise<void> {
  if (!(await verifyPassword(user.password_hash, password))) {
    throw new AppError(403, 'wrong_password', 'Current password is incorrect');
  }
}

/**
 * Updates profile fields. A username can change once per 30 days, and the old one stays
 * reserved for 30 days so nobody can immediately impersonate the previous owner.
 */
export async function updateProfile(
  pool: Pool,
  userId: string,
  body: UpdateMeBody,
  now: Date,
): Promise<UserRow> {
  const user = await requireUserRow(pool, userId);
  const nextUsername = body.username && body.username !== user.username ? body.username : null;
  if (nextUsername) {
    if (!isValidUsername(nextUsername)) badRequestUsername();
    if (
      user.username_changed_at &&
      now.getTime() - user.username_changed_at.getTime() < USERNAME_COOLDOWN_MS
    ) {
      throw conflict('username_cooldown', 'Username can change once every 30 days');
    }
    if (!(await isUsernameAvailable(pool, nextUsername, now))) {
      throw conflict('username_taken', 'Username is taken');
    }
  }
  try {
    await withTransaction(pool, async (connection) => {
      if (nextUsername) {
        await execute(
          connection,
          'UPDATE users SET username = ?, username_changed_at = ? WHERE id = ?',
          [nextUsername, now, userId],
        );
        await execute(
          connection,
          `INSERT INTO released_usernames (username, released_at) VALUES (?, ?)
           ON DUPLICATE KEY UPDATE released_at = VALUES(released_at)`,
          [user.username, now],
        );
      }
      if (body.displayName !== undefined) {
        await execute(connection, 'UPDATE users SET display_name = ? WHERE id = ?', [
          body.displayName,
          userId,
        ]);
      }
      if (body.bio !== undefined) {
        await execute(connection, 'UPDATE users SET bio = ? WHERE id = ?', [
          body.bio || null,
          userId,
        ]);
      }
    });
  } catch (error) {
    if (isDuplicateKeyError(error, 'uq_users_username')) {
      throw conflict('username_taken', 'Username is taken');
    }
    throw error;
  }
  return requireUserRow(pool, userId);
}

function badRequestUsername(): never {
  throw badRequest('invalid_username', 'Username is not allowed');
}

/**
 * Changes the password and revokes every session, including the current one; the caller
 * issues a fresh session so this device stays signed in with tokens newer than the change.
 */
export async function changePassword(
  pool: Pool,
  userId: string,
  currentPassword: string,
  newPassword: string,
  now: Date,
): Promise<void> {
  const user = await requireUserRow(pool, userId);
  await requirePassword(user, currentPassword);
  await updatePasswordHash(pool, userId, await hashPassword(newPassword), now);
  await revokeAllForUser(pool, userId, 'password_changed', now);
  await recordAudit(pool, { actorId: userId, action: 'auth.password_changed' });
}

/** Changes the login email. The email confers nothing else, so no other state changes. */
export async function changeEmail(
  pool: Pool,
  userId: string,
  currentPassword: string,
  newEmail: string,
): Promise<void> {
  const user = await requireUserRow(pool, userId);
  await requirePassword(user, currentPassword);
  try {
    await execute(pool, 'UPDATE users SET email = ?, email_normalized = ? WHERE id = ?', [
      newEmail,
      newEmail,
      userId,
    ]);
  } catch (error) {
    if (isDuplicateKeyError(error, 'uq_users_email_normalized')) {
      throw conflict('email_taken', 'Email already registered');
    }
    throw error;
  }
}

export interface DeleteAccountDeps {
  pool: Pool;
  storageDir: string;
  log: BlobLogger;
}

/**
 * Deletes the account and everything it owns. Issues and replies written on other people's
 * repositories remain with a null author; stars given are removed and counts corrected.
 * Files are released after the transaction commits.
 */
export async function deleteAccount(
  deps: DeleteAccountDeps,
  userId: string,
  password: string,
  confirmUsername: string,
  now: Date,
): Promise<void> {
  const user = await requireUserRow(deps.pool, userId);
  await requirePassword(user, password);
  if (confirmUsername !== user.username) {
    throw badRequest('confirm_mismatch', 'Typed username does not match');
  }

  const { blobIds, uploadIds } = await withTransaction(deps.pool, async (connection) => {
    const blobRows = await selectRows<{ blob_id: string }>(
      connection,
      `SELECT DISTINCT mf.blob_id
         FROM model_files mf
         JOIN model_versions v ON v.id = mf.version_id
         JOIN models m ON m.id = v.model_id
        WHERE m.owner_id = ?`,
      [userId],
    );
    const uploadRows = await selectRows<{ id: string }>(
      connection,
      'SELECT id FROM uploads WHERE user_id = ?',
      [userId],
    );
    await execute(
      connection,
      `UPDATE models m JOIN stars s ON s.model_id = m.id
          SET m.star_count = GREATEST(m.star_count, 1) - 1
        WHERE s.user_id = ? AND m.owner_id <> ?`,
      [userId, userId],
    );
    await execute(connection, 'DELETE FROM models WHERE owner_id = ?', [userId]);
    await execute(connection, 'DELETE FROM users WHERE id = ?', [userId]);
    await execute(
      connection,
      `INSERT INTO released_usernames (username, released_at) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE released_at = VALUES(released_at)`,
      [user.username, now],
    );
    await recordAudit(connection, {
      actorId: null,
      action: 'account.deleted',
      targetType: 'user',
      targetId: userId,
    });
    return {
      blobIds: blobRows.map((row) => row.blob_id),
      uploadIds: uploadRows.map((row) => row.id),
    };
  });

  await releaseUnreferencedBlobs(deps.pool, deps.storageDir, blobIds, deps.log);
  await Promise.all(
    uploadIds.map((id) => rm(pathFor(deps.storageDir, 'uploads', id), { force: true })),
  );
}

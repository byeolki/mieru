import type { Me } from '@mieru/shared';
import { execute, selectOne, type Queryable } from '../../db/query.js';

export interface UserRow {
  id: string;
  email: string;
  email_normalized: string;
  password_hash: string;
  username: string;
  username_changed_at: Date | null;
  display_name: string;
  bio: string | null;
  role: 'user' | 'admin';
  failed_login_count: number;
  locked_until: Date | null;
  password_changed_at: Date | null;
  created_at: Date;
}

const USER_COLUMNS = `id, email, email_normalized, password_hash, username, username_changed_at,
  display_name, bio, role, failed_login_count, locked_until, password_changed_at, created_at`;

export function toMe(row: UserRow): Me {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    displayName: row.display_name,
    bio: row.bio,
    role: row.role,
    createdAt: row.created_at.toISOString(),
  };
}

export function findUserById(db: Queryable, id: string): Promise<UserRow | null> {
  return selectOne<UserRow>(db, `SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, [id]);
}

export function findUserByEmail(db: Queryable, emailNormalized: string): Promise<UserRow | null> {
  return selectOne<UserRow>(db, `SELECT ${USER_COLUMNS} FROM users WHERE email_normalized = ?`, [
    emailNormalized,
  ]);
}

export function findUserByUsername(db: Queryable, username: string): Promise<UserRow | null> {
  return selectOne<UserRow>(db, `SELECT ${USER_COLUMNS} FROM users WHERE username = ?`, [username]);
}

export interface NewUser {
  id: string;
  email: string;
  emailNormalized: string;
  passwordHash: string;
  username: string;
}

export async function insertUser(db: Queryable, user: NewUser): Promise<void> {
  await execute(
    db,
    `INSERT INTO users (id, email, email_normalized, password_hash, username, display_name)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [user.id, user.email, user.emailNormalized, user.passwordHash, user.username, user.username],
  );
}

/** True when the username is unused and wasn't released by someone else in the last 30 days. */
export async function isUsernameAvailable(
  db: Queryable,
  username: string,
  now: Date,
): Promise<boolean> {
  const row = await selectOne<{ taken: number }>(
    db,
    `SELECT (EXISTS (SELECT 1 FROM users WHERE username = ?)
          OR EXISTS (SELECT 1 FROM released_usernames
                      WHERE username = ? AND released_at > ? - INTERVAL 30 DAY)) AS taken`,
    [username, username, now],
  );
  return row?.taken === 0;
}

export async function recordFailedLogin(
  db: Queryable,
  userId: string,
  lockedUntil: Date | null,
): Promise<void> {
  await execute(
    db,
    'UPDATE users SET failed_login_count = failed_login_count + 1, locked_until = ? WHERE id = ?',
    [lockedUntil, userId],
  );
}

export async function resetFailedLogins(db: Queryable, userId: string): Promise<void> {
  await execute(
    db,
    'UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = ? AND failed_login_count > 0',
    [userId],
  );
}

export async function updatePasswordHash(
  db: Queryable,
  userId: string,
  passwordHash: string,
  changedAt: Date | null,
): Promise<void> {
  await execute(
    db,
    `UPDATE users SET password_hash = ?, password_changed_at = COALESCE(?, password_changed_at),
       failed_login_count = 0, locked_until = NULL
     WHERE id = ?`,
    [passwordHash, changedAt, userId],
  );
}

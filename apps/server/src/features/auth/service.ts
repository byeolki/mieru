import type { Pool } from 'mysql2/promise';
import type { LoginBody, SignupBody } from '@mieru/shared';
import { recordAudit } from '../../audit.js';
import { isDuplicateKeyError } from '../../db/errors.js';
import { AppError, conflict, unauthorized } from '../../errors.js';
import { newId } from '../../ids.js';
import {
  findUserByEmail,
  findUserById,
  insertUser,
  isUsernameAvailable,
  recordFailedLogin,
  resetFailedLogins,
  updatePasswordHash,
  type UserRow,
} from '../users/repo.js';
import { hashPassword, needsRehash, verifyAgainstDummy, verifyPassword } from './passwords.js';
import { issueSession, type IssuedSession, type SessionClient } from './sessions.js';
import { isReservedUsername, usernameBaseFromEmail, withRandomSuffix } from './username.js';

const FREE_FAILED_ATTEMPTS = 5;
const MAX_LOCK_MINUTES = 30;
const USERNAME_ATTEMPTS = 6;
const MINUTE_MS = 60_000;

export interface AuthResult {
  user: UserRow;
  session: IssuedSession;
}

/** Lock duration after the n-th consecutive failure: 1, 2, 4 … minutes, capped at 30. */
export function lockDurationMs(failedCount: number): number | null {
  if (failedCount < FREE_FAILED_ATTEMPTS) return null;
  const minutes = Math.min(2 ** (failedCount - FREE_FAILED_ATTEMPTS), MAX_LOCK_MINUTES);
  return minutes * MINUTE_MS;
}

async function pickUsername(pool: Pool, email: string, now: Date): Promise<string[]> {
  const base = usernameBaseFromEmail(email);
  const candidates = [
    base,
    ...Array.from({ length: USERNAME_ATTEMPTS - 1 }, () => withRandomSuffix(base)),
  ];
  const available: string[] = [];
  for (const candidate of candidates) {
    if (isReservedUsername(candidate)) continue;
    if (await isUsernameAvailable(pool, candidate, now)) available.push(candidate);
  }
  return available;
}

/**
 * Creates an account and its first session. The username is derived from the email and can be
 * changed later; a concurrent signup taking the same username just moves on to the next candidate.
 * @throws AppError 409 `email_taken`.
 */
export async function signup(
  pool: Pool,
  body: SignupBody,
  client: SessionClient,
  now: Date,
): Promise<AuthResult> {
  if (await findUserByEmail(pool, body.email))
    throw conflict('email_taken', 'Email already registered');
  const passwordHash = await hashPassword(body.password);
  const userId = newId();
  for (const username of await pickUsername(pool, body.email, now)) {
    try {
      await insertUser(pool, {
        id: userId,
        email: body.email,
        emailNormalized: body.email,
        passwordHash,
        username,
      });
      const user = await findUserById(pool, userId);
      if (!user) throw new Error('User vanished right after insert');
      return { user, session: await issueSession(pool, userId, client, now) };
    } catch (error) {
      if (isDuplicateKeyError(error, 'uq_users_email_normalized')) {
        throw conflict('email_taken', 'Email already registered');
      }
      if (!isDuplicateKeyError(error, 'uq_users_username')) throw error;
    }
  }
  throw new AppError(503, 'username_unavailable', 'Could not pick a username, try again');
}

/**
 * Verifies credentials with per-account exponential backoff. Unknown emails and locked
 * accounts still pay for one argon2 verification so timing reveals nothing.
 * @throws AppError 401 `invalid_credentials` or 429 `account_locked` (with `retryAfterSec`).
 */
export async function login(
  pool: Pool,
  body: LoginBody,
  client: SessionClient,
  now: Date,
): Promise<AuthResult> {
  const user = await findUserByEmail(pool, body.email);
  if (!user) {
    await verifyAgainstDummy(body.password);
    throw unauthorized('invalid_credentials', 'Email or password is incorrect');
  }
  if (user.locked_until && user.locked_until > now) {
    await verifyAgainstDummy(body.password);
    const retryAfterSec = Math.ceil((user.locked_until.getTime() - now.getTime()) / 1000);
    throw new AppError(429, 'account_locked', 'Too many failed attempts', { retryAfterSec });
  }
  if (!(await verifyPassword(user.password_hash, body.password))) {
    const lockMs = lockDurationMs(user.failed_login_count + 1);
    await recordFailedLogin(pool, user.id, lockMs ? new Date(now.getTime() + lockMs) : null);
    if (lockMs) {
      await recordAudit(pool, { actorId: user.id, action: 'auth.locked', ip: client.ip });
    }
    throw unauthorized('invalid_credentials', 'Email or password is incorrect');
  }
  await resetFailedLogins(pool, user.id);
  if (needsRehash(user.password_hash)) {
    await updatePasswordHash(pool, user.id, await hashPassword(body.password), null);
  }
  return { user, session: await issueSession(pool, user.id, client, now) };
}

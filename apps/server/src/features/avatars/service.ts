import { writeFile } from 'node:fs/promises';
import { selectOne, execute, type Queryable } from '../../db/query.js';
import { badRequest } from '../../errors.js';
import { newId } from '../../ids.js';
import { removeQuietly } from '../../storage/disk.js';
import { pathFor } from '../../storage/paths.js';
import { checkAvatarPng } from './png.js';

const REJECTIONS = {
  too_large: 'The photo is larger than 512 KB',
  not_png: 'Avatars must be PNG images',
  bad_size: 'The photo must be at most 1024 pixels on each side',
} as const;

/**
 * Stores a new profile photo under a fresh key and drops the previous one. A new key per upload
 * lets the image be cached forever: a changed photo is simply a different URL.
 * @throws AppError 400 `invalid_avatar` when the bytes aren't an acceptable PNG.
 */
export async function setAvatar(
  db: Queryable,
  storageDir: string,
  userId: string,
  bytes: Buffer,
): Promise<string> {
  const check = checkAvatarPng(bytes);
  if (!check.ok) throw badRequest('invalid_avatar', REJECTIONS[check.reason]);
  const key = newId();
  await writeFile(pathFor(storageDir, 'avatars', key), bytes, { mode: 0o600 });
  const previous = await selectOne<{ avatar_key: string | null }>(
    db,
    'SELECT avatar_key FROM users WHERE id = ?',
    [userId],
  );
  await execute(db, 'UPDATE users SET avatar_key = ? WHERE id = ?', [key, userId]);
  if (previous?.avatar_key)
    await removeQuietly(pathFor(storageDir, 'avatars', previous.avatar_key));
  return key;
}

/** Goes back to the generated avatar and deletes the stored photo. */
export async function clearAvatar(
  db: Queryable,
  storageDir: string,
  userId: string,
): Promise<void> {
  const previous = await selectOne<{ avatar_key: string | null }>(
    db,
    'SELECT avatar_key FROM users WHERE id = ?',
    [userId],
  );
  await execute(db, 'UPDATE users SET avatar_key = NULL WHERE id = ?', [userId]);
  if (previous?.avatar_key)
    await removeQuietly(pathFor(storageDir, 'avatars', previous.avatar_key));
}

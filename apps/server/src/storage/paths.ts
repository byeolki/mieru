import { mkdir } from 'node:fs/promises';
import path from 'node:path';

export const STORAGE_AREAS = ['uploads', 'blobs', 'parsed'] as const;
export type StorageArea = (typeof STORAGE_AREAS)[number];

const STORAGE_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isStorageKey(value: string): boolean {
  return STORAGE_KEY.test(value);
}

/**
 * Builds the on-disk path for a stored file. Only generated UUID keys and fixed areas are
 * accepted, so no user-supplied string can ever reach the filesystem (no traversal by design).
 * @throws {Error} for anything that isn't a lowercase UUID key.
 */
export function pathFor(storageDir: string, area: StorageArea, key: string, suffix = ''): string {
  if (!isStorageKey(key)) throw new Error('Invalid storage key');
  if (suffix && !/^[a-z0-9.]+$/.test(suffix)) throw new Error('Invalid storage suffix');
  return path.join(path.resolve(storageDir), area, `${key}${suffix}`);
}

export async function ensureStorageDirs(storageDir: string): Promise<void> {
  for (const area of STORAGE_AREAS) {
    await mkdir(path.join(path.resolve(storageDir), area), { recursive: true, mode: 0o700 });
  }
}

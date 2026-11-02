import { mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PARSER_VERSION } from '@mieru/shared';
import { createPool, type DbPool } from '../db/pool.js';
import { execute } from '../db/query.js';
import { collectGarbage } from './gc.js';
import { ensureStorageDirs } from './paths.js';
import { testDatabaseUrl } from '../../test/env.js';

const now = new Date('2026-11-02T12:00:00Z');
const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
const keptKey = '01933c1e-7a6b-7cde-8f00-000000000001';
const orphanKey = '01933c1e-7a6b-7cde-8f00-000000000002';
const freshKey = '01933c1e-7a6b-7cde-8f00-000000000003';
let db: DbPool;
let dir: string;

async function touch(relative: string, time: Date) {
  const file = path.join(dir, relative);
  await writeFile(file, 'x');
  await utimes(file, time, time);
}

beforeAll(async () => {
  db = createPool(testDatabaseUrl());
  dir = await mkdtemp(path.join(os.tmpdir(), 'mieru-gc-'));
  await ensureStorageDirs(dir);
  await execute(db, 'DELETE FROM model_files');
  await execute(db, 'DELETE FROM blobs');
  await execute(
    db,
    "INSERT INTO blobs (id, storage_key, sha256, size_bytes, format) VALUES (?, ?, ?, 1, 'onnx')",
    [keptKey, keptKey, Buffer.alloc(32, 1)],
  );
  await touch(`blobs/${keptKey}`, twoHoursAgo);
  await touch(`parsed/${keptKey}.v${PARSER_VERSION}.json.gz`, twoHoursAgo);
  await touch(`parsed/${keptKey}.v0.json.gz`, twoHoursAgo);
  await touch(`blobs/${orphanKey}`, twoHoursAgo);
  await touch(`blobs/${freshKey}`, now);
});

afterAll(async () => {
  await execute(db, 'DELETE FROM blobs');
  await db.end();
  await rm(dir, { recursive: true, force: true });
});

describe('collectGarbage', () => {
  it('lists orphans and stale sidecars in dry-run mode without deleting', async () => {
    const candidates = await collectGarbage(db, dir, { apply: false, now });
    expect(candidates.map((candidate) => path.basename(candidate.path)).sort()).toEqual(
      [orphanKey, `${keptKey}.v0.json.gz`].sort(),
    );
    expect(await readdir(path.join(dir, 'blobs'))).toHaveLength(3);
  });

  it('deletes them with apply and keeps referenced or fresh files', async () => {
    await collectGarbage(db, dir, { apply: true, now });
    expect((await readdir(path.join(dir, 'blobs'))).sort()).toEqual([keptKey, freshKey].sort());
    expect(await readdir(path.join(dir, 'parsed'))).toEqual([
      `${keptKey}.v${PARSER_VERSION}.json.gz`,
    ]);
  });
});

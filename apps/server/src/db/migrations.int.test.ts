import { cp, mkdtemp, rm, writeFile, appendFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createPool } from './pool.js';
import { execute } from './query.js';
import { runMigrations } from './migrations.js';
import { MIGRATIONS_DIR, testDatabaseUrl } from '../../test/env.js';

const PROBE_VERSION = 999;
const tempDirs: string[] = [];

async function migrationsCopy(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'mieru-migrations-'));
  tempDirs.push(dir);
  await cp(MIGRATIONS_DIR, dir, { recursive: true });
  return dir;
}

afterEach(async () => {
  const db = createPool(testDatabaseUrl());
  await execute(db, 'DROP TABLE IF EXISTS migration_probe');
  await execute(db, 'DELETE FROM schema_migrations WHERE version = ?', [PROBE_VERSION]);
  await db.end();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('runMigrations', () => {
  it('is a no-op when everything is applied', async () => {
    const result = await runMigrations(testDatabaseUrl(), MIGRATIONS_DIR);
    expect(result.applied).toEqual([]);
  });

  it('refuses to run when an applied migration was edited', async () => {
    const dir = await migrationsCopy();
    await appendFile(path.join(dir, '001_init.sql'), '\n-- edited\n');
    await expect(runMigrations(testDatabaseUrl(), dir)).rejects.toThrow(
      /changed after it was applied/,
    );
  });

  it('serializes concurrent runs so a migration applies exactly once', async () => {
    const dir = await migrationsCopy();
    await writeFile(
      path.join(dir, `${PROBE_VERSION}_probe.sql`),
      'CREATE TABLE migration_probe (id INT PRIMARY KEY);',
    );
    const [first, second] = await Promise.all([
      runMigrations(testDatabaseUrl(), dir),
      runMigrations(testDatabaseUrl(), dir),
    ]);
    expect([...first.applied, ...second.applied]).toEqual([`${PROBE_VERSION}_probe`]);
  });
});

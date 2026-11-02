import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool, type DbPool } from './pool.js';
import { execute, limitParam, selectOne, selectRows, withTransaction } from './query.js';
import { testDatabaseUrl } from '../../test/env.js';

let db: DbPool;

beforeAll(async () => {
  db = createPool(testDatabaseUrl());
  await execute(
    db,
    'CREATE TABLE IF NOT EXISTS probe_rows (id INT PRIMARY KEY, label VARCHAR(20))',
  );
  await execute(db, 'DELETE FROM probe_rows');
});

afterAll(async () => {
  await execute(db, 'DROP TABLE IF EXISTS probe_rows');
  await db.end();
});

describe('query helpers', () => {
  it('runs prepared statements with placeholders, including LIMIT', async () => {
    await execute(db, 'INSERT INTO probe_rows (id, label) VALUES (?, ?), (?, ?)', [1, 'a', 2, 'b']);
    const rows = await selectRows<{ id: number; label: string }>(
      db,
      'SELECT id, label FROM probe_rows ORDER BY id LIMIT ?',
      [limitParam(1)],
    );
    expect(rows).toEqual([{ id: 1, label: 'a' }]);
  });

  it('treats placeholder values as data, never SQL', async () => {
    const hostile = "x' OR '1'='1";
    const row = await selectOne(db, 'SELECT id FROM probe_rows WHERE label = ?', [hostile]);
    expect(row).toBeNull();
  });

  it('rolls back a transaction when the work throws', async () => {
    await expect(
      withTransaction(db, async (connection) => {
        await execute(connection, 'INSERT INTO probe_rows (id, label) VALUES (?, ?)', [3, 'c']);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await selectOne(db, 'SELECT id FROM probe_rows WHERE id = ?', [3])).toBeNull();
  });
});

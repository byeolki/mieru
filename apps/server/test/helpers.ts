import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { RowDataPacket } from 'mysql2/promise';
import { buildApp } from '../src/app.js';
import { loadConfig, type AppConfig } from '../src/config.js';
import { createPool, type DbPool } from '../src/db/pool.js';
import { testDatabaseUrl } from './env.js';

export interface TestContext {
  app: FastifyInstance;
  db: DbPool;
  config: AppConfig;
  storageDir: string;
  close: () => Promise<void>;
}

const TEST_SECRET = 'x'.repeat(48);

/** Builds an app against the test database with an isolated temporary storage directory. */
export async function createTestContext(
  overrides: Partial<Record<string, string>> = {},
): Promise<TestContext> {
  const databaseUrl = testDatabaseUrl();
  const storageDir = await mkdtemp(path.join(os.tmpdir(), 'mieru-test-'));
  const config = loadConfig({
    NODE_ENV: 'test',
    APP_ORIGIN: 'http://127.0.0.1:5173',
    LOG_LEVEL: 'silent',
    DATABASE_URL: databaseUrl,
    JWT_SECRET: TEST_SECRET,
    LINK_TOKEN_KEY: TEST_SECRET,
    TICKET_SECRET: TEST_SECRET,
    VIEW_SALT_SECRET: TEST_SECRET,
    STORAGE_DIR: storageDir,
    ...overrides,
  });
  const db = createPool(databaseUrl);
  const app = await buildApp({ config, db });
  await app.ready();
  return {
    app,
    db,
    config,
    storageDir,
    close: async () => {
      await app.close();
      await db.end();
      await rm(storageDir, { recursive: true, force: true });
    },
  };
}

/** Empties every application table so each test file starts clean. */
export async function truncateAllTables(db: DbPool): Promise<void> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT table_name AS name FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name <> 'schema_migrations'`,
  );
  const connection = await db.getConnection();
  try {
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const row of rows) await connection.query(`TRUNCATE TABLE \`${String(row.name)}\``);
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
  } finally {
    connection.release();
  }
}

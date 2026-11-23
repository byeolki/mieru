import mysql from 'mysql2/promise';
import { runMigrations, splitDatabaseUrl } from '../src/db/migrations.js';
import { MIGRATIONS_DIR, testDatabaseUrl } from './env.js';

/**
 * Recreates the test schema empty, then applies every migration, once per run. The runner only
 * creates the showcase database, so the test database is created here.
 */
export default async function setup(): Promise<void> {
  const url = testDatabaseUrl();
  const { serverUrl, databaseName } = splitDatabaseUrl(url);
  const connection = await mysql.createConnection({ uri: serverUrl });
  try {
    await connection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    await connection.query(
      `CREATE DATABASE \`${databaseName}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
    );
  } finally {
    await connection.end();
  }
  await runMigrations(url, MIGRATIONS_DIR);
}

import mysql from 'mysql2/promise';
import { runMigrations, splitDatabaseUrl } from '../src/db/migrations.js';
import { MIGRATIONS_DIR, testDatabaseUrl } from './env.js';

/**
 * Drops the test schema, then lets the migration runner create it again and apply every
 * migration, once per run.
 */
export default async function setup(): Promise<void> {
  const url = testDatabaseUrl();
  const { serverUrl, databaseName } = splitDatabaseUrl(url);
  const connection = await mysql.createConnection({ uri: serverUrl });
  try {
    await connection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
  } finally {
    await connection.end();
  }
  await runMigrations(url, MIGRATIONS_DIR);
}

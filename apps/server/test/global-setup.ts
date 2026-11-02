import mysql from 'mysql2/promise';
import { runMigrations } from '../src/db/migrations.js';
import { MIGRATIONS_DIR, testDatabaseUrl } from './env.js';

/** Recreates the test schema from scratch and applies every migration once per run. */
export default async function setup(): Promise<void> {
  const url = testDatabaseUrl();
  const databaseName = new URL(url).pathname.slice(1);
  const connection = await mysql.createConnection({ uri: url });
  try {
    await connection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    await connection.query(`CREATE DATABASE \`${databaseName}\``);
  } finally {
    await connection.end();
  }
  await runMigrations(url, MIGRATIONS_DIR);
}

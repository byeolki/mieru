import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import mysql, { type Connection, type RowDataPacket } from 'mysql2/promise';

const MIGRATION_FILE = /^(\d{3})_([a-z0-9_]+)\.sql$/;
const LOCK_NAME = 'mieru_migrate';
const LOCK_TIMEOUT_SECONDS = 120;
/** Unquoted MySQL identifier characters; anything else is refused rather than escaped. */
const DATABASE_NAME = /^[A-Za-z0-9_$]{1,64}$/;

export interface MigrationFile {
  version: number;
  name: string;
  checksum: string;
  sql: string;
}

interface AppliedRow extends RowDataPacket {
  version: number;
  name: string;
  checksum: string;
}

export interface MigrationResult {
  applied: string[];
}

/** Reads `NNN_name.sql` files in version order and computes their checksums. */
export async function readMigrationFiles(directory: string): Promise<MigrationFile[]> {
  const entries = await readdir(directory);
  const files: MigrationFile[] = [];
  for (const entry of entries.sort()) {
    const match = MIGRATION_FILE.exec(entry);
    if (!match?.[1] || !match[2]) continue;
    const sql = await readFile(path.join(directory, entry), 'utf8');
    files.push({
      version: Number(match[1]),
      name: match[2],
      checksum: createHash('sha256').update(sql).digest('hex'),
      sql,
    });
  }
  const versions = files.map((file) => file.version);
  if (new Set(versions).size !== versions.length) {
    throw new Error('Duplicate migration version numbers');
  }
  return files;
}

async function ensureMigrationsTable(connection: Connection): Promise<void> {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     INT UNSIGNED NOT NULL,
      name        VARCHAR(255) NOT NULL,
      checksum    CHAR(64) CHARACTER SET ascii NOT NULL,
      applied_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (version)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
}

/**
 * Splits a `mysql://` URL into the database it names and a URL for the server itself.
 * @throws {Error} when the URL names no database or one that is not a plain identifier.
 */
export function splitDatabaseUrl(databaseUrl: string): { serverUrl: string; databaseName: string } {
  const url = new URL(databaseUrl);
  const databaseName = decodeURIComponent(url.pathname.slice(1));
  if (!DATABASE_NAME.test(databaseName)) {
    throw new Error(`DATABASE_URL must name a database made of letters, digits, _ or $`);
  }
  url.pathname = '/';
  return { serverUrl: url.toString(), databaseName };
}

/**
 * Creates the database named in the URL if it is missing, with the same character set the
 * production server uses. The account needs the CREATE privilege on that database.
 */
async function ensureDatabase(databaseUrl: string): Promise<void> {
  const { serverUrl, databaseName } = splitDatabaseUrl(databaseUrl);
  const connection = await mysql.createConnection({ uri: serverUrl });
  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${databaseName}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
    );
  } finally {
    await connection.end();
  }
}

/**
 * Creates the database if needed, then applies pending migrations in order. Holds a MySQL advisory lock so two containers
 * starting during a rolling deploy never migrate at the same time.
 * @throws {Error} when an applied file's checksum changed (migrations are forward-only).
 */
export async function runMigrations(
  databaseUrl: string,
  directory: string,
  log: (message: string) => void = () => undefined,
): Promise<MigrationResult> {
  const files = await readMigrationFiles(directory);
  await ensureDatabase(databaseUrl);
  // A dedicated connection: migration files contain several statements, the app pool forbids that.
  const connection = await mysql.createConnection({
    uri: databaseUrl,
    multipleStatements: true,
    timezone: 'Z',
  });
  try {
    const [lockRows] = await connection.query<RowDataPacket[]>('SELECT GET_LOCK(?, ?) AS locked', [
      LOCK_NAME,
      LOCK_TIMEOUT_SECONDS,
    ]);
    if (lockRows[0]?.locked !== 1) throw new Error('Could not acquire the migration lock');
    try {
      await ensureMigrationsTable(connection);
      const [appliedRows] = await connection.query<AppliedRow[]>(
        'SELECT version, name, checksum FROM schema_migrations ORDER BY version',
      );
      const applied = new Map(appliedRows.map((row) => [row.version, row]));
      const newlyApplied: string[] = [];
      for (const file of files) {
        const previous = applied.get(file.version);
        if (previous) {
          if (previous.checksum !== file.checksum) {
            throw new Error(
              `Migration ${file.version}_${file.name} changed after it was applied; add a new migration instead`,
            );
          }
          continue;
        }
        log(`applying ${file.version}_${file.name}`);
        // DDL auto-commits in MySQL, so a failure here leaves earlier statements applied;
        // keeping one logical change per file keeps that recoverable.
        await connection.query(file.sql);
        await connection.query(
          'INSERT INTO schema_migrations (version, name, checksum) VALUES (?, ?, ?)',
          [file.version, file.name, file.checksum],
        );
        newlyApplied.push(`${file.version}_${file.name}`);
      }
      return { applied: newlyApplied };
    } finally {
      await connection.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]);
    }
  } finally {
    await connection.end();
  }
}

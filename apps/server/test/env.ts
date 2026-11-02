import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** Loads the repo `.env` (if present) and returns the integration test database URL. */
export function testDatabaseUrl(): string {
  const envFile = path.join(repoRoot, '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL must be set for integration tests');
  if (!/\/[^/]*test[^/]*$/.test(url)) {
    throw new Error('TEST_DATABASE_URL must point at a database whose name contains "test"');
  }
  return url;
}

export const MIGRATIONS_DIR = path.join(repoRoot, 'apps/server/migrations');

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMigrations } from '../src/db/migrations.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');
const { applied } = await runMigrations(databaseUrl, migrationsDir, (message) => {
  console.log(message);
});
console.log(
  applied.length === 0 ? 'no pending migrations' : `applied ${applied.length} migration(s)`,
);

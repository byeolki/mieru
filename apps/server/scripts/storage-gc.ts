import { loadConfig } from '../src/config.js';
import { createPool } from '../src/db/pool.js';
import { collectGarbage } from '../src/storage/gc.js';

const apply = process.argv.includes('--apply');
const config = loadConfig();
const pool = createPool(config.DATABASE_URL);
try {
  const candidates = await collectGarbage(pool, config.STORAGE_DIR, { apply, now: new Date() });
  for (const candidate of candidates)
    console.log(`${apply ? 'deleted' : 'would delete'}\t${candidate.reason}\t${candidate.path}`);
  console.log(
    `${candidates.length} file(s) ${apply ? 'deleted' : 'found (dry run; pass --apply to delete)'}`,
  );
} finally {
  await pool.end();
}

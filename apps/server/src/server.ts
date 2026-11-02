import { mkdir } from 'node:fs/promises';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db/pool.js';
import { refreshTrending } from './features/explore/trending.js';
import { runCleanup } from './jobs/cleanup.js';
import { Scheduler } from './jobs/scheduler.js';
import { collectGarbage } from './storage/gc.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const TRENDING_INTERVAL_MS = 15 * 60 * 1000;

const config = loadConfig();
await mkdir(config.STORAGE_DIR, { recursive: true, mode: 0o700 });
const db = createPool(config.DATABASE_URL);
const app = await buildApp({
  config,
  db,
  rateLimitEnabled: config.NODE_ENV === 'production' || config.RATE_LIMIT_ENABLED,
});

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  scheduler.stop();
  await app.close();
  await app.processing.idle();
  await db.end();
  process.exit(0);
};
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ port: config.PORT, host: config.HOST });
await app.processing.recover();

const scheduler = new Scheduler(db, app.log);
const trendingJob = {
  name: 'trending',
  intervalMs: TRENDING_INTERVAL_MS,
  run: async () => {
    await refreshTrending(db, new Date());
  },
};
void scheduler.runOnce(trendingJob);
scheduler.start([
  trendingJob,
  { name: 'cleanup', intervalMs: DAY_MS, run: () => runCleanup(db, new Date(), app.log) },
  {
    name: 'storage-gc',
    intervalMs: DAY_MS,
    run: async () => {
      await collectGarbage(db, config.STORAGE_DIR, { apply: true, now: new Date() });
    },
  },
]);

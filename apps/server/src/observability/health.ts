import { access, constants, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { Clock } from '../clock.js';
import type { AppConfig } from '../config.js';
import type { DbPool } from '../db/pool.js';
import { selectOne } from '../db/query.js';
import type { JobTracker } from '../jobs/tracker.js';
import { freeBytes } from '../storage/disk.js';

type CheckStatus = 'ok' | 'error';

const HOUR_MS = 60 * 60 * 1000;
/** Parsing a 10 GiB file takes minutes; anything still processing after this is stuck. */
export const STUCK_PROCESSING_MS = HOUR_MS;
/** Trending refreshes every 15 minutes, so an hour means several runs were missed. */
export const TRENDING_STALE_MS = HOUR_MS;
/** Backups run daily; the slack covers a slow dump without paging at 24h on the dot. */
export const BACKUP_STALE_MS = 26 * HOUR_MS;

export interface DeepHealthInputs {
  db: CheckStatus;
  storage: CheckStatus;
  freeBytes: number | null;
  diskReserveBytes: number;
  stuckVersions: number | null;
  trendingLastRunAt: Date | null;
  startedAt: Date;
  /** `undefined` when no backup directory is configured. */
  newestBackupAt?: Date | null;
}

export interface DeepHealthReport {
  status: CheckStatus;
  checks: Record<string, { status: CheckStatus | 'skipped'; [detail: string]: unknown }>;
}

const statusOf = (isOk: boolean): CheckStatus => (isOk ? 'ok' : 'error');

/** Pure evaluation of the deep health inputs, kept separate from I/O so thresholds are testable. */
export function evaluateDeepHealth(inputs: DeepHealthInputs, now: Date): DeepHealthReport {
  const age = (at: Date) => now.getTime() - at.getTime();
  // Right after boot the first trending run may still be in flight, so measure from startup.
  const trendingReference = inputs.trendingLastRunAt ?? inputs.startedAt;
  const checks: DeepHealthReport['checks'] = {
    db: { status: inputs.db },
    storage: { status: inputs.storage },
    disk: {
      status: statusOf(inputs.freeBytes !== null && inputs.freeBytes >= inputs.diskReserveBytes),
      freeBytes: inputs.freeBytes,
      reserveBytes: inputs.diskReserveBytes,
    },
    processing: {
      status: statusOf(inputs.stuckVersions === 0),
      stuckVersions: inputs.stuckVersions,
    },
    trending: {
      status: statusOf(age(trendingReference) <= TRENDING_STALE_MS),
      lastRunAt: inputs.trendingLastRunAt?.toISOString() ?? null,
    },
    backups:
      inputs.newestBackupAt === undefined
        ? { status: 'skipped' }
        : {
            status: statusOf(
              inputs.newestBackupAt !== null && age(inputs.newestBackupAt) <= BACKUP_STALE_MS,
            ),
            newestAt: inputs.newestBackupAt?.toISOString() ?? null,
          },
  };
  const isHealthy = Object.values(checks).every((check) => check.status !== 'error');
  return { status: statusOf(isHealthy), checks };
}

async function checkDatabase(db: DbPool): Promise<CheckStatus> {
  try {
    await selectOne(db, 'SELECT 1 AS ok');
    return 'ok';
  } catch {
    return 'error';
  }
}

async function checkStorage(storageDir: string): Promise<CheckStatus> {
  try {
    await access(storageDir, constants.W_OK);
    return 'ok';
  } catch {
    return 'error';
  }
}

// A failed probe is reported as `null` and turns its check red; the error itself is not needed.
async function orNull<T>(probe: Promise<T>): Promise<T | null> {
  try {
    return await probe;
  } catch {
    return null;
  }
}

async function countStuckVersions(db: DbPool, now: Date): Promise<number> {
  const row = await selectOne<{ stuck: number | string }>(
    db,
    `SELECT COUNT(*) AS stuck FROM model_versions WHERE status = 'processing' AND created_at < ?`,
    [new Date(now.getTime() - STUCK_PROCESSING_MS)],
  );
  return Number(row?.stuck ?? 0);
}

async function newestModification(directory: string): Promise<Date | null> {
  const entries = await readdir(directory);
  const times = await Promise.all(
    entries.map(async (entry) => (await stat(path.join(directory, entry))).mtime),
  );
  return times.reduce<Date | null>(
    (newest, time) => (!newest || time > newest ? time : newest),
    null,
  );
}

export interface HealthDeps {
  config: AppConfig;
  db: DbPool;
  clock: Clock;
  jobs: JobTracker;
}

/**
 * `/api/health` is the cheap liveness probe for Docker. `/api/health/deep` is for Uptime Kuma:
 * it also flags conditions that need a human (low disk, stuck parsing, stalled jobs, old backups).
 */
export function registerHealthRoutes(app: FastifyInstance, deps: HealthDeps): void {
  const { config, db, clock, jobs } = deps;

  app.get('/api/health', async (_request, reply) => {
    const [database, storage] = await Promise.all([
      checkDatabase(db),
      checkStorage(config.STORAGE_DIR),
    ]);
    const healthy = database === 'ok' && storage === 'ok';
    return reply
      .status(healthy ? 200 : 503)
      .header('cache-control', 'no-store')
      .send({ status: healthy ? 'ok' : 'error', db: database, storage });
  });

  app.get('/api/health/deep', async (_request, reply) => {
    const now = clock();
    const [database, storage, free, stuck, newestBackupAt] = await Promise.all([
      checkDatabase(db),
      checkStorage(config.STORAGE_DIR),
      orNull(freeBytes(config.STORAGE_DIR)),
      orNull(countStuckVersions(db, now)),
      config.BACKUP_DIR
        ? orNull(newestModification(config.BACKUP_DIR))
        : Promise.resolve(undefined),
    ]);
    const report = evaluateDeepHealth(
      {
        db: database,
        storage,
        freeBytes: free,
        diskReserveBytes: config.DISK_RESERVE_BYTES,
        stuckVersions: stuck,
        trendingLastRunAt: jobs.lastSuccessOf('trending'),
        startedAt: jobs.startedAt,
        newestBackupAt,
      },
      now,
    );
    return reply
      .status(report.status === 'ok' ? 200 : 503)
      .header('cache-control', 'no-store')
      .send(report);
  });
}

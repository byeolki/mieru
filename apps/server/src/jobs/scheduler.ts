import type { RowDataPacket } from 'mysql2/promise';
import type { DbPool } from '../db/pool.js';

export interface JobLogger {
  info: (object: object, message: string) => void;
  error: (object: object, message: string) => void;
}

export interface ScheduledJob {
  name: string;
  intervalMs: number;
  run: () => Promise<void>;
}

/**
 * Runs `work` only if this process wins the MySQL advisory lock for `name`.
 * Advisory locks are per connection, so the lock is taken on a dedicated pooled connection
 * and released on that same connection. Returns false when another process holds it.
 */
export async function runExclusively(
  db: DbPool,
  name: string,
  work: () => Promise<void>,
): Promise<boolean> {
  const connection = await db.getConnection();
  try {
    const [rows] = await connection.query<RowDataPacket[]>('SELECT GET_LOCK(?, 0) AS locked', [
      `mieru_job_${name}`,
    ]);
    if (rows[0]?.locked !== 1) return false;
    try {
      await work();
      return true;
    } finally {
      await connection.query('SELECT RELEASE_LOCK(?)', [`mieru_job_${name}`]);
    }
  } finally {
    connection.release();
  }
}

/** Interval scheduler for in-process background jobs; each run is guarded by `runExclusively`. */
export class Scheduler {
  private readonly timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly db: DbPool,
    private readonly log: JobLogger,
  ) {}

  /** Runs a job once now under its lock; failures are logged, never thrown into the timer loop. */
  async runOnce(job: ScheduledJob): Promise<boolean> {
    const startedAt = Date.now();
    try {
      const ran = await runExclusively(this.db, job.name, job.run);
      if (ran) this.log.info({ job: job.name, ms: Date.now() - startedAt }, 'job finished');
      return ran;
    } catch (error) {
      this.log.error({ job: job.name, err: error }, 'job failed');
      return false;
    }
  }

  start(jobs: readonly ScheduledJob[]): void {
    for (const job of jobs) {
      const timer = setInterval(() => void this.runOnce(job), job.intervalMs);
      timer.unref();
      this.timers.push(timer);
    }
  }

  stop(): void {
    for (const timer of this.timers.splice(0)) clearInterval(timer);
  }
}

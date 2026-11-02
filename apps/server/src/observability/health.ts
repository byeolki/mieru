import { access, constants } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import type { DbPool } from '../db/pool.js';
import { selectOne } from '../db/query.js';

type CheckStatus = 'ok' | 'error';

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

/** Liveness endpoint for the container health check: DB reachable and storage writable. */
export function registerHealthRoutes(
  app: FastifyInstance,
  deps: { db: DbPool; storageDir: string },
): void {
  app.get('/api/health', async (_request, reply) => {
    const [db, storage] = await Promise.all([
      checkDatabase(deps.db),
      checkStorage(deps.storageDir),
    ]);
    const healthy = db === 'ok' && storage === 'ok';
    return reply
      .status(healthy ? 200 : 503)
      .header('cache-control', 'no-store')
      .send({ status: healthy ? 'ok' : 'error', db, storage });
  });
}

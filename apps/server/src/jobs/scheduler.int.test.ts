import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool, type DbPool } from '../db/pool.js';
import { Scheduler, runExclusively } from './scheduler.js';
import { testDatabaseUrl } from '../../test/env.js';

let firstPool: DbPool;
let secondPool: DbPool;

beforeAll(() => {
  firstPool = createPool(testDatabaseUrl());
  secondPool = createPool(testDatabaseUrl());
});

afterAll(async () => {
  await firstPool.end();
  await secondPool.end();
});

describe('runExclusively', () => {
  it('lets only one of two concurrent processes run a job', async () => {
    let runs = 0;
    const slowJob = async () => {
      runs += 1;
      await new Promise((resolve) => setTimeout(resolve, 200));
    };
    const results = await Promise.all([
      runExclusively(firstPool, 'probe', slowJob),
      runExclusively(secondPool, 'probe', slowJob),
    ]);
    expect(runs).toBe(1);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('releases the lock so the next run can proceed', async () => {
    expect(await runExclusively(firstPool, 'probe-release', () => Promise.resolve())).toBe(true);
    expect(await runExclusively(secondPool, 'probe-release', () => Promise.resolve())).toBe(true);
  });
});

describe('Scheduler.runOnce', () => {
  it('logs failures instead of throwing', async () => {
    const errors: unknown[] = [];
    const scheduler = new Scheduler(firstPool, {
      info: () => undefined,
      error: (o) => errors.push(o),
    });
    const ran = await scheduler.runOnce({
      name: 'probe-failure',
      intervalMs: 1000,
      run: () => Promise.reject(new Error('boom')),
    });
    expect(ran).toBe(false);
    expect(errors).toHaveLength(1);
  });
});

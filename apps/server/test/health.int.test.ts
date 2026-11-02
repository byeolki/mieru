import { afterEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from './helpers.js';

let context: TestContext | undefined;

afterEach(async () => {
  await context?.close();
  context = undefined;
});

describe('health endpoints', () => {
  it('deep health turns red on low disk while liveness stays green', async () => {
    context = await createTestContext({ env: { DISK_RESERVE_BYTES: String(2 ** 50) } });
    const liveness = await context.app.inject({ url: '/api/health' });
    expect(liveness.statusCode).toBe(200);
    const deep = await context.app.inject({ url: '/api/health/deep' });
    expect(deep.statusCode).toBe(503);
    expect(deep.json()).toMatchObject({ status: 'error', checks: { disk: { status: 'error' } } });
  });

  it('deep health is green with room to spare', async () => {
    context = await createTestContext({ env: { DISK_RESERVE_BYTES: '1' } });
    const deep = await context.app.inject({ url: '/api/health/deep' });
    expect(deep.json()).toMatchObject({
      status: 'ok',
      checks: { processing: { stuckVersions: 0 } },
    });
  });
});

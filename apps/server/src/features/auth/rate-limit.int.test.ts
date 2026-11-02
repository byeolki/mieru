import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, truncateAllTables, type TestContext } from '../../../test/helpers.js';

let context: TestContext;

beforeAll(async () => {
  context = await createTestContext({ rateLimitEnabled: true });
  await truncateAllTables(context.db);
});

afterAll(async () => {
  await context.close();
});

describe('login rate limit', () => {
  it('returns 429 after ten attempts per minute from one IP', async () => {
    const attempt = () =>
      context.app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'nobody@example.com', password: 'whatever' },
      });
    for (let index = 0; index < 10; index += 1) expect((await attempt()).statusCode).toBe(401);
    const limited = await attempt();
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error.code).toBe('rate_limited');
  });

  it('keys on the real client address, not a spoofed header, when no proxy is trusted', async () => {
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'x-forwarded-for': '203.0.113.9' },
      payload: { email: 'nobody@example.com', password: 'whatever' },
    });
    expect(response.statusCode).toBe(429);
  });
});

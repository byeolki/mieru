import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../test/helpers.js';

let context: TestContext;

beforeAll(async () => {
  context = await createTestContext();
});

afterAll(async () => {
  await context.close();
});

describe('GET /api/health', () => {
  it('reports the database and storage as healthy', async () => {
    const response = await context.app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', db: 'ok', storage: 'ok' });
  });

  it('sends security headers', async () => {
    const response = await context.app.inject({ method: 'GET', url: '/api/health' });
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
  });
});

describe('unknown routes', () => {
  it('answer with the API error shape', async () => {
    const response = await context.app.inject({ method: 'GET', url: '/api/nope' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { code: 'not_found', message: 'Not found' } });
  });
});

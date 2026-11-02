import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tinyCnnOnnx } from '../../test/fixtures/builders.js';
import {
  createRepository,
  createTestContext,
  signUp,
  truncateAllTables,
  type TestContext,
} from '../../test/helpers.js';

let context: TestContext;
let distDir: string;

beforeAll(async () => {
  distDir = await mkdtemp(path.join(os.tmpdir(), 'mieru-dist-'));
  await writeFile(
    path.join(distDir, 'index.html'),
    '<!doctype html><html><head><meta name="description" content="x" /><title>mieru</title></head><body><div id="root"></div></body></html>',
  );
  await writeFile(path.join(distDir, 'app.js'), 'console.log(1)');
  context = await createTestContext({ env: { WEB_DIST_DIR: distDir } });
  await truncateAllTables(context.db);
});

afterAll(async () => {
  await context.close();
  await rm(distDir, { recursive: true, force: true });
});

describe('SPA serving and share previews', () => {
  it('serves static files and falls back to index.html for app routes', async () => {
    expect((await context.app.inject({ method: 'GET', url: '/app.js' })).body).toBe(
      'console.log(1)',
    );
    const page = await context.app.inject({ method: 'GET', url: '/dashboard' });
    expect(page.headers['content-type']).toContain('text/html');
    expect(page.body).toContain('og:title');
  });

  it('keeps unknown API routes as JSON 404s', async () => {
    const response = await context.app.inject({ method: 'GET', url: '/api/nope' });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('not_found');
  });

  it('names public repositories in previews and keeps private ones generic', async () => {
    const owner = await signUp(context.app);
    const shown = await createRepository(
      context,
      owner.accessToken,
      'shown-model.onnx',
      tinyCnnOnnx(),
      { visibility: 'public' },
    );
    const hidden = await createRepository(
      context,
      owner.accessToken,
      'secret-model.onnx',
      tinyCnnOnnx(),
    );
    const publicPage = await context.app.inject({ method: 'GET', url: `/m/${shown.id}` });
    expect(publicPage.body).toContain('<meta property="og:title" content="shown-model');
    expect(publicPage.body).toContain(`/og/m/${shown.id}.png`);
    const privatePage = await context.app.inject({ method: 'GET', url: `/m/${hidden.id}` });
    expect(privatePage.body).not.toContain('secret-model');
    const image = await context.app.inject({ method: 'GET', url: `/og/m/${shown.id}.png` });
    expect(image.headers['content-type']).toBe('image/png');
    expect(image.rawPayload.subarray(1, 4).toString()).toBe('PNG');
  });
});

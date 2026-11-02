import { createHash } from 'node:crypto';
import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  NESTED_SAFETENSORS,
  safetensorsBuffer,
  tinyCnnOnnx,
} from '../../../test/fixtures/builders.js';
import {
  bearer,
  createRepository,
  createTestContext,
  fakeClock,
  signUp,
  truncateAllTables,
  tusUpload,
  type SignedUpUser,
  type TestContext,
} from '../../../test/helpers.js';

const clock = fakeClock();
let context: TestContext;
let alice: SignedUpUser;
let bob: SignedUpUser;

beforeAll(async () => {
  context = await createTestContext({
    clock: clock.now,
    env: { MAX_ONNX_BYTES: '200000', DISK_RESERVE_BYTES: '1024' },
  });
});

beforeEach(async () => {
  await truncateAllTables(context.db);
  for (const area of ['uploads', 'blobs', 'parsed']) {
    const dir = path.join(context.storageDir, area);
    for (const entry of await readdir(dir)) await rm(path.join(dir, entry), { force: true });
  }
  alice = await signUp(context.app, 'alice@example.com');
  bob = await signUp(context.app, 'bob@example.com');
});

afterAll(async () => {
  await context.close();
});

const filesIn = async (area: string) => readdir(path.join(context.storageDir, area));

describe('tus uploads', () => {
  it('completes a chunked upload and records it', async () => {
    const uploadId = await tusUpload(context, alice.accessToken, 'tiny.onnx', tinyCnnOnnx(), 1000);
    const head = await fetch(`${context.baseUrl}/api/uploads/${uploadId}`, {
      method: 'HEAD',
      headers: { 'tus-resumable': '1.0.0', ...bearer(alice.accessToken) },
    });
    expect(head.status).toBe(200);
    expect(head.headers.get('upload-offset')).toBe(String(tinyCnnOnnx().length));
  });

  it("hides other people's uploads", async () => {
    const uploadId = await tusUpload(context, alice.accessToken, 'tiny.onnx', tinyCnnOnnx());
    const head = await fetch(`${context.baseUrl}/api/uploads/${uploadId}`, {
      method: 'HEAD',
      headers: { 'tus-resumable': '1.0.0', ...bearer(bob.accessToken) },
    });
    expect(head.status).toBe(404);
  });

  it('requires authentication', async () => {
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/uploads',
      headers: { 'tus-resumable': '1.0.0', 'upload-length': '10' },
    });
    expect(response.statusCode).toBe(401);
  });

  async function createUpload(filename: string, length: number) {
    return context.app.inject({
      method: 'POST',
      url: '/api/uploads',
      headers: {
        'tus-resumable': '1.0.0',
        ...bearer(alice.accessToken),
        'upload-length': String(length),
        'upload-metadata': `filename ${Buffer.from(filename).toString('base64')}`,
      },
    });
  }

  it('rejects files over the per-format limit', async () => {
    const response = await createUpload('huge.onnx', 200_001);
    expect(response.statusCode).toBe(413);
    expect(JSON.parse(response.body).error.code).toBe('file_too_large');
  });

  it('rejects pickle files with a conversion hint', async () => {
    const response = await createUpload('model.pt', 100);
    expect(response.statusCode).toBe(415);
    expect(JSON.parse(response.body).error).toMatchObject({
      code: 'unsupported_format',
      details: { hint: 'convert' },
    });
  });
});

describe('creating and processing repositories', () => {
  it('publishes a version with blob, sidecar and README', async () => {
    const repo = await createRepository(
      context,
      alice.accessToken,
      'tiny-cnn.onnx',
      tinyCnnOnnx(),
      {
        readme: '# Tiny CNN\n\nHello',
        description: 'A tiny test network',
      },
    );
    expect(repo.status).toBe('ready');
    const detail = await context.app.inject({
      method: 'GET',
      url: `/api/models/${repo.id}`,
      headers: bearer(alice.accessToken),
    });
    expect(detail.json()).toMatchObject({
      name: 'tiny-cnn',
      description: 'A tiny test network',
      format: 'onnx',
      hasReadme: true,
      myAccess: { role: 'owner', canDownload: true },
      currentVersion: { number: 1, status: 'ready' },
    });
    expect(detail.json().currentVersion.summary.nodeCount).toBe(9);
    expect(detail.json().strip.length).toBeGreaterThan(0);
    expect(await filesIn('blobs')).toHaveLength(1);
    expect((await filesIn('parsed')).length).toBe(2);
    expect(await filesIn('uploads')).toHaveLength(0);

    const readme = await context.app.inject({
      method: 'GET',
      url: `/api/models/${repo.id}/readme`,
      headers: bearer(alice.accessToken),
    });
    expect(readme.json().markdown).toBe('# Tiny CNN\n\nHello');
  });

  it('serves the parsed graph gzipped with revalidation', async () => {
    const repo = await createRepository(context, alice.accessToken, 'tiny-cnn.onnx', tinyCnnOnnx());
    const graph = await context.app.inject({
      method: 'GET',
      url: `/api/models/${repo.id}/graph`,
      headers: bearer(alice.accessToken),
    });
    expect(graph.statusCode).toBe(200);
    expect(graph.headers['content-encoding']).toBe('gzip');
    const parsed = JSON.parse(gunzipSync(graph.rawPayload).toString('utf8'));
    expect(parsed.payload.kind).toBe('onnx-graph');
    const again = await context.app.inject({
      method: 'GET',
      url: `/api/models/${repo.id}/graph`,
      headers: { ...bearer(alice.accessToken), 'if-none-match': String(graph.headers.etag) },
    });
    expect(again.statusCode).toBe(304);
  });

  it('re-parses when a sidecar is missing', async () => {
    const repo = await createRepository(context, alice.accessToken, 'tiny-cnn.onnx', tinyCnnOnnx());
    for (const entry of await filesIn('parsed'))
      await rm(path.join(context.storageDir, 'parsed', entry));
    const first = await context.app.inject({
      method: 'GET',
      url: `/api/models/${repo.id}/graph`,
      headers: bearer(alice.accessToken),
    });
    expect(first.statusCode).toBe(409);
    await context.app.processing.idle();
    const second = await context.app.inject({
      method: 'GET',
      url: `/api/models/${repo.id}/graph`,
      headers: bearer(alice.accessToken),
    });
    expect(second.statusCode).toBe(200);
  });

  it('stores identical bytes once', async () => {
    await createRepository(
      context,
      alice.accessToken,
      'a.safetensors',
      safetensorsBuffer(NESTED_SAFETENSORS),
    );
    await createRepository(
      context,
      bob.accessToken,
      'b.safetensors',
      safetensorsBuffer(NESTED_SAFETENSORS),
    );
    expect(await filesIn('blobs')).toHaveLength(1);
  });

  it('marks broken files as failed and leaves no files behind', async () => {
    const bytes = Buffer.concat([
      Buffer.from([0x08, 0x09]),
      Buffer.from('not really protobuf after the first tag'),
    ]);
    const repo = await createRepository(context, alice.accessToken, 'broken.onnx', bytes);
    expect(repo.status).toBe('failed');
    const detail = await context.app.inject({
      method: 'GET',
      url: `/api/models/${repo.id}`,
      headers: bearer(alice.accessToken),
    });
    expect(detail.json().latestVersion.failureReason).toMatch(/bad_protobuf|truncated/);
    expect(await filesIn('uploads')).toHaveLength(0);
    expect(await filesIn('blobs')).toHaveLength(0);
  });

  it('refuses to reuse an upload or someone else’s upload', async () => {
    const uploadId = await tusUpload(context, alice.accessToken, 'tiny.onnx', tinyCnnOnnx());
    const asBob = await context.app.inject({
      method: 'POST',
      url: '/api/models',
      headers: bearer(bob.accessToken),
      payload: { uploadId, name: 'stolen' },
    });
    expect(asBob.statusCode).toBe(404);
    const first = await context.app.inject({
      method: 'POST',
      url: '/api/models',
      headers: bearer(alice.accessToken),
      payload: { uploadId, name: 'one' },
    });
    expect(first.statusCode).toBe(202);
    const second = await context.app.inject({
      method: 'POST',
      url: '/api/models',
      headers: bearer(alice.accessToken),
      payload: { uploadId, name: 'two' },
    });
    expect(second.statusCode).toBe(409);
    await context.app.processing.idle();
  });
});

describe('access and editing', () => {
  it('hides private repositories from others', async () => {
    const repo = await createRepository(context, alice.accessToken, 'tiny-cnn.onnx', tinyCnnOnnx());
    for (const url of [
      `/api/models/${repo.id}`,
      `/api/models/${repo.id}/graph`,
      `/api/models/${repo.id}/readme`,
    ]) {
      expect(
        (await context.app.inject({ method: 'GET', url, headers: bearer(bob.accessToken) }))
          .statusCode,
      ).toBe(404);
      expect((await context.app.inject({ method: 'GET', url })).statusCode).toBe(404);
    }
  });

  it('lets anyone view public repositories', async () => {
    const repo = await createRepository(
      context,
      alice.accessToken,
      'tiny-cnn.onnx',
      tinyCnnOnnx(),
      { visibility: 'public' },
    );
    const anonymous = await context.app.inject({ method: 'GET', url: `/api/models/${repo.id}` });
    expect(anonymous.statusCode).toBe(200);
    expect(anonymous.json().myAccess).toEqual({ role: 'viewer', canDownload: true, via: 'public' });
  });

  it('updates metadata and protects README edits from overwrites', async () => {
    const repo = await createRepository(context, alice.accessToken, 'tiny-cnn.onnx', tinyCnnOnnx());
    const patch = await context.app.inject({
      method: 'PATCH',
      url: `/api/models/${repo.id}`,
      headers: bearer(alice.accessToken),
      payload: { name: 'renamed', license: 'Apache-2.0' },
    });
    expect(patch.json()).toMatchObject({ name: 'renamed', license: 'apache-2.0' });

    const first = await context.app.inject({
      method: 'PUT',
      url: `/api/models/${repo.id}/readme`,
      headers: bearer(alice.accessToken),
      payload: { markdown: '# v1', baseUpdatedAt: null },
    });
    expect(first.statusCode).toBe(200);
    const stale = await context.app.inject({
      method: 'PUT',
      url: `/api/models/${repo.id}/readme`,
      headers: bearer(alice.accessToken),
      payload: { markdown: '# overwritten', baseUpdatedAt: null },
    });
    expect(stale.statusCode).toBe(409);
    const fresh = await context.app.inject({
      method: 'PUT',
      url: `/api/models/${repo.id}/readme`,
      headers: bearer(alice.accessToken),
      payload: { markdown: '# v2', baseUpdatedAt: first.json().updatedAt },
    });
    expect(fresh.statusCode).toBe(200);
  });
});

describe('downloads', () => {
  it('streams the original file with ranges through a short-lived ticket', async () => {
    const bytes = tinyCnnOnnx();
    const repo = await createRepository(context, alice.accessToken, 'tiny-cnn.onnx', bytes);
    const ticket = await context.app.inject({
      method: 'POST',
      url: `/api/models/${repo.id}/file-ticket`,
      headers: bearer(alice.accessToken),
      payload: {},
    });
    const { url } = ticket.json<{ url: string }>();
    const full = await context.app.inject({ method: 'GET', url });
    expect(full.statusCode).toBe(200);
    expect(createHash('sha256').update(full.rawPayload).digest('hex')).toBe(
      createHash('sha256').update(bytes).digest('hex'),
    );
    expect(full.headers['content-disposition']).toContain('tiny-cnn.onnx');

    const partial = await context.app.inject({
      method: 'GET',
      url,
      headers: { range: 'bytes=100-199' },
    });
    expect(partial.statusCode).toBe(206);
    expect(partial.rawPayload.length).toBe(100);

    clock.advance(61_000);
    expect((await context.app.inject({ method: 'GET', url })).statusCode).toBe(401);
  });

  it('refuses tickets for another model', async () => {
    const one = await createRepository(context, alice.accessToken, 'tiny-cnn.onnx', tinyCnnOnnx());
    const two = await createRepository(
      context,
      alice.accessToken,
      'nested.safetensors',
      safetensorsBuffer(NESTED_SAFETENSORS),
    );
    const ticket = await context.app.inject({
      method: 'POST',
      url: `/api/models/${one.id}/file-ticket`,
      headers: bearer(alice.accessToken),
      payload: {},
    });
    const token = new URL(ticket.json<{ url: string }>().url, 'http://x').searchParams.get(
      'ticket',
    );
    expect(
      (
        await context.app.inject({
          method: 'GET',
          url: `/api/models/${two.id}/file?ticket=${token ?? ''}`,
        })
      ).statusCode,
    ).toBe(404);
  });

  it('respects the public view-only setting', async () => {
    const repo = await createRepository(
      context,
      alice.accessToken,
      'tiny-cnn.onnx',
      tinyCnnOnnx(),
      {
        visibility: 'public',
        publicAllowDownload: false,
      },
    );
    const ticket = await context.app.inject({
      method: 'POST',
      url: `/api/models/${repo.id}/file-ticket`,
      payload: {},
    });
    expect(ticket.statusCode).toBe(403);
    expect(ticket.json().error.code).toBe('download_not_allowed');
  });
});

describe('deleting repositories', () => {
  it('removes rows and files, but keeps blobs other repositories still use', async () => {
    const mine = await createRepository(
      context,
      alice.accessToken,
      'a.safetensors',
      safetensorsBuffer(NESTED_SAFETENSORS),
    );
    const theirs = await createRepository(
      context,
      bob.accessToken,
      'b.safetensors',
      safetensorsBuffer(NESTED_SAFETENSORS),
    );
    expect(
      (
        await context.app.inject({
          method: 'DELETE',
          url: `/api/models/${mine.id}`,
          headers: bearer(bob.accessToken),
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await context.app.inject({
          method: 'DELETE',
          url: `/api/models/${mine.id}`,
          headers: bearer(alice.accessToken),
        })
      ).statusCode,
    ).toBe(204);
    expect(await filesIn('blobs')).toHaveLength(1);
    expect(
      (
        await context.app.inject({
          method: 'DELETE',
          url: `/api/models/${theirs.id}`,
          headers: bearer(bob.accessToken),
        })
      ).statusCode,
    ).toBe(204);
    expect(await filesIn('blobs')).toHaveLength(0);
    expect(await filesIn('parsed')).toHaveLength(0);
  });
});

describe('listing', () => {
  it('lists my repositories newest first with pagination', async () => {
    const first = await createRepository(context, alice.accessToken, 'one.onnx', tinyCnnOnnx());
    clock.advance(1000);
    const second = await createRepository(
      context,
      alice.accessToken,
      'two.safetensors',
      safetensorsBuffer(NESTED_SAFETENSORS),
    );
    const page1 = await context.app.inject({
      method: 'GET',
      url: '/api/models?limit=1',
      headers: bearer(alice.accessToken),
    });
    expect(page1.json<{ items: { id: string }[] }>().items.map((item) => item.id)).toEqual([
      second.id,
    ]);
    const page2 = await context.app.inject({
      method: 'GET',
      url: `/api/models?limit=1&cursor=${String(page1.json().nextCursor)}`,
      headers: bearer(alice.accessToken),
    });
    expect(page2.json<{ items: { id: string }[] }>().items.map((item) => item.id)).toEqual([
      first.id,
    ]);
    expect(page2.json().nextCursor).toBeNull();
  });
});

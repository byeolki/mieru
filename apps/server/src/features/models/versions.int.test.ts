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
  signUp,
  truncateAllTables,
  tusUpload,
  type SignedUpUser,
  type TestContext,
} from '../../../test/helpers.js';

let context: TestContext;
let owner: SignedUpUser;
let visitor: SignedUpUser;
let modelId: string;

beforeAll(async () => {
  context = await createTestContext();
});

beforeEach(async () => {
  await truncateAllTables(context.db);
  owner = await signUp(context.app, 'owner@example.com');
  visitor = await signUp(context.app, 'visitor@example.com');
  ({ id: modelId } = await createRepository(
    context,
    owner.accessToken,
    'tiny-cnn.onnx',
    tinyCnnOnnx(),
    {
      visibility: 'public',
    },
  ));
});

afterAll(async () => {
  await context.close();
});

async function pushVersion(bytes: Buffer, filename = 'tiny-cnn.onnx', note?: string) {
  const uploadId = await tusUpload(context, owner.accessToken, filename, bytes, 1024, {
    targetModelId: modelId,
  });
  const response = await context.app.inject({
    method: 'POST',
    url: `/api/models/${modelId}/versions`,
    headers: bearer(owner.accessToken),
    payload: { uploadId, note },
  });
  await context.app.processing.idle();
  return response;
}

const listVersions = async () =>
  (await context.app.inject({ url: `/api/models/${modelId}/versions` })).json<{
    items: { number: number; status: string; isCurrent: boolean; note: string | null }[];
  }>().items;

describe('versions', () => {
  it('adds a version that becomes current while v1 stays reachable', async () => {
    const response = await pushVersion(
      tinyCnnOnnx({ perturb: 'fc.bias' }),
      'tiny-cnn.onnx',
      '편향 다시 학습',
    );
    expect(response.statusCode).toBe(202);
    expect(await listVersions()).toEqual([
      expect.objectContaining({
        number: 2,
        status: 'ready',
        isCurrent: true,
        note: '편향 다시 학습',
      }),
      expect.objectContaining({ number: 1, status: 'ready', isCurrent: false }),
    ]);
    const v1 = await context.app.inject({ url: `/api/models/${modelId}/graph?version=1` });
    const v2 = await context.app.inject({ url: `/api/models/${modelId}/graph` });
    expect(v1.statusCode).toBe(200);
    expect(v1.headers.etag).not.toBe(v2.headers.etag);
  });

  it('rejects a file of another format', async () => {
    const response = await pushVersion(safetensorsBuffer(NESTED_SAFETENSORS), 'nested.safetensors');
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('format_mismatch');
  });

  it('only accepts uploads made for this repository', async () => {
    const uploadId = await tusUpload(context, owner.accessToken, 'tiny-cnn.onnx', tinyCnnOnnx());
    const response = await context.app.inject({
      method: 'POST',
      url: `/api/models/${modelId}/versions`,
      headers: bearer(owner.accessToken),
      payload: { uploadId },
    });
    expect(response.statusCode).toBe(404);
  });

  it('keeps a consumed upload from being terminated while it is processed', async () => {
    const uploadId = await tusUpload(
      context,
      owner.accessToken,
      'tiny-cnn.onnx',
      tinyCnnOnnx(),
      1024,
      {
        targetModelId: modelId,
      },
    );
    await context.app.inject({
      method: 'POST',
      url: `/api/models/${modelId}/versions`,
      headers: bearer(owner.accessToken),
      payload: { uploadId },
    });
    const terminate = await fetch(`${context.baseUrl}/api/uploads/${uploadId}`, {
      method: 'DELETE',
      headers: { 'tus-resumable': '1.0.0', authorization: `Bearer ${owner.accessToken}` },
    });
    expect(terminate.status).toBe(409);
    await context.app.processing.idle();
    expect((await listVersions())[0]).toMatchObject({ number: 2, status: 'ready' });
  });

  it('refuses version uploads from people who cannot edit', async () => {
    await expect(
      tusUpload(context, visitor.accessToken, 'tiny-cnn.onnx', tinyCnnOnnx(), 1024, {
        targetModelId: modelId,
      }),
    ).rejects.toThrow(/403/);
  });

  it('diffs two versions down to the retrained layer', async () => {
    await pushVersion(tinyCnnOnnx({ perturb: 'branch_a.weight' }));
    const response = await context.app.inject({ url: `/api/models/${modelId}/diff?from=1&to=2` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      from: 1,
      to: 2,
      nodes: [{ name: '/block/branch_a/Conv', status: 'changed', changes: ['weights'] }],
      tensors: [{ name: 'branch_a.weight', status: 'changed' }],
    });
  });

  it('deleting the current version promotes the previous one, and the last one stays', async () => {
    await pushVersion(tinyCnnOnnx({ perturb: 'fc.bias' }));
    const remove = (number: number) =>
      context.app.inject({
        method: 'DELETE',
        url: `/api/models/${modelId}/versions/${String(number)}`,
        headers: bearer(owner.accessToken),
      });
    expect((await remove(2)).statusCode).toBe(204);
    expect(await listVersions()).toEqual([expect.objectContaining({ number: 1, isCurrent: true })]);
    const last = await remove(1);
    expect(last.statusCode).toBe(409);
    expect(last.json().error.code).toBe('last_version');
  });
});

describe('repository size limit', () => {
  let small: TestContext;

  beforeAll(async () => {
    small = await createTestContext({
      env: { MAX_REPO_BYTES: String(tinyCnnOnnx().length + 100) },
    });
  });

  afterAll(async () => {
    await small.close();
  });

  it('rejects a version upload that would exceed the limit before any bytes are sent', async () => {
    await truncateAllTables(small.db);
    const user = await signUp(small.app, 'limit@example.com');
    const { id } = await createRepository(small, user.accessToken, 'tiny-cnn.onnx', tinyCnnOnnx());
    await expect(
      tusUpload(
        small,
        user.accessToken,
        'tiny-cnn.onnx',
        tinyCnnOnnx({ perturb: 'fc.bias' }),
        1024,
        {
          targetModelId: id,
        },
      ),
    ).rejects.toThrow(/413/);
  });
});

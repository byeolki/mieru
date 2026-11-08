import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { tinyCnnOnnx } from '../../../test/fixtures/builders.js';
import {
  bearer,
  createRepository,
  createTestContext,
  signUp,
  truncateAllTables,
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

const putLabels = (token: string, labels: string[]) =>
  context.app.inject({
    method: 'PUT',
    url: `/api/models/${modelId}/labels`,
    headers: bearer(token),
    payload: { labels },
  });

const getLabels = (token?: string) =>
  context.app.inject({
    url: `/api/models/${modelId}/labels`,
    headers: token ? bearer(token) : {},
  });

const blobFiles = async () => readdir(path.join(context.storageDir, 'blobs'));

describe('model labels', () => {
  it('starts empty, then serves what an editor saved to any viewer', async () => {
    expect((await getLabels()).json()).toEqual({ labels: [] });
    const saved = await putLabels(owner.accessToken, ['고양이', '강아지', ' 새 ']);
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toEqual({ labels: ['고양이', '강아지', '새'] });
    expect((await getLabels()).json()).toEqual({ labels: ['고양이', '강아지', '새'] });
  });

  it('forbids viewers from changing labels', async () => {
    expect((await putLabels(visitor.accessToken, ['x'])).statusCode).toBe(403);
  });

  it('replaces the file and releases the old blob; an empty list removes labels', async () => {
    const before = (await blobFiles()).length;
    await putLabels(owner.accessToken, ['a']);
    expect(await blobFiles()).toHaveLength(before + 1);
    await putLabels(owner.accessToken, ['b']);
    expect(await blobFiles()).toHaveLength(before + 1);
    await putLabels(owner.accessToken, []);
    expect(await blobFiles()).toHaveLength(before);
    expect((await getLabels()).json()).toEqual({ labels: [] });
  });

  it('lets a download-capable viewer fetch the labels file through a ticket', async () => {
    await putLabels(owner.accessToken, ['a', 'b']);
    const ticket = await context.app.inject({
      method: 'POST',
      url: `/api/models/${modelId}/file-ticket`,
      headers: bearer(visitor.accessToken),
      payload: { kind: 'labels' },
    });
    expect(ticket.statusCode).toBe(200);
    const file = await context.app.inject({ url: ticket.json<{ url: string }>().url });
    expect(JSON.parse(file.body)).toEqual(['a', 'b']);
  });
});

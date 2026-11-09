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
import { BufferByteSource } from '../../parsing/byte-source.js';
import { parseFromSource } from '../../parsing/parse.js';

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
      publicAllowDownload: false,
    },
  ));
});

afterAll(async () => {
  await context.close();
});

/** Values of a tensor read straight from the fixture bytes, as the reference. */
async function referenceValues(name: string): Promise<number[]> {
  const bytes = tinyCnnOnnx();
  const { tensorIndex } = await parseFromSource(new BufferByteSource(bytes), 'onnx');
  const entry = tensorIndex.find((candidate) => candidate.name === name);
  if (!entry) throw new Error(`no ${name}`);
  return Array.from({ length: entry.length / 4 }, (_, index) =>
    bytes.readFloatLE(entry.offset + index * 4),
  );
}

const get = (path: string, token?: string) =>
  context.app.inject({ url: `/api/models/${modelId}${path}`, headers: token ? bearer(token) : {} });

describe('weights', () => {
  it('lists the weight tensors with shapes and sizes', async () => {
    const response = await get('/tensors');
    expect(response.statusCode).toBe(200);
    expect(response.json().items).toContainEqual({
      name: 'conv1.weight',
      dtype: 'float32',
      shape: [4, 3, 3, 3],
      params: 108,
      bytes: 432,
    });
  });

  it('summarizes a tensor exactly like the raw bytes', async () => {
    const values = await referenceValues('conv1.weight');
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const response = await get('/tensors/stats?name=conv1.weight');
    expect(response.statusCode).toBe(200);
    const stats = response.json();
    expect(stats.count).toBe(108);
    expect(stats.min).toBeCloseTo(Math.min(...values), 6);
    expect(stats.max).toBeCloseTo(Math.max(...values), 6);
    expect(stats.mean).toBeCloseTo(mean, 6);
    expect(stats.sampled).toBe(false);
    expect(stats.histogram.counts.reduce((sum: number, count: number) => sum + count, 0)).toBe(108);
  });

  it('returns RGB filters for 3-channel kernels and gray ones otherwise', async () => {
    const rgb = await get('/tensors/filters?name=conv1.weight', owner.accessToken);
    expect(rgb.json()).toMatchObject({
      mode: 'rgb',
      outChannels: 4,
      kernelHeight: 3,
      kernelWidth: 3,
    });
    expect(rgb.json().filters).toHaveLength(4);
    expect(rgb.json().filters[0]).toHaveLength(27);
    const gray = await get('/tensors/filters?name=branch_a.weight', owner.accessToken);
    expect(gray.json()).toMatchObject({ mode: 'gray', outChannels: 4 });
    expect(gray.json().filters[0]).toHaveLength(9);
  });

  it('shows histograms to any viewer but filters only to people who may download', async () => {
    expect((await get('/tensors/stats?name=conv1.weight', visitor.accessToken)).statusCode).toBe(
      200,
    );
    expect((await get('/tensors/filters?name=conv1.weight', visitor.accessToken)).statusCode).toBe(
      403,
    );
  });

  it('rejects unknown tensors and non-convolution filters', async () => {
    expect((await get('/tensors/stats?name=nope')).statusCode).toBe(404);
    const fc = await get('/tensors/filters?name=fc.weight', owner.accessToken);
    expect(fc.statusCode).toBe(422);
  });
});

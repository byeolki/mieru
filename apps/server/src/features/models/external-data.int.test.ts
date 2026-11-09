import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  EXTERNAL_DATA_NAME,
  externalDataOnnx,
  realWorldQuirksOnnx,
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

beforeAll(async () => {
  context = await createTestContext();
});

beforeEach(async () => {
  await truncateAllTables(context.db);
  owner = await signUp(context.app, 'owner@example.com');
});

afterAll(async () => {
  await context.close();
});

const DATA_ROLE = { role: 'external_data' };

/** Uploads the model and the given data files, creates a repository and waits for processing. */
async function createWithData(dataFiles: { name: string; bytes: Buffer }[]) {
  const { model } = externalDataOnnx();
  const uploadId = await tusUpload(context, owner.accessToken, 'external.onnx', model);
  const dataUploadIds: string[] = [];
  for (const file of dataFiles) {
    dataUploadIds.push(
      await tusUpload(context, owner.accessToken, file.name, file.bytes, 1024, DATA_ROLE),
    );
  }
  const response = await context.app.inject({
    method: 'POST',
    url: '/api/models',
    headers: bearer(owner.accessToken),
    payload: { uploadId, dataUploadIds, name: 'external' },
  });
  expect(response.statusCode).toBe(202);
  await context.app.processing.idle();
  const modelId = response.json<{ id: string }>().id;
  const detail = await context.app.inject({
    url: `/api/models/${modelId}`,
    headers: bearer(owner.accessToken),
  });
  return { modelId, detail: detail.json<Record<string, unknown>>() };
}

describe('external data', () => {
  it('publishes a model with its data file and reads weights from it', async () => {
    const { data } = externalDataOnnx();
    const { modelId, detail } = await createWithData([{ name: EXTERNAL_DATA_NAME, bytes: data }]);
    expect(detail.status).toBe('ready');
    expect(detail.sizeBytes).toBe(externalDataOnnx().model.length + data.length);

    const stats = await context.app.inject({
      url: `/api/models/${modelId}/tensors/stats?name=w2`,
      headers: bearer(owner.accessToken),
    });
    expect(stats.statusCode).toBe(200);
    const expected = [0, 1, 2, 3].map((index) => data.readFloatLE(16 + index * 4));
    expect(stats.json<{ min: number }>().min).toBeCloseTo(Math.min(...expected), 5);

    const ticket = await context.app.inject({
      method: 'POST',
      url: `/api/models/${modelId}/file-ticket`,
      headers: bearer(owner.accessToken),
      payload: {},
    });
    const files = ticket.json<{
      externalData: { name: string; url: string; sizeBytes: number }[];
    }>().externalData;
    expect(files).toEqual([
      expect.objectContaining({ name: EXTERNAL_DATA_NAME, sizeBytes: data.length }),
    ]);
    const download = await context.app.inject({ url: files[0]?.url ?? '' });
    expect(download.statusCode).toBe(200);
    expect(download.rawPayload.equals(data)).toBe(true);
  });

  it('fails the version and names the file when a data file is missing', async () => {
    const { detail } = await createWithData([]);
    expect(detail.status).toBe('failed');
    const versions = await context.app.inject({
      url: `/api/models/${String(detail.id)}/versions`,
      headers: bearer(owner.accessToken),
    });
    expect(versions.json<{ items: Record<string, unknown>[] }>().items[0]).toMatchObject({
      failureReason: 'external_data_missing',
      failureDetail: EXTERNAL_DATA_NAME,
    });
  });

  it('fails when the data file is shorter than its tensors need', async () => {
    const { data } = externalDataOnnx();
    const { detail } = await createWithData([
      { name: EXTERNAL_DATA_NAME, bytes: data.subarray(0, 20) },
    ]);
    expect(detail.status).toBe('failed');
  });

  it('accepts data files with any extension but keeps model uploads to .onnx/.safetensors', async () => {
    await expect(
      tusUpload(context, owner.accessToken, 'weights.bin', Buffer.alloc(8), 1024, DATA_ROLE),
    ).resolves.toBeTruthy();
    await expect(
      tusUpload(context, owner.accessToken, 'weights.bin', Buffer.alloc(8)),
    ).rejects.toThrow(/415/);
  });

  it('rejects data uploads used as the model file', async () => {
    const dataUpload = await tusUpload(
      context,
      owner.accessToken,
      'model.onnx',
      externalDataOnnx().model,
      1024,
      DATA_ROLE,
    );
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/models',
      headers: bearer(owner.accessToken),
      payload: { uploadId: dataUpload, name: 'nope' },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('real-world ONNX quirks', () => {
  it('publishes a model with INT64_MAX attributes, subgraphs and varint tensors', async () => {
    const { id, status } = await createRepository(
      context,
      owner.accessToken,
      'quirks.onnx',
      realWorldQuirksOnnx(),
    );
    expect(status).toBe('ready');
    const stats = await context.app.inject({
      url: `/api/models/${id}/tensors/stats?name=q`,
      headers: bearer(owner.accessToken),
    });
    expect(stats.statusCode).toBe(200);
    expect(stats.json<{ min: number; max: number }>()).toMatchObject({ min: -3, max: 4 });
  });
});

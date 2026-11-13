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

const detail = async (id: string, token = owner.accessToken) =>
  (await context.app.inject({ url: `/api/models/${id}`, headers: bearer(token) })).json<{
    slug: string;
  }>();

const resolve = (owner: string, slug: string, token?: string) =>
  context.app.inject({
    url: `/api/models/resolve?owner=${owner}&slug=${slug}`,
    headers: token ? bearer(token) : {},
  });

describe('readable repository URLs', () => {
  it('derives the slug from the name and suffixes repeats under one owner', async () => {
    const first = await createRepository(
      context,
      owner.accessToken,
      'My Model.onnx',
      tinyCnnOnnx(),
    );
    const second = await createRepository(
      context,
      owner.accessToken,
      'My Model.onnx',
      tinyCnnOnnx(),
    );
    expect((await detail(first.id)).slug).toBe('my-model');
    expect((await detail(second.id)).slug).toBe('my-model-2');
  });

  it('resolves owner and slug to the id, case-insensitively', async () => {
    const { id } = await createRepository(
      context,
      owner.accessToken,
      'tiny-cnn.onnx',
      tinyCnnOnnx(),
      {
        visibility: 'public',
      },
    );
    const response = await resolve(owner.username.toUpperCase(), 'TINY-CNN');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id });
  });

  it('answers 404 for private repositories to everyone but people with access', async () => {
    await createRepository(context, owner.accessToken, 'secret.onnx', tinyCnnOnnx());
    const stranger = await signUp(context.app, 'stranger@example.com');
    expect((await resolve(owner.username, 'secret')).statusCode).toBe(404);
    expect((await resolve(owner.username, 'secret', stranger.accessToken)).statusCode).toBe(404);
    expect((await resolve(owner.username, 'secret', owner.accessToken)).statusCode).toBe(200);
    expect((await resolve(owner.username, 'missing', owner.accessToken)).statusCode).toBe(404);
  });

  it('moves the slug along when the repository is renamed', async () => {
    const { id } = await createRepository(
      context,
      owner.accessToken,
      'old-name.onnx',
      tinyCnnOnnx(),
    );
    const renamed = await context.app.inject({
      method: 'PATCH',
      url: `/api/models/${id}`,
      headers: bearer(owner.accessToken),
      payload: { name: 'New Name' },
    });
    expect(renamed.statusCode).toBe(200);
    expect((await detail(id)).slug).toBe('new-name');
  });

  it('keeps top-level page names out of usernames', async () => {
    const response = await context.app.inject({
      method: 'PATCH',
      url: '/api/me',
      headers: bearer(owner.accessToken),
      payload: { username: 'designs' },
    });
    expect(response.statusCode).toBe(400);
  });
});

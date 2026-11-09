import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  bearer,
  createTestContext,
  signUp,
  truncateAllTables,
  type SignedUpUser,
  type TestContext,
} from '../../../test/helpers.js';

let context: TestContext;
let owner: SignedUpUser;
let other: SignedUpUser;

const spec = {
  input: { shape: [1, 784] },
  layers: [
    { id: 'a', type: 'linear', inFeatures: 784, outFeatures: 128 },
    { id: 'b', type: 'relu' },
    { id: 'c', type: 'linear', inFeatures: 128, outFeatures: 10 },
  ],
};

beforeAll(async () => {
  context = await createTestContext();
});

beforeEach(async () => {
  await truncateAllTables(context.db);
  owner = await signUp(context.app, 'owner@example.com');
  other = await signUp(context.app, 'other@example.com');
});

afterAll(async () => {
  await context.close();
});

const create = (body: Record<string, unknown>) =>
  context.app.inject({
    method: 'POST',
    url: '/api/designs',
    headers: bearer(owner.accessToken),
    payload: body,
  });

describe('designs', () => {
  it('saves, lists, updates and deletes a design for its owner', async () => {
    const created = await create({ name: 'MNIST MLP', spec });
    expect(created.statusCode).toBe(201);
    const { id } = created.json<{ id: string }>();
    expect(created.json()).toMatchObject({
      name: 'MNIST MLP',
      visibility: 'private',
      canEdit: true,
      spec,
    });

    const list = await context.app.inject({
      url: '/api/designs',
      headers: bearer(owner.accessToken),
    });
    expect(list.json().items).toEqual([expect.objectContaining({ id, layerCount: 3 })]);

    const updated = await context.app.inject({
      method: 'PUT',
      url: `/api/designs/${id}`,
      headers: bearer(owner.accessToken),
      payload: {
        name: 'MNIST MLP v2',
        spec: { ...spec, layers: spec.layers.slice(0, 2) },
        visibility: 'public',
      },
    });
    expect(updated.json()).toMatchObject({ name: 'MNIST MLP v2', visibility: 'public' });

    const removed = await context.app.inject({
      method: 'DELETE',
      url: `/api/designs/${id}`,
      headers: bearer(owner.accessToken),
    });
    expect(removed.statusCode).toBe(204);
  });

  it('keeps private designs hidden and public ones read-only for others', async () => {
    const { id } = (await create({ name: 'secret', spec })).json<{ id: string }>();
    expect((await context.app.inject({ url: `/api/designs/${id}` })).statusCode).toBe(404);
    await context.app.inject({
      method: 'PUT',
      url: `/api/designs/${id}`,
      headers: bearer(owner.accessToken),
      payload: { name: 'shared', spec, visibility: 'public' },
    });
    const view = await context.app.inject({
      url: `/api/designs/${id}`,
      headers: bearer(other.accessToken),
    });
    expect(view.json()).toMatchObject({ name: 'shared', canEdit: false });
    const edit = await context.app.inject({
      method: 'PUT',
      url: `/api/designs/${id}`,
      headers: bearer(other.accessToken),
      payload: { name: 'hijack', spec },
    });
    expect(edit.statusCode).toBe(404);
  });

  it('rejects specs with unknown layers or impossible values', async () => {
    const unknown = await create({
      name: 'x',
      spec: { ...spec, layers: [{ id: 'a', type: 'lstm' }] },
    });
    expect(unknown.statusCode).toBe(400);
    const zero = await create({
      name: 'x',
      spec: { ...spec, layers: [{ id: 'a', type: 'linear', inFeatures: 0, outFeatures: 1 }] },
    });
    expect(zero.statusCode).toBe(400);
  });

  it('disappears with its owner account', async () => {
    await create({ name: 'gone soon', spec });
    await context.app.inject({
      method: 'DELETE',
      url: '/api/me',
      headers: { ...bearer(owner.accessToken), 'content-type': 'application/json' },
      payload: { password: owner.password, confirmUsername: owner.username },
    });
    const [rows] = await context.db.query('SELECT COUNT(*) AS count FROM designs');
    expect(rows).toEqual([{ count: 0 }]);
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  NESTED_SAFETENSORS,
  safetensorsBuffer,
  tinyCnnOnnx,
  tinyMlpOnnx,
} from '../../../test/fixtures/builders.js';
import {
  bearer,
  createRepository,
  createTestContext,
  fakeClock,
  signUp,
  truncateAllTables,
  type SignedUpUser,
  type TestContext,
} from '../../../test/helpers.js';
import { execute, selectRows } from '../../db/query.js';
import { refreshTrending } from './trending.js';

const clock = fakeClock(new Date('2026-11-08T00:00:00Z'));
let context: TestContext;
let owner: SignedUpUser;
let fans: SignedUpUser[];

beforeAll(async () => {
  context = await createTestContext({ clock: clock.now });
});

beforeEach(async () => {
  await truncateAllTables(context.db);
  owner = await signUp(context.app, 'owner@example.com');
  fans = await Promise.all(
    ['a', 'b', 'c'].map((name) => signUp(context.app, `fan-${name}@example.com`)),
  );
});

afterAll(async () => {
  await context.close();
});

const viewRows = async (modelId: string) =>
  selectRows(context.db, 'SELECT viewer_hash FROM model_view_days WHERE model_id = ?', [modelId]);

describe('view counting', () => {
  it('counts each viewer once a day and never counts the owner', async () => {
    const { id } = await createRepository(
      context,
      owner.accessToken,
      'tiny-cnn.onnx',
      tinyCnnOnnx(),
      { visibility: 'public' },
    );
    await context.app.inject({
      method: 'GET',
      url: `/api/models/${id}`,
      headers: bearer(owner.accessToken),
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await viewRows(id)).toHaveLength(0);
    for (let index = 0; index < 2; index += 1) {
      await context.app.inject({
        method: 'GET',
        url: `/api/models/${id}`,
        headers: bearer(fans[0]?.accessToken ?? ''),
      });
    }
    await context.app.inject({ method: 'GET', url: `/api/models/${id}` });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await viewRows(id)).toHaveLength(2);
  });
});

describe('trending and explore', () => {
  it('ranks fresh multi-user activity first and falls back to most starred when quiet', async () => {
    const fresh = await createRepository(context, owner.accessToken, 'fresh.onnx', tinyCnnOnnx(), {
      visibility: 'public',
    });
    const old = await createRepository(context, owner.accessToken, 'old.onnx', tinyMlpOnnx(), {
      visibility: 'public',
    });
    const solo = await createRepository(
      context,
      owner.accessToken,
      'solo.safetensors',
      safetensorsBuffer(NESTED_SAFETENSORS),
      { visibility: 'public' },
    );
    const hoursAgo = (hours: number) => new Date(clock.now().getTime() - hours * 60 * 60 * 1000);
    for (const [index, fan] of fans.entries()) {
      await execute(
        context.db,
        'INSERT INTO stars (user_id, model_id, created_at) VALUES (?, ?, ?)',
        [fan.id, fresh.id, hoursAgo(20 + index)],
      );
      await execute(
        context.db,
        'INSERT INTO stars (user_id, model_id, created_at) VALUES (?, ?, ?)',
        [fan.id, old.id, hoursAgo(6 * 24)],
      );
    }
    await execute(
      context.db,
      'INSERT INTO stars (user_id, model_id, created_at) VALUES (?, ?, ?)',
      [fans[0]?.id ?? '', solo.id, hoursAgo(1)],
    );
    await execute(context.db, 'UPDATE models SET star_count = 5 WHERE id = ?', [old.id]);

    expect(await refreshTrending(context.db, clock.now())).toBe(2);
    const explore = await context.app.inject({ method: 'GET', url: '/api/explore' });
    // Two qualifying models is below the minimum, so the section falls back to most starred.
    expect(explore.json()).toMatchObject({ trendingIsFallback: true });
    expect(explore.json().mostStarred[0].id).toBe(old.id);

    const search = await context.app.inject({
      method: 'GET',
      url: '/api/explore/search?sort=trending',
    });
    expect(
      search
        .json()
        .items.map((item: { id: string }) => item.id)
        .slice(0, 2),
    ).toEqual([fresh.id, old.id]);
  });

  it('searches names and READMEs, including Korean, and filters', async () => {
    await createRepository(context, owner.accessToken, 'resnet.onnx', tinyCnnOnnx(), {
      visibility: 'public',
      readme: '# 레즈넷 분류기\n\n이미지 분류에 쓰는 합성곱 모델',
    });
    await createRepository(context, owner.accessToken, 'hidden.onnx', tinyMlpOnnx(), {
      visibility: 'private',
      readme: '레즈넷',
    });
    await createRepository(
      context,
      owner.accessToken,
      'locked.safetensors',
      safetensorsBuffer(NESTED_SAFETENSORS),
      {
        visibility: 'public',
        publicAllowDownload: false,
      },
    );
    const korean = await context.app.inject({
      method: 'GET',
      url: `/api/explore/search?q=${encodeURIComponent('레즈넷')}`,
    });
    expect(korean.json().items.map((item: { name: string }) => item.name)).toEqual(['resnet']);
    const downloadable = await context.app.inject({
      method: 'GET',
      url: '/api/explore/search?downloadable=true',
    });
    expect(downloadable.json().items.map((item: { name: string }) => item.name)).toEqual([
      'resnet',
    ]);
    const safetensorsOnly = await context.app.inject({
      method: 'GET',
      url: '/api/explore/search?format=safetensors',
    });
    expect(safetensorsOnly.json().items.map((item: { name: string }) => item.name)).toEqual([
      'locked',
    ]);
  });
});

describe('profiles', () => {
  it('show public repositories and starred ones only', async () => {
    const shown = await createRepository(context, owner.accessToken, 'shown.onnx', tinyCnnOnnx(), {
      visibility: 'public',
    });
    await createRepository(context, owner.accessToken, 'private.onnx', tinyMlpOnnx());
    await context.app.inject({
      method: 'PUT',
      url: `/api/models/${shown.id}/star`,
      headers: bearer(fans[0]?.accessToken ?? ''),
    });
    const profile = await context.app.inject({
      method: 'GET',
      url: `/api/users/${owner.username}`,
    });
    expect(profile.json()).toMatchObject({
      username: owner.username,
      publicModelCount: 1,
      starsReceived: 1,
    });
    const models = await context.app.inject({
      method: 'GET',
      url: `/api/users/${owner.username}/models`,
    });
    expect(models.json().items.map((item: { name: string }) => item.name)).toEqual(['shown']);
    const stars = await context.app.inject({
      method: 'GET',
      url: `/api/users/${fans[0]?.username ?? ''}/stars`,
    });
    expect(stars.json().items.map((item: { id: string }) => item.id)).toEqual([shown.id]);
    expect(
      (await context.app.inject({ method: 'GET', url: '/api/users/nobody-at-all' })).statusCode,
    ).toBe(404);
  });
});

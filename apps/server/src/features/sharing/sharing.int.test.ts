import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { tinyCnnOnnx } from '../../../test/fixtures/builders.js';
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
import { buildApp } from '../../app.js';
import { listModels } from '../models/service.js';
import { resolveModelAccess } from './access-service.js';
import { execute } from '../../db/query.js';

const clock = fakeClock();
let context: TestContext;
let owner: SignedUpUser;
let bob: SignedUpUser;
let carol: SignedUpUser;
let modelId: string;

beforeAll(async () => {
  context = await createTestContext({ clock: clock.now });
});

beforeEach(async () => {
  await truncateAllTables(context.db);
  owner = await signUp(context.app, 'owner@example.com');
  bob = await signUp(context.app, 'bob@example.com');
  carol = await signUp(context.app, 'carol@example.com');
  modelId = (await createRepository(context, owner.accessToken, 'tiny-cnn.onnx', tinyCnnOnnx())).id;
});

afterAll(async () => {
  await context.close();
});

const get = (url: string, headers: Record<string, string> = {}) =>
  context.app.inject({ method: 'GET', url, headers });
const setVisibility = (visibility: string) =>
  context.app.inject({
    method: 'PATCH',
    url: `/api/models/${modelId}`,
    headers: bearer(owner.accessToken),
    payload: { visibility },
  });
const share = (username: string, role: string, allowDownload = true) =>
  context.app.inject({
    method: 'PUT',
    url: `/api/models/${modelId}/shares/${username}`,
    headers: bearer(owner.accessToken),
    payload: { role, allowDownload },
  });
const createLink = async (payload: object) => {
  const response = await context.app.inject({
    method: 'POST',
    url: `/api/models/${modelId}/share-links`,
    headers: bearer(owner.accessToken),
    payload,
  });
  expect(response.statusCode).toBe(201);
  const link = response.json<{ id: string; url: string }>();
  return { ...link, token: link.url.split('/s/')[1] ?? '' };
};

describe('the model access gate', () => {
  it('answers 404 on every repository route for someone without access', async () => {
    const routes: [string, string, object?][] = [
      ['GET', `/api/models/${modelId}`],
      ['GET', `/api/models/${modelId}/graph`],
      ['GET', `/api/models/${modelId}/readme`],
      ['PUT', `/api/models/${modelId}/readme`, { markdown: 'x', baseUpdatedAt: null }],
      ['PATCH', `/api/models/${modelId}`, { name: 'x' }],
      ['DELETE', `/api/models/${modelId}`],
      ['POST', `/api/models/${modelId}/file-ticket`, {}],
      ['GET', `/api/models/${modelId}/shares`],
      ['GET', `/api/models/${modelId}/share-links`],
    ];
    for (const [method, url, payload] of routes) {
      const response = await context.app.inject({
        method: method as 'GET',
        url,
        headers: bearer(bob.accessToken),
        ...(payload ? { payload } : {}),
      });
      expect(response.statusCode, `${method} ${url}`).toBe(404);
    }
  });

  it('refuses to register a model route without the gate', async () => {
    const app = await buildApp({ config: context.config, db: context.db, rateLimitEnabled: false });
    try {
      expect(() => app.get('/api/models/:id/forgotten', () => 'oops')).toThrow(
        /missing requireModelAccess/,
      );
    } finally {
      await app.close();
    }
  });
});

describe('direct shares', () => {
  it('give viewers read access with their download setting, and editors more', async () => {
    await setVisibility('users');
    expect((await share(bob.username, 'viewer', false)).statusCode).toBe(200);
    expect((await get(`/api/models/${modelId}/graph`, bearer(bob.accessToken))).statusCode).toBe(
      200,
    );
    const readmeEdit = await context.app.inject({
      method: 'PUT',
      url: `/api/models/${modelId}/readme`,
      headers: bearer(bob.accessToken),
      payload: { markdown: '# hi', baseUpdatedAt: null },
    });
    expect(readmeEdit.statusCode).toBe(403);
    const ticket = await context.app.inject({
      method: 'POST',
      url: `/api/models/${modelId}/file-ticket`,
      headers: bearer(bob.accessToken),
      payload: {},
    });
    expect(ticket.statusCode).toBe(403);

    await share(bob.username, 'editor');
    const asEditor = await context.app.inject({
      method: 'PUT',
      url: `/api/models/${modelId}/readme`,
      headers: bearer(bob.accessToken),
      payload: { markdown: '# hi', baseUpdatedAt: null },
    });
    expect(asEditor.statusCode).toBe(200);
    const visibility = await context.app.inject({
      method: 'PATCH',
      url: `/api/models/${modelId}`,
      headers: bearer(bob.accessToken),
      payload: { visibility: 'public' },
    });
    expect(visibility.statusCode).toBe(403);
  });

  it('go dormant while private and come back afterwards', async () => {
    await setVisibility('users');
    await share(bob.username, 'viewer');
    await setVisibility('private');
    expect((await get(`/api/models/${modelId}`, bearer(bob.accessToken))).statusCode).toBe(404);
    await setVisibility('users');
    expect((await get(`/api/models/${modelId}`, bearer(bob.accessToken))).statusCode).toBe(200);
  });

  it('validate the target and can be removed', async () => {
    expect((await share('nobody-here', 'viewer')).statusCode).toBe(404);
    expect((await share(owner.username, 'viewer')).statusCode).toBe(422);
    await setVisibility('users');
    await share(bob.username, 'viewer');
    const list = await get(`/api/models/${modelId}/shares`, bearer(owner.accessToken));
    expect(list.json()).toHaveLength(1);
    const removal = await context.app.inject({
      method: 'DELETE',
      url: `/api/models/${modelId}/shares/${bob.username}`,
      headers: bearer(owner.accessToken),
    });
    expect(removal.statusCode).toBe(204);
    expect((await get(`/api/models/${modelId}`, bearer(bob.accessToken))).statusCode).toBe(404);
  });
});

describe('share links', () => {
  it('cap anonymous visitors at viewer even on editor links', async () => {
    await setVisibility('link');
    const link = await createLink({ role: 'editor' });
    const anonymous = await get(`/api/models/${modelId}`, { 'x-share-link': link.token });
    expect(anonymous.statusCode).toBe(200);
    expect(anonymous.json().myAccess).toEqual({ role: 'viewer', canDownload: false, via: 'link' });
  });

  it('give signed-in visitors the link role and remember the visit', async () => {
    await setVisibility('link');
    const link = await createLink({ role: 'editor' });
    const resolve = await context.app.inject({
      method: 'POST',
      url: '/api/share-links/resolve',
      headers: { ...bearer(bob.accessToken), 'x-share-link': link.token },
    });
    expect(resolve.json()).toEqual({ modelId, role: 'editor', canDownload: true });
    // No header needed anymore: the visit is remembered.
    const later = await get(`/api/models/${modelId}`, bearer(bob.accessToken));
    expect(later.json().myAccess.role).toBe('editor');
    const shared = await get('/api/models?scope=shared', bearer(bob.accessToken));
    expect(shared.json<{ items: { id: string }[] }>().items.map((item) => item.id)).toEqual([
      modelId,
    ]);

    await context.app.inject({
      method: 'DELETE',
      url: `/api/models/${modelId}/share-links/${link.id}`,
      headers: bearer(owner.accessToken),
    });
    expect((await get(`/api/models/${modelId}`, bearer(bob.accessToken))).statusCode).toBe(404);
    expect(
      (await get('/api/models?scope=shared', bearer(bob.accessToken))).json().items,
    ).toHaveLength(0);
  });

  it('expire, and need the link visibility', async () => {
    const link = await createLink({
      role: 'viewer',
      expiresAt: new Date(clock.now().getTime() + 60_000).toISOString(),
    });
    expect((await get(`/api/models/${modelId}`, { 'x-share-link': link.token })).statusCode).toBe(
      404,
    );
    await setVisibility('link');
    expect((await get(`/api/models/${modelId}`, { 'x-share-link': link.token })).statusCode).toBe(
      200,
    );
    clock.advance(61_000);
    expect((await get(`/api/models/${modelId}`, { 'x-share-link': link.token })).statusCode).toBe(
      404,
    );
    const resolve = await context.app.inject({
      method: 'POST',
      url: '/api/share-links/resolve',
      headers: { 'x-share-link': link.token },
    });
    expect(resolve.statusCode).toBe(404);
  });

  it('respect their download setting through tickets', async () => {
    await setVisibility('link');
    const noDownload = await createLink({ role: 'viewer', allowDownload: false });
    const denied = await context.app.inject({
      method: 'POST',
      url: `/api/models/${modelId}/file-ticket`,
      headers: { 'x-share-link': noDownload.token },
      payload: {},
    });
    expect(denied.statusCode).toBe(403);
    const withDownload = await createLink({ role: 'viewer', allowDownload: true });
    const ticket = await context.app.inject({
      method: 'POST',
      url: `/api/models/${modelId}/file-ticket`,
      headers: { 'x-share-link': withDownload.token },
      payload: {},
    });
    expect(ticket.statusCode).toBe(200);
    const download = await context.app.inject({
      method: 'GET',
      url: ticket.json<{ url: string }>().url,
    });
    expect(download.statusCode).toBe(200);
    // Revoking the link stops downloads that were already ticketed.
    await context.app.inject({
      method: 'DELETE',
      url: `/api/models/${modelId}/share-links/${withDownload.id}`,
      headers: bearer(owner.accessToken),
    });
    expect(
      (await context.app.inject({ method: 'GET', url: ticket.json<{ url: string }>().url }))
        .statusCode,
    ).toBe(404);
  });

  it('can be copied again by the owner and edited', async () => {
    const link = await createLink({ role: 'viewer', label: '리뷰어용' });
    const list = await get(`/api/models/${modelId}/share-links`, bearer(owner.accessToken));
    expect(list.json()[0]).toMatchObject({ id: link.id, url: link.url, label: '리뷰어용' });
    const patch = await context.app.inject({
      method: 'PATCH',
      url: `/api/models/${modelId}/share-links/${link.id}`,
      headers: bearer(owner.accessToken),
      payload: { role: 'editor' },
    });
    expect(patch.json()).toMatchObject({ role: 'editor', allowDownload: false });
  });
});

describe('user search', () => {
  it('finds people by username prefix, excluding me', async () => {
    const response = await get('/api/users/search?q=bo', bearer(owner.accessToken));
    expect(response.json()).toEqual([
      { id: bob.id, username: bob.username, displayName: bob.username },
    ]);
    expect((await get('/api/users/search?q=own', bearer(owner.accessToken))).json()).toEqual([]);
  });
});

describe('lists agree with the resolver (matrix)', () => {
  it('"shared with me" contains exactly the models the resolver grants', async () => {
    const visibilities = ['private', 'users', 'link', 'public'] as const;
    const ids: string[] = [];
    for (const visibility of visibilities) {
      for (const shareBob of [false, true]) {
        for (const visitLink of [false, true]) {
          const id = randomUUID();
          ids.push(id);
          await execute(
            context.db,
            'INSERT INTO models (id, owner_id, name, visibility) VALUES (?, ?, ?, ?)',
            [id, carol.id, `${visibility}-${String(shareBob)}-${String(visitLink)}`, visibility],
          );
          if (shareBob)
            await execute(
              context.db,
              "INSERT INTO shares (model_id, user_id, role) VALUES (?, ?, 'viewer')",
              [id, bob.id],
            );
          if (visitLink) {
            const linkId = randomUUID();
            await execute(
              context.db,
              "INSERT INTO share_links (id, model_id, token_hash, token_ciphertext, role) VALUES (?, ?, ?, ?, 'viewer')",
              [linkId, id, randomBytes(32), Buffer.alloc(32)],
            );
            await execute(context.db, 'INSERT INTO link_visits (user_id, link_id) VALUES (?, ?)', [
              bob.id,
              linkId,
            ]);
          }
        }
      }
    }
    const listed = new Set(
      (await listModels(context.db, bob.id, 'shared', { limit: 50, now: clock.now() })).items.map(
        (item) => item.id,
      ),
    );
    for (const id of ids) {
      const access = await resolveModelAccess(
        context.db,
        id,
        { userId: bob.id, linkTokenHash: null },
        clock.now(),
      );
      // Public models are viewable by anyone but only count as "shared" through a share or visit.
      const viaSharing = access !== null && access.via !== 'public';
      expect(listed.has(id), id).toBe(viaSharing);
    }
  });
});

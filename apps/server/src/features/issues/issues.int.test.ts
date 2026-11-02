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
import { execute, selectOne } from '../../db/query.js';
import { runCleanup } from '../../jobs/cleanup.js';

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
  modelId = (
    await createRepository(context, owner.accessToken, 'tiny-cnn.onnx', tinyCnnOnnx(), {
      visibility: 'public',
    })
  ).id;
});

afterAll(async () => {
  await context.close();
});

const openIssue = (token: string, payload: object) =>
  context.app.inject({
    method: 'POST',
    url: `/api/models/${modelId}/issues`,
    headers: bearer(token),
    payload,
  });
const patchIssue = (token: string, number: number, payload: object) =>
  context.app.inject({
    method: 'PATCH',
    url: `/api/models/${modelId}/issues/${number}`,
    headers: bearer(token),
    payload,
  });
const reply = (token: string, number: number, body: string) =>
  context.app.inject({
    method: 'POST',
    url: `/api/models/${modelId}/issues/${number}/replies`,
    headers: bearer(token),
    payload: { body },
  });
const openCount = async () =>
  (
    await selectOne<{ open_issue_count: number }>(
      context.db,
      'SELECT open_issue_count FROM models WHERE id = ?',
      [modelId],
    )
  )?.open_issue_count;

describe('issues', () => {
  it('numbers concurrent issues uniquely and keeps the open count right', async () => {
    const responses = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        openIssue(bob.accessToken, { kind: 'question', title: `Q${index}` }),
      ),
    );
    const numbers = responses
      .map((response) => response.json<{ number: number }>().number)
      .sort((a, b) => a - b);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6]);
    expect(await openCount()).toBe(6);
  });

  it('needs a signed-in viewer to open, and anyone who can view to read', async () => {
    expect(
      (
        await context.app.inject({
          method: 'POST',
          url: `/api/models/${modelId}/issues`,
          payload: { kind: 'bug', title: 'x' },
        })
      ).statusCode,
    ).toBe(401);
    await openIssue(bob.accessToken, { kind: 'bug', title: 'Shape mismatch', body: '**bold**' });
    const anonymous = await context.app.inject({
      method: 'GET',
      url: `/api/models/${modelId}/issues/1`,
    });
    expect(anonymous.json()).toMatchObject({
      title: 'Shape mismatch',
      body: '**bold**',
      canReply: false,
      canModerate: false,
    });
  });

  it('lets authors edit and close their own issue, and editors moderate any', async () => {
    await openIssue(bob.accessToken, { kind: 'bug', title: 'Original' });
    expect((await patchIssue(carol.accessToken, 1, { title: 'Hijack' })).statusCode).toBe(403);
    expect((await patchIssue(carol.accessToken, 1, { state: 'closed' })).statusCode).toBe(403);
    expect((await patchIssue(bob.accessToken, 1, { title: 'Edited' })).json().title).toBe('Edited');
    expect((await patchIssue(bob.accessToken, 1, { locked: true })).statusCode).toBe(403);

    const closed = await patchIssue(owner.accessToken, 1, { state: 'closed', kind: 'question' });
    expect(closed.json()).toMatchObject({
      state: 'closed',
      kind: 'question',
      closedBy: { username: owner.username },
    });
    expect(await openCount()).toBe(0);
    expect((await patchIssue(bob.accessToken, 1, { state: 'open' })).json().state).toBe('open');
    expect(await openCount()).toBe(1);
  });

  it('locks issues against viewer replies but not editor replies', async () => {
    await openIssue(bob.accessToken, { kind: 'feedback', title: 'Great model' });
    await patchIssue(owner.accessToken, 1, { locked: true });
    expect((await reply(carol.accessToken, 1, 'me too')).statusCode).toBe(403);
    const fromOwner = await reply(owner.accessToken, 1, 'thanks!');
    expect(fromOwner.statusCode).toBe(201);
    expect(fromOwner.json().replyCount).toBe(1);
  });

  it('tracks replies: author edits, author or editor deletes', async () => {
    await openIssue(bob.accessToken, { kind: 'question', title: 'How?' });
    const created = await reply(carol.accessToken, 1, 'like this');
    const replyId = created.json<{ replies: { id: string }[] }>().replies[0]?.id ?? '';
    const editAsBob = await context.app.inject({
      method: 'PATCH',
      url: `/api/models/${modelId}/issues/1/replies/${replyId}`,
      headers: bearer(bob.accessToken),
      payload: { body: 'changed' },
    });
    expect(editAsBob.statusCode).toBe(403);
    const removal = await context.app.inject({
      method: 'DELETE',
      url: `/api/models/${modelId}/issues/1/replies/${replyId}`,
      headers: bearer(owner.accessToken),
    });
    expect(removal.statusCode).toBe(204);
    const issue = await context.app.inject({
      method: 'GET',
      url: `/api/models/${modelId}/issues/1`,
    });
    expect(issue.json()).toMatchObject({ replyCount: 0, replies: [{ deleted: true, body: '' }] });
  });

  it('lets authors delete only until someone replies', async () => {
    await openIssue(bob.accessToken, { kind: 'bug', title: 'Oops' });
    await reply(carol.accessToken, 1, 'saw it');
    expect(
      (
        await context.app.inject({
          method: 'DELETE',
          url: `/api/models/${modelId}/issues/1`,
          headers: bearer(bob.accessToken),
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await context.app.inject({
          method: 'DELETE',
          url: `/api/models/${modelId}/issues/1`,
          headers: bearer(owner.accessToken),
        })
      ).statusCode,
    ).toBe(204);
    expect(await openCount()).toBe(0);
  });

  it('validates node references and counts open issues per node', async () => {
    expect(
      (await openIssue(bob.accessToken, { kind: 'bug', title: 'x', nodeRef: '/nope/Conv' }))
        .statusCode,
    ).toBe(422);
    await openIssue(bob.accessToken, {
      kind: 'bug',
      title: 'Conv bug',
      nodeRef: '/stem/conv/Conv',
    });
    await openIssue(carol.accessToken, {
      kind: 'question',
      title: 'Conv?',
      nodeRef: '/stem/conv/Conv',
    });
    const counts = await context.app.inject({
      method: 'GET',
      url: `/api/models/${modelId}/issues/node-counts`,
    });
    expect(counts.json()).toEqual({ '/stem/conv/Conv': 2 });
    const filtered = await context.app.inject({
      method: 'GET',
      url: `/api/models/${modelId}/issues?nodeRef=${encodeURIComponent('/stem/conv/Conv')}`,
    });
    expect(filtered.json().items).toHaveLength(2);
  });
});

describe('activity feed', () => {
  it('marks other people’s activity unread until the issue is opened', async () => {
    await openIssue(owner.accessToken, { kind: 'question', title: 'Mine' });
    clock.advance(1000);
    await reply(bob.accessToken, 1, 'a reply');
    let feed = await context.app.inject({
      method: 'GET',
      url: '/api/me/activity',
      headers: bearer(owner.accessToken),
    });
    expect(feed.json()).toMatchObject({
      unreadCount: 1,
      items: [{ unread: true, issue: { number: 1 } }],
    });
    clock.advance(1000);
    await context.app.inject({
      method: 'GET',
      url: `/api/models/${modelId}/issues/1`,
      headers: bearer(owner.accessToken),
    });
    feed = await context.app.inject({
      method: 'GET',
      url: '/api/me/activity',
      headers: bearer(owner.accessToken),
    });
    expect(feed.json().unreadCount).toBe(0);
    clock.advance(1000);
    await reply(owner.accessToken, 1, 'my own reply');
    feed = await context.app.inject({
      method: 'GET',
      url: '/api/me/activity',
      headers: bearer(owner.accessToken),
    });
    expect(feed.json().unreadCount).toBe(0);
    const bobFeed = await context.app.inject({
      method: 'GET',
      url: '/api/me/activity',
      headers: bearer(bob.accessToken),
    });
    expect(bobFeed.json().unreadCount).toBe(1);
  });
});

describe('stars', () => {
  it('counts each user once and lists my stars', async () => {
    const star = () =>
      context.app.inject({
        method: 'PUT',
        url: `/api/models/${modelId}/star`,
        headers: bearer(bob.accessToken),
      });
    expect((await star()).json()).toEqual({ starred: true, starCount: 1 });
    expect((await star()).json()).toEqual({ starred: true, starCount: 1 });
    const mine = await context.app.inject({
      method: 'GET',
      url: '/api/me/stars',
      headers: bearer(bob.accessToken),
    });
    expect(mine.json<{ items: { id: string }[] }>().items.map((item) => item.id)).toEqual([
      modelId,
    ]);
    const detail = await context.app.inject({
      method: 'GET',
      url: `/api/models/${modelId}`,
      headers: bearer(bob.accessToken),
    });
    expect(detail.json()).toMatchObject({ starCount: 1, starredByMe: true });
    const unstar = await context.app.inject({
      method: 'DELETE',
      url: `/api/models/${modelId}/star`,
      headers: bearer(bob.accessToken),
    });
    expect(unstar.json()).toEqual({ starred: false, starCount: 0 });
  });

  it('reconciles drifted counters in the nightly cleanup', async () => {
    await context.app.inject({
      method: 'PUT',
      url: `/api/models/${modelId}/star`,
      headers: bearer(bob.accessToken),
    });
    await execute(
      context.db,
      'UPDATE models SET star_count = 99, open_issue_count = 5 WHERE id = ?',
      [modelId],
    );
    const warnings: object[] = [];
    await runCleanup(context.db, clock.now(), { warn: (object) => warnings.push(object) });
    const row = await selectOne<{ star_count: number; open_issue_count: number }>(
      context.db,
      'SELECT star_count, open_issue_count FROM models WHERE id = ?',
      [modelId],
    );
    expect(row).toEqual({ star_count: 1, open_issue_count: 0 });
    expect(warnings).toHaveLength(1);
  });
});

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
import { execute } from '../../db/query.js';

const clock = fakeClock();
let context: TestContext;
let owner: SignedUpUser;
let admin: SignedUpUser;
let visitor: SignedUpUser;
let modelId: string;

beforeAll(async () => {
  context = await createTestContext({ clock: clock.now });
});

beforeEach(async () => {
  await truncateAllTables(context.db);
  owner = await signUp(context.app, 'owner@example.com');
  admin = await signUp(context.app, 'admin@example.com');
  visitor = await signUp(context.app, 'visitor@example.com');
  await execute(context.db, "UPDATE users SET role = 'admin' WHERE id = ?", [admin.id]);
  ({ id: modelId } = await createRepository(
    context,
    owner.accessToken,
    'tiny-cnn.onnx',
    tinyCnnOnnx(),
    { visibility: 'public' },
  ));
});

afterAll(async () => {
  await context.close();
});

const report = (payload: Record<string, unknown>, headers: Record<string, string> = {}) =>
  context.app.inject({ method: 'POST', url: `/api/models/${modelId}/reports`, headers, payload });

const openReports = async () => {
  const response = await context.app.inject({
    method: 'GET',
    url: '/api/admin/reports',
    headers: bearer(admin.accessToken),
  });
  expect(response.statusCode).toBe(200);
  return response.json<{ items: { id: string; issue: { number: number } | null }[] }>().items;
};

const createIssue = async () => {
  const response = await context.app.inject({
    method: 'POST',
    url: `/api/models/${modelId}/issues`,
    headers: bearer(visitor.accessToken),
    payload: { kind: 'feedback', title: '광고 글', body: '싸게 팝니다' },
  });
  expect(response.statusCode).toBe(201);
  return response.json<{ number: number }>().number;
};

describe('reports', () => {
  it('accepts anonymous and signed-in reports, including ones about an issue', async () => {
    expect((await report({ reason: 'malware', details: '수상한 파일' })).statusCode).toBe(204);
    const number = await createIssue();
    const issueReport = await report(
      { reason: 'spam', issueNumber: number },
      bearer(visitor.accessToken),
    );
    expect(issueReport.statusCode).toBe(204);
    const items = await openReports();
    expect(items).toHaveLength(2);
    expect(items[1]?.issue?.number).toBe(number);
  });

  it('cannot report a repository the reporter cannot see', async () => {
    await execute(context.db, "UPDATE models SET visibility = 'private' WHERE id = ?", [modelId]);
    expect((await report({ reason: 'spam' })).statusCode).toBe(404);
  });

  it('rejects an unknown issue number', async () => {
    expect((await report({ reason: 'spam', issueNumber: 99 })).statusCode).toBe(404);
  });
});

describe('admin routes', () => {
  it('are forbidden for regular users and anonymous visitors', async () => {
    const asUser = await context.app.inject({
      method: 'GET',
      url: '/api/admin/reports',
      headers: bearer(owner.accessToken),
    });
    expect(asUser.statusCode).toBe(403);
    const anonymous = await context.app.inject({
      method: 'POST',
      url: `/api/admin/models/${modelId}/takedown`,
      payload: { reason: 'x' },
    });
    expect(anonymous.statusCode).toBe(401);
  });

  it('dismissing a report leaves the repository untouched', async () => {
    await report({ reason: 'other' });
    const [first] = await openReports();
    const resolve = await context.app.inject({
      method: 'POST',
      url: `/api/admin/reports/${first?.id ?? ''}/resolve`,
      headers: bearer(admin.accessToken),
      payload: { action: 'dismiss' },
    });
    expect(resolve.statusCode).toBe(204);
    expect(await openReports()).toHaveLength(0);
    const again = await context.app.inject({
      method: 'POST',
      url: `/api/admin/reports/${first?.id ?? ''}/resolve`,
      headers: bearer(admin.accessToken),
      payload: { action: 'dismiss' },
    });
    expect(again.statusCode).toBe(409);
    expect((await context.app.inject({ url: `/api/models/${modelId}` })).statusCode).toBe(200);
  });

  it('a takedown hides the repository from everyone but the owner and admins, until restored', async () => {
    await report({ reason: 'copyright' });
    await report({ reason: 'illegal' });
    const [first] = await openReports();
    await context.app.inject({
      method: 'POST',
      url: `/api/admin/reports/${first?.id ?? ''}/resolve`,
      headers: bearer(admin.accessToken),
      payload: { action: 'takedown', reason: '저작권 침해 신고' },
    });
    expect(await openReports()).toHaveLength(0);

    expect((await context.app.inject({ url: `/api/models/${modelId}` })).statusCode).toBe(404);
    const asVisitor = await context.app.inject({
      url: `/api/models/${modelId}`,
      headers: bearer(visitor.accessToken),
    });
    expect(asVisitor.statusCode).toBe(404);
    const asOwner = await context.app.inject({
      url: `/api/models/${modelId}`,
      headers: bearer(owner.accessToken),
    });
    expect(asOwner.json()).toMatchObject({
      takenDown: true,
      takenDownReason: '저작권 침해 신고',
      myAccess: { role: 'viewer', canDownload: false },
    });
    const asAdmin = await context.app.inject({
      url: `/api/models/${modelId}`,
      headers: bearer(admin.accessToken),
    });
    expect(asAdmin.statusCode).toBe(200);
    const search = await context.app.inject({ url: '/api/explore/search?sort=recent' });
    expect(search.json<{ items: unknown[] }>().items).toHaveLength(0);

    const restore = await context.app.inject({
      method: 'POST',
      url: `/api/admin/models/${modelId}/restore`,
      headers: bearer(admin.accessToken),
    });
    expect(restore.statusCode).toBe(204);
    expect((await context.app.inject({ url: `/api/models/${modelId}` })).statusCode).toBe(200);
  });

  it('deleting a reported issue hides it and fixes the open-issue counter', async () => {
    const number = await createIssue();
    await report({ reason: 'spam', issueNumber: number });
    const [first] = await openReports();
    const resolve = await context.app.inject({
      method: 'POST',
      url: `/api/admin/reports/${first?.id ?? ''}/resolve`,
      headers: bearer(admin.accessToken),
      payload: { action: 'delete_issue' },
    });
    expect(resolve.statusCode).toBe(204);
    const issue = await context.app.inject({
      url: `/api/models/${modelId}/issues/${String(number)}`,
      headers: bearer(owner.accessToken),
    });
    expect(issue.json()).toMatchObject({ title: '삭제된 이슈', deleted: true });
    const detail = await context.app.inject({
      url: `/api/models/${modelId}`,
      headers: bearer(owner.accessToken),
    });
    expect(detail.json()).toMatchObject({ openIssueCount: 0 });
  });

  it('revoking admin rights takes effect without signing in again', async () => {
    await execute(context.db, "UPDATE users SET role = 'user' WHERE id = ?", [admin.id]);
    const response = await context.app.inject({
      method: 'GET',
      url: '/api/admin/reports',
      headers: bearer(admin.accessToken),
    });
    expect(response.statusCode).toBe(403);
  });
});

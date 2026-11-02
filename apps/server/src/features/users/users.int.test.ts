import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execute, selectOne } from '../../db/query.js';
import {
  bearer,
  cookieRouteHeaders,
  createTestContext,
  fakeClock,
  refreshCookieFrom,
  signUp,
  truncateAllTables,
  type TestContext,
} from '../../../test/helpers.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const clock = fakeClock();
let context: TestContext;

beforeAll(async () => {
  context = await createTestContext({ clock: clock.now });
});

beforeEach(async () => {
  await truncateAllTables(context.db);
});

afterAll(async () => {
  await context.close();
});

function patchMe(token: string, payload: object) {
  return context.app.inject({ method: 'PATCH', url: '/api/me', headers: bearer(token), payload });
}

describe('profile', () => {
  it('updates display name and bio', async () => {
    const user = await signUp(context.app);
    const response = await patchMe(user.accessToken, { displayName: '카이', bio: 'ONNX 덕후' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ displayName: '카이', bio: 'ONNX 덕후' });
  });

  it('allows one username change per 30 days and holds the old name for others', async () => {
    const alice = await signUp(context.app, 'alice@example.com');
    const bob = await signUp(context.app, 'bob@example.com');
    expect((await patchMe(alice.accessToken, { username: 'alice-new' })).statusCode).toBe(200);
    const again = await patchMe(alice.accessToken, { username: 'alice-third' });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('username_cooldown');
    const grab = await patchMe(bob.accessToken, { username: 'alice' });
    expect(grab.statusCode).toBe(409);
    expect(grab.json().error.code).toBe('username_taken');

    clock.advance(31 * DAY_MS);
    const relogin = await context.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: bob.email, password: bob.password },
    });
    const freshToken = relogin.json<{ accessToken: string }>().accessToken;
    expect((await patchMe(freshToken, { username: 'alice' })).statusCode).toBe(200);
  });

  it('rejects reserved usernames', async () => {
    const user = await signUp(context.app);
    expect((await patchMe(user.accessToken, { username: 'admin' })).statusCode).toBe(400);
  });
});

describe('password and email changes', () => {
  it('changing the password signs out other sessions but keeps this device signed in', async () => {
    const user = await signUp(context.app);
    const other = await context.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: user.email, password: user.password },
    });
    const otherCookie = refreshCookieFrom(other.headers['set-cookie']) ?? '';
    clock.advance(1000);
    const response = await context.app.inject({
      method: 'PUT',
      url: '/api/me/password',
      headers: bearer(user.accessToken),
      payload: { currentPassword: user.password, newPassword: 'a brand new passphrase' },
    });
    expect(response.statusCode).toBe(200);
    const freshCookie = refreshCookieFrom(response.headers['set-cookie']) ?? '';
    clock.advance(1000);
    const refreshWith = (cookie: string) =>
      context.app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        headers: cookieRouteHeaders(cookie),
        payload: {},
      });
    expect((await refreshWith(otherCookie)).statusCode).toBe(401);
    expect((await refreshWith(user.cookie)).statusCode).toBe(401);
    expect((await refreshWith(freshCookie)).statusCode).toBe(200);
  });

  it('requires the current password', async () => {
    const user = await signUp(context.app);
    const response = await context.app.inject({
      method: 'PUT',
      url: '/api/me/password',
      headers: bearer(user.accessToken),
      payload: { currentPassword: 'wrong', newPassword: 'a brand new passphrase' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('changes the login email', async () => {
    const user = await signUp(context.app);
    const response = await context.app.inject({
      method: 'PUT',
      url: '/api/me/email',
      headers: bearer(user.accessToken),
      payload: { currentPassword: user.password, newEmail: 'Moved@Example.com' },
    });
    expect(response.statusCode).toBe(204);
    const login = await context.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'moved@example.com', password: user.password },
    });
    expect(login.statusCode).toBe(200);
  });
});

async function insertModel(ownerId: string, name: string): Promise<string> {
  const id = randomUUID();
  await execute(
    context.db,
    'INSERT INTO models (id, owner_id, name, visibility) VALUES (?, ?, ?, ?)',
    [id, ownerId, name, 'public'],
  );
  return id;
}

describe('account deletion', () => {
  it('deletes owned repositories, keeps foreign issues anonymized, and fixes star counts', async () => {
    const alice = await signUp(context.app, 'alice@example.com');
    const bob = await signUp(context.app, 'bob@example.com');
    await insertModel(alice.id, 'alice-model');
    const bobModel = await insertModel(bob.id, 'bob-model');
    await execute(context.db, 'INSERT INTO stars (user_id, model_id) VALUES (?, ?)', [
      alice.id,
      bobModel,
    ]);
    await execute(context.db, 'UPDATE models SET star_count = 1 WHERE id = ?', [bobModel]);
    const issueId = randomUUID();
    await execute(
      context.db,
      `INSERT INTO issues (id, model_id, number, kind, title, body_md, author_id)
       VALUES (?, ?, 1, 'question', 'Hi', 'body', ?)`,
      [issueId, bobModel, alice.id],
    );

    const response = await context.app.inject({
      method: 'DELETE',
      url: '/api/me',
      headers: bearer(alice.accessToken),
      payload: { password: alice.password, confirmUsername: alice.username },
    });
    expect(response.statusCode).toBe(204);

    expect(await selectOne(context.db, 'SELECT id FROM users WHERE id = ?', [alice.id])).toBeNull();
    expect(
      await selectOne(context.db, 'SELECT id FROM models WHERE owner_id = ?', [alice.id]),
    ).toBeNull();
    const issue = await selectOne<{ author_id: string | null }>(
      context.db,
      'SELECT author_id FROM issues WHERE id = ?',
      [issueId],
    );
    expect(issue).toEqual({ author_id: null });
    const model = await selectOne<{ star_count: number }>(
      context.db,
      'SELECT star_count FROM models WHERE id = ?',
      [bobModel],
    );
    expect(model?.star_count).toBe(0);
    const audit = await selectOne<{ meta: unknown; actor_id: string | null }>(
      context.db,
      "SELECT meta, actor_id FROM audit_events WHERE action = 'account.deleted'",
    );
    expect(audit).toEqual({ meta: null, actor_id: null });

    const login = await context.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: alice.email, password: alice.password },
    });
    expect(login.statusCode).toBe(401);
  });

  it('requires the password and the typed username', async () => {
    const user = await signUp(context.app);
    const wrongName = await context.app.inject({
      method: 'DELETE',
      url: '/api/me',
      headers: bearer(user.accessToken),
      payload: { password: user.password, confirmUsername: 'someone-else' },
    });
    expect(wrongName.statusCode).toBe(400);
    const wrongPassword = await context.app.inject({
      method: 'DELETE',
      url: '/api/me',
      headers: bearer(user.accessToken),
      payload: { password: 'nope', confirmUsername: user.username },
    });
    expect(wrongPassword.statusCode).toBe(403);
  });
});

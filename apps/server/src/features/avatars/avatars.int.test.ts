import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pngHeader } from '../../../test/fixtures/builders.js';
import {
  bearer,
  createTestContext,
  signUp,
  truncateAllTables,
  type SignedUpUser,
  type TestContext,
} from '../../../test/helpers.js';

let context: TestContext;
let user: SignedUpUser;

beforeAll(async () => {
  context = await createTestContext();
});

beforeEach(async () => {
  await truncateAllTables(context.db);
  user = await signUp(context.app, 'photo@example.com');
});

afterAll(async () => {
  await context.close();
});

const upload = (bytes: Buffer, token = user.accessToken) =>
  context.app.inject({
    method: 'PUT',
    url: '/api/me/avatar',
    headers: { ...bearer(token), 'content-type': 'image/png' },
    payload: bytes,
  });

describe('profile photos', () => {
  it('stores a PNG, serves it with long caching and shows it on the profile', async () => {
    const photo = Buffer.concat([pngHeader(256, 256), Buffer.from('pixels')]);
    const response = await upload(photo);
    expect(response.statusCode).toBe(200);
    const { avatarKey } = response.json<{ avatarKey: string }>();
    expect(avatarKey).toMatch(/^[0-9a-f-]{36}$/);

    const image = await context.app.inject({ url: `/api/avatars/${avatarKey}` });
    expect(image.headers['content-type']).toBe('image/png');
    expect(image.headers['cache-control']).toContain('immutable');
    expect(image.rawPayload.equals(photo)).toBe(true);

    const profile = await context.app.inject({ url: `/api/users/${user.username}` });
    expect(profile.json<{ avatarKey: string }>().avatarKey).toBe(avatarKey);
  });

  it('replaces the old photo and can go back to the generated avatar', async () => {
    const first = (await upload(pngHeader(64, 64))).json<{ avatarKey: string }>().avatarKey;
    const second = (await upload(pngHeader(128, 128))).json<{ avatarKey: string }>().avatarKey;
    expect(second).not.toBe(first);
    expect((await context.app.inject({ url: `/api/avatars/${first}` })).statusCode).toBe(404);

    const cleared = await context.app.inject({
      method: 'DELETE',
      url: '/api/me/avatar',
      headers: bearer(user.accessToken),
    });
    expect(cleared.json<{ avatarKey: string | null }>().avatarKey).toBeNull();
    expect((await context.app.inject({ url: `/api/avatars/${second}` })).statusCode).toBe(404);
  });

  it('rejects anything but a PNG and requires a signed-in user', async () => {
    const html = await upload(Buffer.from('<html><script>alert(1)</script></html>'.padEnd(64)));
    expect(html.statusCode).toBe(400);
    expect(html.json<{ error: { code: string } }>().error.code).toBe('invalid_avatar');
    const anonymous = await context.app.inject({
      method: 'PUT',
      url: '/api/me/avatar',
      headers: { 'content-type': 'image/png' },
      payload: pngHeader(64, 64),
    });
    expect(anonymous.statusCode).toBe(401);
  });
});

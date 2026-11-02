import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  bearer,
  cookieRouteHeaders,
  createTestContext,
  fakeClock,
  ORIGIN,
  refreshCookieFrom,
  signUp,
  truncateAllTables,
  type TestContext,
} from '../../../test/helpers.js';
import { ROTATION_GRACE_MS } from './sessions.js';

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

async function refresh(cookie: string) {
  return context.app.inject({
    method: 'POST',
    url: '/api/auth/refresh',
    headers: cookieRouteHeaders(cookie),
    payload: {},
  });
}

describe('signup', () => {
  it('creates the account, derives a username and sets a hardened refresh cookie', async () => {
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email: 'Kai.Dev@Example.com', password: 'correct horse battery' },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.user).toMatchObject({
      email: 'kai.dev@example.com',
      username: 'kai-dev',
      displayName: 'kai-dev',
    });
    expect(typeof body.accessToken).toBe('string');
    const setCookie = String(response.headers['set-cookie']);
    expect(setCookie).toContain('mieru_rt=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).toContain('Path=/api/auth');
  });

  it('adds a numeric suffix when the username is taken', async () => {
    await signUp(context.app, 'kai.dev@one.com');
    const second = await signUp(context.app, 'kai.dev@two.com');
    expect(second.username).toMatch(/^kai-dev-\d{4}$/);
  });

  it('rejects a duplicate email', async () => {
    await signUp(context.app, 'same@example.com');
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email: 'SAME@example.com', password: 'another long password' },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('email_taken');
  });

  it('rejects short passwords', async () => {
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email: 'short@example.com', password: 'short' },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('access tokens', () => {
  it('protect /api/me', async () => {
    const user = await signUp(context.app);
    expect((await context.app.inject({ method: 'GET', url: '/api/me' })).statusCode).toBe(401);
    const me = await context.app.inject({
      method: 'GET',
      url: '/api/me',
      headers: bearer(user.accessToken),
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().username).toBe(user.username);
    const forged = await context.app.inject({
      method: 'GET',
      url: '/api/me',
      headers: bearer(`${user.accessToken}x`),
    });
    expect(forged.statusCode).toBe(401);
  });
});

describe('login and lockout', () => {
  async function login(email: string, password: string) {
    return context.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password },
    });
  }

  it('signs in with the right password', async () => {
    const user = await signUp(context.app);
    const response = await login(user.email, user.password);
    expect(response.statusCode).toBe(200);
    expect(refreshCookieFrom(response.headers['set-cookie'])).not.toBeNull();
  });

  it('does not reveal whether the email exists', async () => {
    const user = await signUp(context.app);
    const wrongPassword = await login(user.email, 'not the password');
    const unknownEmail = await login('nobody@example.com', 'not the password');
    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    expect(wrongPassword.json()).toEqual(unknownEmail.json());
  });

  it('locks after five failures with growing backoff, then unlocks', async () => {
    const user = await signUp(context.app);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await login(user.email, 'wrong password')).statusCode).toBe(401);
    }
    const locked = await login(user.email, user.password);
    expect(locked.statusCode).toBe(429);
    expect(locked.json().error.details.retryAfterSec).toBeGreaterThan(0);

    clock.advance(61_000);
    expect((await login(user.email, user.password)).statusCode).toBe(200);
    // Success resets the counter: four more failures don't lock again.
    for (let attempt = 0; attempt < 4; attempt += 1) await login(user.email, 'wrong password');
    expect((await login(user.email, user.password)).statusCode).toBe(200);
  });
});

describe('refresh rotation', () => {
  it('rotates the token and returns a new access token', async () => {
    const user = await signUp(context.app);
    const response = await refresh(user.cookie);
    expect(response.statusCode).toBe(200);
    const next = refreshCookieFrom(response.headers['set-cookie']);
    expect(next).not.toBeNull();
    expect(next).not.toBe(user.cookie);
  });

  it('hands out the current session when a just-rotated token is replayed in the grace window', async () => {
    // A browser that navigated away mid-refresh never stored the new cookie and replays the old one.
    const user = await signUp(context.app);
    const first = await refresh(user.cookie);
    const lost = refreshCookieFrom(first.headers['set-cookie']);
    clock.advance(ROTATION_GRACE_MS - 1000);
    const replay = await refresh(user.cookie);
    expect(replay.statusCode).toBe(200);
    const recovered = refreshCookieFrom(replay.headers['set-cookie']);
    expect(recovered).not.toBeNull();
    expect(recovered).not.toBe(lost);
    clock.advance(ROTATION_GRACE_MS + 1000);
    expect((await refresh(recovered ?? '')).statusCode).toBe(200);
  });

  it('rejects an in-grace replay once the session was signed out', async () => {
    const user = await signUp(context.app);
    const first = await refresh(user.cookie);
    const next = refreshCookieFrom(first.headers['set-cookie']) ?? '';
    await context.app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: cookieRouteHeaders(next),
      payload: {},
    });
    const replay = await refresh(user.cookie);
    expect(replay.statusCode).toBe(401);
  });

  it('revokes the whole family when an old token is replayed later', async () => {
    const user = await signUp(context.app);
    const first = await refresh(user.cookie);
    const next = refreshCookieFrom(first.headers['set-cookie']) ?? '';
    clock.advance(ROTATION_GRACE_MS + 1000);
    const replay = await refresh(user.cookie);
    expect(replay.statusCode).toBe(401);
    expect(replay.json().error.code).toBe('refresh_reuse');
    expect((await refresh(next)).statusCode).toBe(401);
  });

  it('expires after 30 days without use', async () => {
    const user = await signUp(context.app);
    clock.advance(31 * 24 * 60 * 60 * 1000);
    expect((await refresh(user.cookie)).statusCode).toBe(401);
  });
});

describe('cookie route CSRF guard', () => {
  it('rejects foreign or missing origins and non-JSON bodies', async () => {
    const user = await signUp(context.app);
    const foreign = await context.app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: {
        cookie: user.cookie,
        origin: 'https://evil.example',
        'content-type': 'application/json',
      },
      payload: {},
    });
    expect(foreign.statusCode).toBe(403);
    const missing = await context.app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { cookie: user.cookie, 'content-type': 'application/json' },
      payload: {},
    });
    expect(missing.statusCode).toBe(403);
    const textPlain = await context.app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { cookie: user.cookie, origin: ORIGIN, 'content-type': 'text/plain' },
      payload: 'x',
    });
    expect(textPlain.statusCode).toBe(415);
  });
});

describe('logout and sessions', () => {
  it('logout revokes the session', async () => {
    const user = await signUp(context.app);
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: cookieRouteHeaders(user.cookie),
      payload: {},
    });
    expect(response.statusCode).toBe(204);
    expect((await refresh(user.cookie)).statusCode).toBe(401);
  });

  it('logout-all revokes every session of the user', async () => {
    const user = await signUp(context.app);
    const second = await context.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: user.email, password: user.password },
    });
    const secondCookie = refreshCookieFrom(second.headers['set-cookie']) ?? '';
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/auth/logout-all',
      headers: bearer(user.accessToken),
    });
    expect(response.statusCode).toBe(204);
    expect((await refresh(user.cookie)).statusCode).toBe(401);
    expect((await refresh(secondCookie)).statusCode).toBe(401);
  });

  it('lists sessions, marks the current one, and revokes another', async () => {
    const user = await signUp(context.app);
    const second = await context.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'user-agent': 'second-device' },
      payload: { email: user.email, password: user.password },
    });
    const secondCookie = refreshCookieFrom(second.headers['set-cookie']) ?? '';
    const list = await context.app.inject({
      method: 'GET',
      url: '/api/me/sessions',
      headers: bearer(user.accessToken),
    });
    const sessions =
      list.json<{ familyId: string; current: boolean; userAgent: string | null }[]>();
    expect(sessions).toHaveLength(2);
    expect(sessions.filter((session) => session.current)).toHaveLength(1);
    const other = sessions.find((session) => !session.current);
    expect(other?.userAgent).toBe('second-device');
    const revoke = await context.app.inject({
      method: 'DELETE',
      url: `/api/me/sessions/${other?.familyId ?? ''}`,
      headers: bearer(user.accessToken),
    });
    expect(revoke.statusCode).toBe(204);
    expect((await refresh(secondCookie)).statusCode).toBe(401);
  });
});

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { RowDataPacket } from 'mysql2/promise';
import { buildApp } from '../src/app.js';
import type { Clock } from '../src/clock.js';
import { loadConfig, type AppConfig } from '../src/config.js';
import { createPool, type DbPool } from '../src/db/pool.js';
import { testDatabaseUrl } from './env.js';

export interface TestContext {
  app: FastifyInstance;
  /** Real HTTP base URL; tus hijacks the raw socket, which inject() can't drive. */
  baseUrl: string;
  db: DbPool;
  config: AppConfig;
  storageDir: string;
  close: () => Promise<void>;
}

const TEST_SECRET = 'x'.repeat(48);

export interface TestContextOptions {
  env?: Partial<Record<string, string>>;
  clock?: Clock;
  rateLimitEnabled?: boolean;
}

/** Builds an app against the test database with an isolated temporary storage directory. */
export async function createTestContext(options: TestContextOptions = {}): Promise<TestContext> {
  const databaseUrl = testDatabaseUrl();
  const storageDir = await mkdtemp(path.join(os.tmpdir(), 'mieru-test-'));
  const config = loadConfig({
    NODE_ENV: 'test',
    APP_ORIGIN: 'http://127.0.0.1:5173',
    LOG_LEVEL: 'silent',
    DATABASE_URL: databaseUrl,
    JWT_SECRET: TEST_SECRET,
    LINK_TOKEN_KEY: TEST_SECRET,
    TICKET_SECRET: TEST_SECRET,
    VIEW_SALT_SECRET: TEST_SECRET,
    STORAGE_DIR: storageDir,
    ...options.env,
  });
  const db = createPool(databaseUrl);
  const app = await buildApp({
    config,
    db,
    clock: options.clock,
    rateLimitEnabled: options.rateLimitEnabled ?? false,
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return {
    app,
    baseUrl: `http://127.0.0.1:${port}`,
    db,
    config,
    storageDir,
    close: async () => {
      await app.close();
      await db.end();
      await rm(storageDir, { recursive: true, force: true });
    },
  };
}

/** Empties every application table so each test file starts clean. */
export async function truncateAllTables(db: DbPool): Promise<void> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT table_name AS name FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name <> 'schema_migrations'`,
  );
  const connection = await db.getConnection();
  try {
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const row of rows) await connection.query(`TRUNCATE TABLE \`${String(row.name)}\``);
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
  } finally {
    connection.release();
  }
}

/** A controllable clock for expiry, lockout and grace-window tests. */
export function fakeClock(start = new Date('2026-11-02T00:00:00Z')) {
  let current = start.getTime();
  return {
    now: (() => new Date(current)) as Clock,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

export const ORIGIN = 'http://127.0.0.1:5173';

/** Extracts `name=value` for the refresh cookie from a response's Set-Cookie headers. */
export function refreshCookieFrom(setCookie: string | string[] | undefined): string | null {
  const headers = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const header = headers.find((value) => value.startsWith('mieru_rt='));
  if (!header) return null;
  const pair = header.split(';')[0] ?? '';
  return pair === 'mieru_rt=' ? null : pair;
}

export interface SignedUpUser {
  id: string;
  username: string;
  email: string;
  password: string;
  accessToken: string;
  cookie: string;
}

let signupCounter = 0;

/** Signs up a fresh account through the API and returns its tokens. */
export async function signUp(
  app: FastifyInstance,
  email = `user${++signupCounter}-${Date.now()}@example.com`,
  password = 'correct horse battery',
): Promise<SignedUpUser> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/signup',
    payload: { email, password },
  });
  if (response.statusCode !== 201) throw new Error(`signup failed: ${response.body}`);
  const body = response.json<{ accessToken: string; user: { id: string; username: string } }>();
  const cookie = refreshCookieFrom(response.headers['set-cookie']);
  if (!cookie) throw new Error('signup did not set a refresh cookie');
  return {
    id: body.user.id,
    username: body.user.username,
    email,
    password,
    accessToken: body.accessToken,
    cookie,
  };
}

export function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

/** Headers for the cookie-authenticated refresh/logout routes. */
export function cookieRouteHeaders(cookie: string): Record<string, string> {
  return { cookie, origin: ORIGIN, 'content-type': 'application/json' };
}

const TUS_HEADERS = { 'tus-resumable': '1.0.0' };

/** Uploads bytes through the tus endpoint in chunks (over real HTTP) and returns the upload id. */
export async function tusUpload(
  context: Pick<TestContext, 'baseUrl'>,
  token: string,
  filename: string,
  bytes: Buffer,
  chunkSize = 1024,
): Promise<string> {
  const create = await fetch(`${context.baseUrl}/api/uploads`, {
    method: 'POST',
    headers: {
      ...TUS_HEADERS,
      authorization: `Bearer ${token}`,
      'upload-length': String(bytes.length),
      'upload-metadata': `filename ${Buffer.from(filename).toString('base64')}`,
    },
  });
  if (create.status !== 201)
    throw new Error(`tus create failed (${create.status}): ${await create.text()}`);
  const uploadId = (create.headers.get('location') ?? '').split('/').pop() ?? '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const patch = await fetch(`${context.baseUrl}/api/uploads/${uploadId}`, {
      method: 'PATCH',
      headers: {
        ...TUS_HEADERS,
        authorization: `Bearer ${token}`,
        'content-type': 'application/offset+octet-stream',
        'upload-offset': String(offset),
      },
      body: bytes.subarray(offset, offset + chunkSize),
    });
    if (patch.status !== 204)
      throw new Error(`tus patch failed (${patch.status}): ${await patch.text()}`);
  }
  return uploadId;
}

/** Uploads a file, creates a repository from it and waits until processing finished. */
export async function createRepository(
  context: TestContext,
  token: string,
  filename: string,
  bytes: Buffer,
  extra: Record<string, unknown> = {},
): Promise<{ id: string; status: string | null }> {
  const uploadId = await tusUpload(context, token, filename, bytes);
  const response = await context.app.inject({
    method: 'POST',
    url: '/api/models',
    headers: { authorization: `Bearer ${token}` },
    payload: { uploadId, name: filename.replace(/\.[^.]+$/, ''), ...extra },
  });
  if (response.statusCode !== 202)
    throw new Error(`create failed (${response.statusCode}): ${response.body}`);
  await context.app.processing.idle();
  const detail = await context.app.inject({
    method: 'GET',
    url: `/api/models/${response.json<{ id: string }>().id}`,
    headers: { authorization: `Bearer ${token}` },
  });
  return {
    id: detail.json<{ id: string }>().id,
    status: detail.json<{ status: string | null }>().status,
  };
}

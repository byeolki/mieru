import { afterAll, beforeAll, expect, it } from 'vitest';
import { createTestContext, type TestContext } from './helpers.js';

const lines: string[] = [];
let context: TestContext;

beforeAll(async () => {
  context = await createTestContext({
    env: { LOG_LEVEL: 'info' },
    logStream: { write: (line) => lines.push(line) },
  });
});

afterAll(async () => {
  await context.close();
});

it('keeps tokens, cookies and share links out of request logs', async () => {
  const secrets = {
    bearer: 'eyJhbGciOiJIUzI1NiJ9.secret-access-token',
    cookie: 'mieru_rt=secret-refresh-token',
    link: 'secret-share-link-token',
    ticket: 'secret-download-ticket',
  };
  await context.app.inject({
    url: `/api/models/00000000-0000-7000-8000-000000000000/file?ticket=${secrets.ticket}`,
    headers: {
      authorization: `Bearer ${secrets.bearer}`,
      cookie: secrets.cookie,
      'x-share-link': secrets.link,
    },
  });
  const log = lines.join('');
  expect(log).toContain('[redacted]');
  for (const secret of Object.values(secrets)) expect(log).not.toContain(secret);
});

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

export const FIXTURES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../server/test/fixtures/generated',
);
export const PASSWORD = 'correct horse battery staple';

export function uniqueEmail(prefix = 'e2e') {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

/** Signs up through the API (same origin, so the refresh cookie lands in the page context). */
export async function signUpViaApi(page: Page, email = uniqueEmail()) {
  const baseURL = new URL(
    page.url() === 'about:blank' ? '/' : page.url(),
    process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173',
  );
  const response = await page.request.post('/api/auth/signup', {
    data: { email, password: PASSWORD },
    headers: { origin: baseURL.origin },
  });
  if (!response.ok()) throw new Error(`signup failed: ${response.status()}`);
  return (await response.json()) as { accessToken: string; user: { username: string } };
}

/** Uploads a fixture through the new-model page and returns the repository URL. */
export async function createRepositoryViaUi(
  page: Page,
  file: string,
  options: { visibility?: string; readme?: string } = {},
) {
  await page.goto('/new');
  await page.getByLabel('모델 파일').setInputFiles(path.join(FIXTURES, file));
  await page.getByText('업로드 완료').waitFor({ timeout: 30_000 });
  if (options.readme) await page.getByLabel(/모델 소개 문서/).fill(options.readme);
  if (options.visibility) await page.getByText(options.visibility, { exact: true }).click();
  await page.getByRole('button', { name: '모델 만들기' }).click();
  await page.waitForURL(/\/m\/[0-9a-f-]{36}$/);
  return page.url();
}

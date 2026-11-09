import { expect, test } from '@playwright/test';

const backgroundOf = (page: import('@playwright/test').Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);

test.describe('color scheme', () => {
  test.use({ colorScheme: 'dark' });

  test('follows the system dark setting', async ({ page }) => {
    await page.goto('/explore');
    await expect(page.getByRole('heading', { name: '모델 둘러보기' })).toBeVisible();
    expect(await backgroundOf(page)).toBe('rgb(22, 15, 34)');
  });
});

test('uses the light paper background by default', async ({ page }) => {
  await page.goto('/explore');
  expect(await backgroundOf(page)).toBe('rgb(243, 236, 250)');
});

test('the header toggle switches to dark and remembers it after a reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '다크 모드로 바꾸기' }).click();
  await expect(page.getByRole('button', { name: '라이트 모드로 바꾸기' })).toBeVisible();
  expect(await backgroundOf(page)).toBe('rgb(22, 15, 34)');
  await page.reload();
  expect(await backgroundOf(page)).toBe('rgb(22, 15, 34)');
});

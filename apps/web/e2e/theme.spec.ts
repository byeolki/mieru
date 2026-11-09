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

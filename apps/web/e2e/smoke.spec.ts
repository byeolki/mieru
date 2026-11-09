import { expect, test } from '@playwright/test';

test('landing page shows the product pitch and primary action', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('모델을 올리면, 구조가 보여요');
  await expect(page.locator('figcaption')).toContainText('일본어로 ‘보인다’');
  await expect(page.getByRole('link', { name: '모델 올리기' }).first()).toBeVisible();
});

test('unknown routes show the not-found page', async ({ page }) => {
  await page.goto('/definitely-not-a-page');
  await expect(page.getByRole('heading', { name: '페이지를 찾을 수 없어요' })).toBeVisible();
});

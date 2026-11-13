import { expect, test } from '@playwright/test';
import { signUpViaApi } from './helpers.js';

// A 1×1 PNG; the page crops and re-encodes it to 256×256 before uploading.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('uploads a profile photo, keeps it after a reload and resets it', async ({ page }) => {
  await page.goto('/');
  await signUpViaApi(page);
  await page.goto('/settings');
  await page
    .getByLabel('프로필 사진 파일')
    .setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: TINY_PNG });

  const photo = page.locator('main img[src^="/api/avatars/"]').first();
  await expect(photo).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(page.locator('main img[src^="/api/avatars/"]').first()).toBeVisible();

  await page.getByRole('button', { name: '기본 이미지로' }).click();
  await expect(page.locator('main img[src^="/api/avatars/"]')).toHaveCount(0);
});

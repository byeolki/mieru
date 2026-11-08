import { expect, test } from '@playwright/test';
import { createRepositoryViaUi, signUpViaApi } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await signUpViaApi(page);
});

test('runs the MLP in the browser and matches the reference output', async ({ page }) => {
  await createRepositoryViaUi(page, 'tiny-mlp.onnx', { visibility: '공개' });
  await page.getByRole('link', { name: '실행' }).click();
  await page.getByRole('button', { name: /모델 불러오기/ }).click();
  await page.getByRole('button', { name: '실행', exact: true }).click();

  // Reference values computed with onnxruntime-web in Node for the default seeded input.
  const top = page.getByRole('list', { name: 'probabilities 상위 5개' });
  await expect(top.getByRole('listitem')).toHaveCount(3, { timeout: 30_000 });
  await expect(top.getByRole('listitem').nth(0)).toContainText('43.9%');
  await expect(top.getByRole('listitem').nth(1)).toContainText('37.8%');
  await expect(top.getByRole('listitem').nth(2)).toContainText('18.2%');
  await expect(page.getByRole('heading', { name: '레이어별 feature map' })).toBeVisible();
});

test('shows CNN feature maps and puts activation previews on graph nodes', async ({ page }) => {
  await createRepositoryViaUi(page, 'tiny-cnn.onnx', { visibility: '공개' });
  await page.getByRole('link', { name: '실행' }).click();
  await page.getByRole('button', { name: /모델 불러오기/ }).click();
  await page.getByRole('button', { name: '실행', exact: true }).click();

  await expect(
    page.getByRole('list', { name: 'logits 상위 5개' }).getByRole('listitem'),
  ).toHaveCount(5, {
    timeout: 30_000,
  });
  await expect(page.getByRole('heading', { name: '레이어별 feature map' })).toBeVisible();
  await expect(page.getByLabel('채널 0').first()).toBeVisible();

  await page.getByRole('link', { name: '그래프에서 보기' }).click();
  await expect(page.locator('.react-flow__node img').first()).toBeVisible({ timeout: 30_000 });
});

import { expect, test } from '@playwright/test';
import { createRepositoryViaUi, signUpViaApi } from './helpers.js';

test('shows a weight histogram and convolution filters, reachable from the graph', async ({
  page,
}) => {
  await page.goto('/');
  await signUpViaApi(page);
  await createRepositoryViaUi(page, 'tiny-cnn.onnx');

  await page.getByRole('link', { name: '가중치' }).click();
  await expect(page.getByRole('img', { name: /conv1\.weight 값 분포/ })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText('입력이 RGB 3채널이라 필터를 색으로 그렸어요.')).toBeVisible();
  await expect(page.getByLabel(/^필터 \d+$/)).toHaveCount(4);

  await page.getByRole('link', { name: '그래프' }).click();
  await page.locator('.react-flow__node').filter({ hasText: 'Gemm' }).click();
  await page.getByRole('link', { name: 'fc.weight' }).click();
  await expect(page.getByRole('img', { name: /fc\.weight 값 분포/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: '필터' })).toHaveCount(0);
});

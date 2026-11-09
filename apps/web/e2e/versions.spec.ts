import path from 'node:path';
import { expect, test } from '@playwright/test';
import { FIXTURES, createRepositoryViaUi, signUpViaApi } from './helpers.js';

test('pushes a second version and compares it with the first', async ({ page }) => {
  await page.goto('/');
  await signUpViaApi(page);
  const repoUrl = await createRepositoryViaUi(page, 'tiny-cnn.onnx');

  await page.getByRole('link', { name: /버전/ }).click();
  await page.getByLabel('새 버전 파일').setInputFiles(path.join(FIXTURES, 'tiny-cnn-v2.onnx'));
  await expect(page.getByText(/업로드 완료/)).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('변경 메모').fill('분기 A 다시 학습하고 Relu 추가');
  await page.getByRole('button', { name: '버전 만들기' }).click();

  const v2 = page.getByRole('listitem').filter({ hasText: 'v2' });
  await expect(v2.getByText('현재')).toBeVisible({ timeout: 30_000 });
  await expect(v2).toContainText('분기 A 다시 학습하고 Relu 추가');

  await page.getByLabel('v1 비교에 넣기').check();
  await page.getByLabel('v2 비교에 넣기').check();
  await page.getByRole('button', { name: 'v1 ↔ v2 비교' }).click();

  await expect(page).toHaveURL(`${repoUrl}/versions/compare?from=1&to=2`);
  const nodes = page
    .getByRole('region', { name: '달라진 노드' })
    .or(page.locator('section').filter({ hasText: '달라진 노드' }));
  await expect(nodes).toContainText('/block/branch_a/Conv');
  await expect(nodes).toContainText('가중치');
  await expect(nodes).toContainText('/head/act/Relu');
  await expect(page.locator('section').filter({ hasText: '달라진 가중치' })).toContainText(
    'branch_a.weight',
  );
  // The graph opens centered on the first changed node; nodes far below are not rendered yet.
  await expect(page.locator('.react-flow__node').filter({ hasText: '바뀜' })).toHaveCount(1);
});

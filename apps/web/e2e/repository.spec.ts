import { expect, test } from '@playwright/test';
import { createRepositoryViaUi, signUpViaApi } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await signUpViaApi(page);
});

test('upload an ONNX model with a README and explore its graph', async ({ page }) => {
  const url = await createRepositoryViaUi(page, 'tiny-cnn.onnx', {
    readme: '# Tiny CNN\n\n테스트용 모델이에요.',
  });

  await expect(page.getByRole('heading', { name: 'Tiny CNN' })).toBeVisible();
  const facts = page.getByRole('list', { name: '모델 정보' });
  await expect(facts).toContainText('파라미터468', { timeout: 30_000 });
  await expect(facts).toContainText('노드9');

  await page.goto(`${url}/graph`);
  const nodes = page.locator('.react-flow__node');
  await expect(nodes.filter({ hasText: 'Conv' })).toHaveCount(3, { timeout: 30_000 });
  await nodes.filter({ hasText: 'Conv' }).first().click();
  const inspector = page.getByLabel('노드 정보');
  await expect(inspector).toContainText('kernel_shape');
  await expect(inspector).toContainText('[3, 3]');
  await expect(inspector).toContainText('112');

  await page.getByPlaceholder('노드 이름이나 연산 검색').fill('Gemm');
  await page.getByRole('listbox').getByRole('button').first().click();
  await expect(inspector).toContainText('/head/fc/Gemm');

  await page.goto(`${url}/stats`);
  await expect(page.getByRole('heading', { name: '연산 종류' })).toBeVisible();
});

test('safetensors files open as a module tree', async ({ page }) => {
  const url = await createRepositoryViaUi(page, 'nested.safetensors');
  await page.goto(`${url}/graph`);
  const tree = page.getByRole('tree');
  await expect(tree.getByRole('treeitem').filter({ hasText: 'embed_tokens' })).toBeVisible({
    timeout: 30_000,
  });
  await tree.getByRole('button', { name: '0 펼치기' }).click();
  await expect(tree.getByRole('treeitem').filter({ hasText: 'self_attn' })).toBeVisible();
});

test('the dashboard lists my repositories', async ({ page }) => {
  await createRepositoryViaUi(page, 'tiny-mlp.onnx');
  await page.goto('/dashboard');
  await expect(page.getByRole('link', { name: /tiny-mlp/ })).toBeVisible();
});

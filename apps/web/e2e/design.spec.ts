import { expect, test } from '@playwright/test';
import { signUpViaApi } from './helpers.js';

test('flags a wrong in_features, fixes it, exports PyTorch and saves the design', async ({
  page,
}) => {
  await page.goto('/');
  await signUpViaApi(page);
  await page.goto('/designs/new');
  await page.getByRole('button', { name: 'MNIST 다층 퍼셉트론' }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(5);

  await page.locator('.react-flow__node').filter({ hasText: '784→256' }).click();
  await page.getByLabel('in_features').fill('100');
  await expect(page.getByText('맞지 않는 레이어 1개')).toBeVisible();
  await expect(
    page.locator('.react-flow__node').filter({ hasText: '모양이 맞지 않아요' }),
  ).toHaveCount(1);

  await page.getByRole('button', { name: '고치기' }).click();
  await expect(page.getByText('맞지 않는 레이어')).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: '출력 [1, 10]' })).toBeVisible();

  await page.getByRole('button', { name: 'PyTorch로 내보내기' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('nn.Linear(784, 256)');
  await expect(dialog).toContainText('# torch.Size([1, 10])');
  await page.keyboard.press('Escape');

  await page.getByLabel('설계 이름').fill('손글씨 분류기');
  await page.getByRole('button', { name: '저장' }).click();
  await expect(page).toHaveURL(/\/designs\/[0-9a-f-]{36}$/);
  await page.reload();
  await expect(page.getByLabel('설계 이름')).toHaveValue('손글씨 분류기');
  await expect(page.locator('.react-flow__node')).toHaveCount(5);
});

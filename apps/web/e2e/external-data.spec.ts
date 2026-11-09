import path from 'node:path';
import { expect, test } from '@playwright/test';
import { FIXTURES, signUpViaApi } from './helpers.js';

test('uploads an ONNX model with its external data file and downloads both', async ({ page }) => {
  await page.goto('/');
  await signUpViaApi(page);
  await page.goto('/new');
  await page
    .getByLabel('모델 파일')
    .setInputFiles([path.join(FIXTURES, 'external.onnx'), path.join(FIXTURES, 'model.onnx.data')]);
  await expect(page.getByText('외부 데이터 1개')).toBeVisible();
  await page.getByText('업로드 완료').waitFor({ timeout: 30_000 });
  await page.getByRole('button', { name: '모델 만들기' }).click();
  await page.waitForURL(/\/m\/[0-9a-f-]{36}$/);

  await page.getByRole('link', { name: /가중치/ }).click();
  await expect(page.getByText('w2').first()).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: '다운로드' }).click();
  const dialog = page.getByRole('dialog', { name: '파일 받기' });
  await expect(dialog.getByText('external.onnx')).toBeVisible();
  await expect(dialog.getByText('model.onnx.data')).toBeVisible();
});

test('names the missing data file when only the .onnx is uploaded', async ({ page }) => {
  await page.goto('/');
  await signUpViaApi(page);
  await page.goto('/new');
  await page.getByLabel('모델 파일').setInputFiles(path.join(FIXTURES, 'external.onnx'));
  await page.getByText('업로드 완료').waitFor({ timeout: 30_000 });
  await page.getByRole('button', { name: '모델 만들기' }).click();
  await expect(page.getByText('필요한 파일: model.onnx.data')).toBeVisible({ timeout: 30_000 });
});

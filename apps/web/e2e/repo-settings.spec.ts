import { expect, test, type Page } from '@playwright/test';
import { createRepositoryViaUi, signUpViaApi, uniqueEmail } from './helpers.js';

const repoTab = (page: Page, name: string) =>
  page.getByRole('navigation', { name: '저장소 탭' }).getByRole('link', { name });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await signUpViaApi(page);
});

test('the owner renames a repository and its address follows', async ({ page }) => {
  const url = await createRepositoryViaUi(page, 'tiny-mlp.onnx');
  await repoTab(page, '설정').click();
  await page.getByRole('textbox', { name: '이름', exact: true }).fill('Iris Classifier');
  await page.getByLabel(/한 줄 소개/).fill('붓꽃 3종 분류');
  await page.getByRole('button', { name: '변경 사항 저장' }).click();

  await expect(page).toHaveURL(/\/iris-classifier\/settings$/);
  await repoTab(page, '개요').click();
  await expect(page.getByRole('heading', { name: 'Iris Classifier', level: 1 })).toBeVisible();
  await expect(page.getByText('붓꽃 3종 분류')).toBeVisible();
  expect(page.url()).not.toBe(url);
});

test('the owner deletes a repository after typing its name', async ({ page }) => {
  const url = await createRepositoryViaUi(page, 'tiny-mlp.onnx');
  await page.goto(`${url}/settings`);
  await page.getByRole('button', { name: '저장소 삭제' }).click();

  const dialog = page.getByRole('dialog');
  const confirm = dialog.getByRole('button', { name: '저장소 영구 삭제' });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(/확인을 위해 저장소 이름/).fill('tiny-ml');
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(/확인을 위해 저장소 이름/).fill('tiny-mlp');
  await confirm.click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('link', { name: /tiny-mlp/ })).toHaveCount(0);
  await page.goto(url);
  await expect(page.getByRole('heading', { name: '페이지를 찾을 수 없어요' })).toBeVisible();
});

test('people without edit rights see no settings', async ({ page, browser }) => {
  const url = await createRepositoryViaUi(page, 'tiny-mlp.onnx', { visibility: '공개' });

  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  await visitor.goto('/');
  await signUpViaApi(visitor, uniqueEmail('visitor'));
  await visitor.goto(url);
  await expect(visitor.getByRole('heading', { name: 'tiny-mlp', level: 1 })).toBeVisible();
  await expect(repoTab(visitor, '설정')).toHaveCount(0);
  await visitor.goto(`${url}/settings`);
  await expect(visitor).toHaveURL(url);
  await visitorContext.close();
});

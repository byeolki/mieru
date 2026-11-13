import { expect, test } from '@playwright/test';
import { createRepositoryViaUi, signUpViaApi, uniqueEmail, REPO_URL } from './helpers.js';

test('share with a person by username, without download', async ({ page, browser }) => {
  await page.goto('/');
  await signUpViaApi(page);
  const repoUrl = await createRepositoryViaUi(page, 'tiny-cnn.onnx');

  const bobContext = await browser.newContext();
  const bobPage = await bobContext.newPage();
  await bobPage.goto('/');
  const bob = await signUpViaApi(bobPage, uniqueEmail('bob'));

  await page.getByRole('button', { name: '공유' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: /지정한 사람/ }).click();
  await dialog.getByLabel('사용자 이름으로 찾기').fill(bob.user.username);
  await dialog
    .getByRole('listbox', { name: '사용자 검색 결과' })
    .getByRole('button', { name: new RegExp(bob.user.username) })
    .click();
  await dialog.getByLabel(`${bob.user.username} 다운로드 허용`).click();
  await expect(dialog.getByLabel(`${bob.user.username} 다운로드 허용`)).not.toBeChecked();

  await bobPage.goto(repoUrl);
  await expect(bobPage.getByRole('heading', { name: 'tiny-cnn' })).toBeVisible();
  await expect(bobPage.getByRole('button', { name: '다운로드' })).toHaveCount(0);
  await expect(bobPage.getByRole('button', { name: '공유' })).toHaveCount(0);
  await bobPage.goto('/dashboard');
  await bobPage.getByRole('tab', { name: '공유받은 모델' }).click();
  await expect(bobPage.getByRole('tabpanel').getByRole('link', { name: /tiny-cnn/ })).toBeVisible();
  await bobContext.close();
});

test('an editor link opened while signed out only allows viewing; revoking it closes access', async ({
  page,
  browser,
}) => {
  await page.goto('/');
  await signUpViaApi(page);
  await createRepositoryViaUi(page, 'tiny-cnn.onnx');
  await page.getByRole('button', { name: '공유' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: /링크가 있는 사람/ }).click();
  await dialog.getByLabel('새 링크 권한').selectOption('editor');
  await dialog.getByRole('button', { name: '링크 만들기' }).click();
  const linkUrl = await dialog.locator('code').first().innerText();
  expect(linkUrl).toMatch(/\/s\/[A-Za-z0-9_-]+$/);

  const anonymous = await browser.newContext();
  const visitor = await anonymous.newPage();
  await visitor.goto(new URL(linkUrl).pathname);
  await expect(visitor).toHaveURL(REPO_URL);
  await expect(visitor.getByRole('heading', { name: 'tiny-cnn' })).toBeVisible();
  await expect(visitor.getByRole('button', { name: '다운로드' })).toHaveCount(0);
  await expect(visitor.getByRole('link', { name: '로그인' })).toBeVisible();

  await dialog.getByRole('button', { name: '링크 취소' }).click();
  const second = await anonymous.newPage();
  await second.goto(new URL(linkUrl).pathname);
  await expect(second.getByRole('heading', { name: '이 링크로는 볼 수 없어요' })).toBeVisible();
  await anonymous.close();
});

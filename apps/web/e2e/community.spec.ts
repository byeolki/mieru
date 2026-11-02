import { expect, test } from '@playwright/test';
import { createRepositoryViaUi, signUpViaApi, uniqueEmail } from './helpers.js';

test('README editing, node-linked issues, replies and stars', async ({ page, browser }) => {
  await page.goto('/');
  await signUpViaApi(page);
  const repoUrl = await createRepositoryViaUi(page, 'tiny-cnn.onnx', { visibility: '공개' });

  await page.getByRole('link', { name: 'README 쓰기' }).click();
  await page.getByLabel('README', { exact: true }).fill('# 작은 CNN\n\n분기가 두 개 있어요.');
  await page.getByRole('button', { name: '저장' }).click();
  await expect(page.getByRole('heading', { name: '작은 CNN' })).toBeVisible();

  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  await visitor.goto('/');
  await signUpViaApi(visitor, uniqueEmail('mio'));

  await visitor.goto(`${repoUrl}/graph`);
  await visitor.locator('.react-flow__node').filter({ hasText: 'BatchNormalization' }).click();
  await visitor.getByRole('button', { name: '이 노드로 이슈 열기' }).click();
  await expect(visitor.getByText('/stem/bn/BatchNormalization')).toBeVisible();
  await visitor.getByText('질문', { exact: true }).click();
  await visitor.getByLabel('제목').fill('epsilon 값이 왜 이렇게 작아요?');
  await visitor.getByLabel('내용', { exact: true }).fill('기본값이랑 다른 것 같아서요.');
  await visitor.getByRole('button', { name: '이슈 열기' }).click();
  await expect(visitor.getByRole('heading', { name: /epsilon 값이/ })).toBeVisible();

  await visitor.goto(`${repoUrl}/graph`);
  const bnNode = visitor.locator('.react-flow__node').filter({ hasText: 'BatchNormalization' });
  await expect(bnNode).toContainText('1');

  await visitor.goto(repoUrl);
  await visitor.getByRole('button', { name: /스타/ }).click();
  await expect(visitor.getByRole('button', { name: /스타함/ })).toContainText('1');

  await page.goto('/activity');
  await expect(page.getByText('epsilon 값이 왜 이렇게 작아요?')).toBeVisible();
  await page.getByText('epsilon 값이 왜 이렇게 작아요?').click();
  await page.getByRole('textbox', { name: '답글 쓰기' }).fill('PyTorch 기본값 그대로예요.');
  await page.getByRole('button', { name: '답글 달기' }).click();
  await expect(page.getByText('PyTorch 기본값 그대로예요.')).toBeVisible();
  await page.getByRole('button', { name: '이슈 닫기' }).click();
  await expect(page.getByText(/닫았어요/)).toBeVisible();

  await visitor.goto(`${repoUrl}/issues`);
  await expect(
    visitor.getByText('닫힌 이슈가 없어요').or(visitor.getByText('열린 이슈가 없어요')),
  ).toBeVisible();
  await visitorContext.close();
});

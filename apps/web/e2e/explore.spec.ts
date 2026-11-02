import { expect, test } from '@playwright/test';
import { createRepositoryViaUi, signUpViaApi } from './helpers.js';

test('public models show up in explore, search and the owner profile', async ({
  page,
  browser,
}) => {
  await page.goto('/');
  const { user } = await signUpViaApi(page);
  const keyword = `kirakira${Date.now().toString(36)}`;
  const repoUrl = await createRepositoryViaUi(page, 'tiny-cnn.onnx', {
    visibility: '공개',
    readme: `# ${keyword}\n\n둘러보기 테스트용 모델이에요.`,
  });

  const anonymous = await browser.newContext();
  const visitor = await anonymous.newPage();
  await visitor.goto('/explore');
  await expect(visitor.getByRole('heading', { name: '모델 둘러보기' })).toBeVisible();
  await visitor.getByRole('searchbox', { name: '모델 검색' }).fill(keyword);
  await visitor.getByRole('searchbox', { name: '모델 검색' }).press('Enter');
  await expect(visitor).toHaveURL(new RegExp(`q=${keyword}`));
  const result = visitor.getByRole('link', { name: new RegExp(user.username) }).first();
  await expect(result).toBeVisible();
  await result.click();
  await expect(visitor).toHaveURL(repoUrl);

  await visitor
    .getByRole('navigation', { name: '경로' })
    .getByRole('link', { name: user.username })
    .click();
  await expect(visitor.getByText(`@${user.username}`)).toBeVisible();
  await expect(visitor.getByRole('tabpanel').getByRole('link').first()).toBeVisible();
  await anonymous.close();
});

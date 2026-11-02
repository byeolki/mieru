import { expect, test } from '@playwright/test';

const password = 'correct horse battery staple';

function uniqueEmail() {
  return `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

test('sign up, keep the session across reloads, log out, log back in, delete the account', async ({
  page,
}) => {
  const email = uniqueEmail();

  await page.goto('/signup');
  await page.getByLabel('이메일').fill(email);
  await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await page.getByRole('button', { name: '계정 만들기' }).click();

  const welcome = page.getByRole('dialog', { name: '환영해요!' });
  await expect(welcome).toBeVisible();
  await welcome.getByRole('button', { name: '시작하기' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: '아직 올린 모델이 없어요' })).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: '설정' })).toBeVisible();
  await page.getByRole('button', { name: '계정 메뉴' }).click();
  await page.getByRole('menuitem', { name: '로그아웃' }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
  await page.getByLabel('이메일').fill(email);
  await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await page.getByRole('button', { name: '로그인' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto('/settings');
  const username = await page.getByLabel('사용자 이름', { exact: true }).inputValue();
  await page.getByLabel(/확인을 위해 사용자 이름/).fill(username);
  await page
    .locator('section')
    .filter({ hasText: '계정 삭제' })
    .getByLabel('현재 비밀번호')
    .fill(password);
  await page.getByRole('button', { name: '계정 영구 삭제' }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto('/login');
  await page.getByLabel('이메일').fill(email);
  await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await page.getByRole('button', { name: '로그인' }).click();
  await expect(page.getByRole('alert')).toHaveText('이메일이나 비밀번호가 맞지 않아요.');
});

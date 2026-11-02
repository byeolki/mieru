import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { createRepositoryViaUi, signUpViaApi, uniqueEmail } from './helpers.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function grantAdmin(username: string) {
  execFileSync('npm', ['run', 'admin', '-w', '@mieru/server', '--', 'grant', username], {
    cwd: REPO_ROOT,
    stdio: 'pipe',
  });
}

test('a visitor reports a repository and an admin takes it down, then restores it', async ({
  page,
  browser,
}) => {
  await page.goto('/');
  await signUpViaApi(page);
  const repoUrl = await createRepositoryViaUi(page, 'tiny-cnn.onnx', { visibility: '공개' });

  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  await visitor.goto(repoUrl);
  await visitor.getByRole('button', { name: '신고' }).click();
  await visitor.getByText('저작권 침해').click();
  await visitor.getByLabel(/자세한 내용/).fill('제 모델을 그대로 올렸어요');
  await visitor.getByRole('button', { name: '신고하기' }).click();
  await expect(visitor.getByText('신고를 접수했어요')).toBeVisible();
  await visitorContext.close();

  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await admin.goto('/');
  const { user } = await signUpViaApi(admin, uniqueEmail('admin'));
  grantAdmin(user.username);
  await admin.goto('/admin/reports');
  const row = admin.getByRole('listitem').filter({ hasText: '제 모델을 그대로 올렸어요' });
  await row.getByRole('button', { name: '저장소 내리기' }).click();
  await admin.getByLabel('사유').fill('원작자 신고로 내렸어요');
  await admin.getByRole('button', { name: '내리기', exact: true }).click();
  await expect(row).toHaveCount(0);

  await page.reload();
  await expect(page.getByText('운영 정책에 따라 내려간 저장소예요.')).toBeVisible();
  await expect(page.getByText('원작자 신고로 내렸어요')).toBeVisible();
  await expect(page.getByRole('button', { name: '다운로드' })).toHaveCount(0);

  const anonymous = await browser.newContext();
  const stranger = await anonymous.newPage();
  await stranger.goto(repoUrl);
  await expect(stranger.getByText(/찾을 수 없/).first()).toBeVisible();

  await admin.goto(repoUrl);
  await admin.getByRole('button', { name: '복구하기' }).click();
  await expect(admin.getByText('운영 정책에 따라 내려간 저장소예요.')).toHaveCount(0);
  await stranger.reload();
  await expect(stranger.getByRole('heading', { name: 'tiny-cnn' })).toBeVisible();
  await anonymous.close();
  await adminContext.close();
});

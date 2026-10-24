import type { Page } from '@playwright/test';

/** Drive the public UI; project identity and conversation identity remain separate. */
export async function newSessionForProject(
  page: Page,
  projectName: string,
  title = projectName,
): Promise<void> {
  await page.getByRole('tab', { name: 'Library', exact: true }).click();
  await page
    .getByRole('button', { name: `Open project ${projectName}`, exact: true })
    .click();
  await page.getByRole('button', { name: '新建会话', exact: true }).click();
  await page.getByRole('button', { name: '重命名会话', exact: true }).click();
  await page
    .getByRole('textbox', { name: '会话名称', exact: true })
    .fill(title);
  await page.getByRole('button', { name: '保存名称', exact: true }).click();
}

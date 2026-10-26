import type { PioneerDesktopApi } from '../../apps/desktop/src/shared/contracts/ipc';
import { newSessionForProject } from './session-ui';
import { _electron as electron, expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import {
  captureFixtureHash,
  captureFixtureHashAfterClose,
} from './fixture-integrity';

const repositoryRoot = process.cwd();
const desktopDir = path.join(repositoryRoot, 'apps', 'desktop');
const fixtureRoot = path.join(
  repositoryRoot,
  'tests',
  'fixtures',
  'workspaces',
  'library',
);
const electronExecutablePath = createRequire(
  path.join(desktopDir, 'package.json'),
)('electron') as string;

const launchApplication = async (userDataDir: string) =>
  electron.launch({
    executablePath: electronExecutablePath,
    args: [desktopDir],
    env: {
      ...process.env,
      PIONEER_E2E: '1',
      PIONEER_E2E_ROOT: fixtureRoot,
      PIONEER_E2E_USER_DATA: userDataDir,
    },
  });

test('moves an approved READY intent into an initialized runtime session without mutating fixtures', async ({}, testInfo) => {
  const beforeHash = await captureFixtureHash(fixtureRoot);
  const userDataDir = testInfo.outputPath('user-data');
  await mkdir(userDataDir, { recursive: true });

  const application = await launchApplication(userDataDir);

  try {
    const page = await application.firstWindow();
    await newSessionForProject(page, 'alpha-app');
    await page.getByRole('button', { name: '澄清任务', exact: true }).click();

    await expect(
      page.getByRole('tab', { name: /^(专注|审阅|交付)$/ }),
    ).toHaveCount(0);

    const instruction = page.getByRole('textbox', { name: '任务说明' });
    await instruction.fill(
      '统一项目导航；先生成最小安全计划，批准前不要执行。',
    );
    await page.getByRole('button', { name: '生成意图摘要' }).click();

    await expect(page.getByRole('heading', { name: '意图摘要' })).toBeVisible();
    await expect(page.getByText('REV 1', { exact: true })).toBeVisible();
    await expect(
      page.getByText('本地整理的摘要，尚未调用模型。'),
    ).toBeVisible();

    await page.getByRole('button', { name: '返回修改' }).click();
    await expect(instruction).toHaveValue(
      '统一项目导航；先生成最小安全计划，批准前不要执行。',
    );
    await instruction.fill(
      '统一项目导航；保留只读边界，并在批准前明确验证方式。',
    );
    await page.getByRole('button', { name: '生成意图摘要' }).click();
    await expect(page.getByText('REV 2', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: '确认摘要' }).click();
    await expect(page.getByText('READY', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: '初始化运行会话' }),
    ).toBeVisible();

    await page.getByRole('button', { name: '初始化运行会话' }).click();
    await expect(
      page.getByRole('heading', { name: '运行会话已初始化' }),
    ).toBeVisible();
    await expect(
      page.getByText('模型接入：按会话授权', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('工具执行：只读三件套', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('文件写入：关闭', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('运行器尚未连接', { exact: true }),
    ).toBeVisible();
    await expect(page.locator('.save-status')).toHaveText('已保存到本机');
    const saved = await page.evaluate(() =>
      (
        window as Window & { pioneer: PioneerDesktopApi }
      ).pioneer.loadSessionState(),
    );
    expect(
      saved?.sessions[0]?.intentState.runtime?.session.capabilities,
    ).toEqual({
      modelAccess: false,
      toolExecution: false,
      fileMutation: false,
    });
  } finally {
    try {
      await application.close();
    } finally {
      expect(await captureFixtureHashAfterClose(fixtureRoot)).toBe(beforeHash);
    }
  }
});

test('keeps Input drafts isolated and persistent across session tabs', async ({}, testInfo) => {
  const beforeHash = await captureFixtureHash(fixtureRoot);
  const userDataDir = testInfo.outputPath('user-data');
  await mkdir(userDataDir, { recursive: true });

  const application = await launchApplication(userDataDir);

  try {
    const page = await application.firstWindow();

    await newSessionForProject(page, 'alpha-app');
    await page.getByRole('button', { name: '澄清任务', exact: true }).click();
    await page.getByRole('tab', { name: 'Library' }).click();
    await newSessionForProject(page, 'beta-notes');
    await page.getByRole('button', { name: '澄清任务', exact: true }).click();

    await page.getByRole('tab', { name: 'alpha-app' }).click();
    await page.getByRole('button', { name: '澄清任务', exact: true }).click();
    await page
      .getByRole('textbox', { name: '任务说明' })
      .fill('alpha 独立草稿');

    await page.getByRole('tab', { name: 'beta-notes' }).click();
    await page.getByRole('button', { name: '澄清任务', exact: true }).click();
    await expect(page.getByRole('textbox', { name: '任务说明' })).toHaveValue(
      '',
    );
    await page.getByRole('textbox', { name: '任务说明' }).fill('beta 独立草稿');

    await page.getByRole('tab', { name: 'alpha-app' }).click();
    await expect(page.getByRole('textbox', { name: '任务说明' })).toHaveValue(
      'alpha 独立草稿',
    );

    await page.getByRole('tab', { name: 'beta-notes' }).click();
    await expect(page.getByRole('textbox', { name: '任务说明' })).toHaveValue(
      'beta 独立草稿',
    );
  } finally {
    try {
      await application.close();
    } finally {
      expect(await captureFixtureHashAfterClose(fixtureRoot)).toBe(beforeHash);
    }
  }
});

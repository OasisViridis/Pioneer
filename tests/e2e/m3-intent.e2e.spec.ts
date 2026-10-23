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

test('moves an approved READY intent into a local runtime start-request event stream without mutating fixtures', async ({}, testInfo) => {
  const beforeHash = await captureFixtureHash(fixtureRoot);
  const userDataDir = testInfo.outputPath('user-data');
  await mkdir(userDataDir, { recursive: true });

  const application = await launchApplication(userDataDir);

  try {
    const page = await application.firstWindow();
    await page.getByRole('button', { name: 'Open project alpha-app' }).click();

    await expect(page.getByRole('button', { name: '输入' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByRole('button', { name: '审阅' })).toBeDisabled();
    await expect(page.getByRole('button', { name: '输出' })).toBeDisabled();
    await expect(page.getByRole('button', { name: '自定' })).toBeDisabled();

    const instruction = page.getByRole('textbox', { name: '任务说明' });
    await instruction.fill(
      '统一项目导航；先生成最小安全计划，批准前不要执行。',
    );
    await page.getByRole('button', { name: '生成意图计划' }).click();

    await expect(page.getByRole('heading', { name: '意图审阅' })).toBeVisible();
    await expect(page.getByText('REV 1', { exact: true })).toBeVisible();
    await expect(page.getByText('执行尚未开始。')).toBeVisible();

    await page.getByRole('button', { name: '返回修改' }).click();
    await expect(instruction).toHaveValue(
      '统一项目导航；先生成最小安全计划，批准前不要执行。',
    );
    await instruction.fill(
      '统一项目导航；保留只读边界，并在批准前明确验证方式。',
    );
    await page.getByRole('button', { name: '生成意图计划' }).click();
    await expect(page.getByText('REV 2', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: '批准计划' }).click();
    await expect(page.getByText('READY', { exact: true })).toBeVisible();
    await expect(
      page.getByText(/初始化只锁定已批准意图，不会启动模型/),
    ).toBeVisible();

    await page.getByRole('button', { name: '初始化运行会话' }).click();
    await expect(
      page.getByRole('heading', { name: '运行会话已初始化' }),
    ).toBeVisible();
    await expect(
      page.getByText('模型接入：关闭', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('工具执行：关闭', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('文件写入：关闭', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/执行仍未开始/)).toBeVisible();
    await expect(
      page.getByText('session.initialized', { exact: true }),
    ).toBeVisible();

    const eventStream = page.locator(
      'section[aria-label="Runtime event stream"] li',
    );
    await expect(eventStream).toHaveCount(1);

    await page.getByRole('button', { name: '请求启动 Runtime' }).click();
    await expect(
      page.getByRole('heading', { name: '启动请求已记录' }),
    ).toBeVisible();
    await expect(
      page.getByText('runtime.start_requested', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: '启动请求已记录' }),
    ).toBeDisabled();
    await expect(page.getByText(/执行仍未开始/)).toBeVisible();
    await expect(eventStream).toHaveCount(2);
    await expect(eventStream.nth(0)).toContainText('session.initialized');
    await expect(eventStream.nth(1)).toContainText('runtime.start_requested');
    await expect(
      page.getByText('模型接入：关闭', { exact: true }),
    ).toBeVisible();
  } finally {
    try {
      await application.close();
    } finally {
      expect(await captureFixtureHashAfterClose(fixtureRoot)).toBe(beforeHash);
    }
  }
});

test('keeps Input drafts isolated and persistent across project tabs', async ({}, testInfo) => {
  const beforeHash = await captureFixtureHash(fixtureRoot);
  const userDataDir = testInfo.outputPath('user-data');
  await mkdir(userDataDir, { recursive: true });

  const application = await launchApplication(userDataDir);

  try {
    const page = await application.firstWindow();

    await page.getByRole('button', { name: 'Open project alpha-app' }).click();
    await page.getByRole('tab', { name: 'Library' }).click();
    await page.getByRole('button', { name: 'Open project beta-notes' }).click();

    await page.getByRole('tab', { name: 'alpha-app' }).click();
    await page
      .getByRole('textbox', { name: '任务说明' })
      .fill('alpha 独立草稿');

    await page.getByRole('tab', { name: 'beta-notes' }).click();
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

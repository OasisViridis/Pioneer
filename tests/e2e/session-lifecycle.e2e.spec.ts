import { _electron as electron, expect, test } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, stat, readFile } from 'node:fs/promises';
import { SESSION_STATE_FILE_NAME } from '../../apps/desktop/src/main/session-state-store';
import { createRequire } from 'node:module';
import path from 'node:path';
import {
  captureFixtureHash,
  captureFixtureHashAfterClose,
} from './fixture-integrity';

const desktopDir = path.join(process.cwd(), 'apps', 'desktop');
const fixtureRoot = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'workspaces',
  'library',
);
const executablePath = createRequire(path.join(desktopDir, 'package.json'))(
  'electron',
) as string;

test('a second process cannot open another writer for the same profile', async ({}, testInfo) => {
  const beforeHash = await captureFixtureHash(fixtureRoot);
  const userData = testInfo.outputPath('user-data');
  await mkdir(userData, { recursive: true });
  const env = {
    ...process.env,
    PIONEER_E2E: '1',
    PIONEER_E2E_ROOT: fixtureRoot,
    PIONEER_E2E_USER_DATA: userData,
  };
  const app = await electron.launch({
    executablePath,
    args: [desktopDir],
    env,
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'Open project alpha-app' }).click();
    await page.getByRole('button', { name: '新建会话', exact: true }).click();
    await page
      .getByRole('textbox', { name: '给 Agent 的消息' })
      .fill('只允许一个写入者');
    const child = spawn(executablePath, [desktopDir], {
      env,
      windowsHide: true,
      stdio: 'ignore',
    });
    try {
      const exited = new Promise<number | null>((resolve, reject) => {
        child.once('exit', resolve);
        child.once('error', reject);
      });
      await expect(exited).resolves.toBe(0);
      await expect(
        page.getByRole('textbox', { name: '给 Agent 的消息' }),
      ).toHaveValue('只允许一个写入者');
      expect(app.windows()).toHaveLength(1);
    } finally {
      if (child.exitCode === null) child.kill();
    }
  } finally {
    await app.close();
    expect(await captureFixtureHashAfterClose(fixtureRoot)).toBe(beforeHash);
  }
});

test('reload with an in-flight save preserves the window and draft, then safely reloads', async ({}, testInfo) => {
  const beforeHash = await captureFixtureHash(fixtureRoot);
  const userData = testInfo.outputPath('user-data');
  await mkdir(userData, { recursive: true });
  const app = await electron.launch({
    executablePath,
    args: [desktopDir],
    env: {
      ...process.env,
      PIONEER_E2E: '1',
      PIONEER_E2E_ROOT: fixtureRoot,
      PIONEER_E2E_USER_DATA: userData,
      PIONEER_E2E_SESSION_SAVE_DELAY_MS: '500',
    },
  });
  try {
    const page = await app.firstWindow();
    // Electron cancels beforeunload without a Chromium dialog to dismiss. Prevent
    // Playwright's browser-only auto-dismiss path from issuing an invalid CDP call.
    page.on('dialog', (dialog) => {
      expect(dialog.type()).toBe('beforeunload');
    });
    await page.getByRole('button', { name: 'Open project alpha-app' }).click();
    await page.getByRole('button', { name: '新建会话', exact: true }).click();
    await expect(page.locator('.save-status')).toHaveText('已保存到本机');
    await page
      .getByRole('textbox', { name: '给 Agent 的消息' })
      .fill('刷新不能变成关闭窗口');
    await expect(page.locator('.save-status')).toHaveText('正在保存到本机…');
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.reload();
    });
    await expect(page.locator('.save-status')).toHaveText(
      '已保存到本机，请再次刷新。',
    );
    await expect(
      page.getByRole('textbox', { name: '给 Agent 的消息' }),
    ).toHaveValue('刷新不能变成关闭窗口');
    const reloaded = page.waitForEvent('load');
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.reload();
    });
    await reloaded;
    await expect(
      page.getByRole('textbox', { name: '给 Agent 的消息' }),
    ).toHaveValue('刷新不能变成关闭窗口');
    await expect(page.locator('.save-status')).toHaveText('已保存到本机');
  } finally {
    await app.close();
    expect(await captureFixtureHashAfterClose(fixtureRoot)).toBe(beforeHash);
  }
});

test('canceling a slow close prevents its late save completion from closing the window', async ({}, testInfo) => {
  const beforeHash = await captureFixtureHash(fixtureRoot);
  const userData = testInfo.outputPath('user-data');
  await mkdir(userData, { recursive: true });
  const app = await electron.launch({
    executablePath,
    args: [desktopDir],
    env: {
      ...process.env,
      PIONEER_E2E: '1',
      PIONEER_E2E_ROOT: fixtureRoot,
      PIONEER_E2E_USER_DATA: userData,
      PIONEER_E2E_SESSION_SAVE_DELAY_MS: '1500',
    },
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'Open project alpha-app' }).click();
    await page.getByRole('button', { name: '新建会话', exact: true }).click();
    await page
      .getByRole('textbox', { name: '给 Agent 的消息' })
      .fill('取消关闭后继续保留');
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.close();
    });
    await page.getByRole('button', { name: '继续使用', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page
      .getByRole('textbox', { name: '给 Agent 的消息' })
      .fill('取消后仍然可以修改');
    await expect(page.locator('.save-status')).toHaveText('已保存到本机', {
      timeout: 6000,
    });
    await expect(
      page.getByRole('textbox', { name: '给 Agent 的消息' }),
    ).toHaveValue('取消后仍然可以修改');
  } finally {
    await app.close();
    expect(await captureFixtureHashAfterClose(fixtureRoot)).toBe(beforeHash);
  }
});

test('closing without retry preserves the obstructing target after a save failure', async ({}, testInfo) => {
  const beforeHash = await captureFixtureHash(fixtureRoot);
  const userData = testInfo.outputPath('user-data');
  await mkdir(userData, { recursive: true });
  const app = await electron.launch({
    executablePath,
    args: [desktopDir],
    env: {
      ...process.env,
      PIONEER_E2E: '1',
      PIONEER_E2E_ROOT: fixtureRoot,
      PIONEER_E2E_USER_DATA: userData,
    },
  });
  const target = path.join(userData, SESSION_STATE_FILE_NAME);
  try {
    const page = await app.firstWindow();
    await expect(
      page.getByRole('button', { name: 'Open project alpha-app' }),
    ).toBeVisible();
    await mkdir(target);
    await page.getByRole('button', { name: 'Open project alpha-app' }).click();
    await page.getByRole('button', { name: '新建会话', exact: true }).click();
    await expect(
      page.getByRole('button', { name: '重试保存', exact: true }),
    ).toBeVisible();
    // Empty-session decoration must not accompany a real persistence error.
    await expect(page.locator('.hazel-companion')).toHaveCount(0);
    await page.getByRole('button', { name: '上下文', exact: true }).click();
    await expect(
      page.getByRole('button', { name: '重试保存', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.hazel-companion')).toHaveCount(0);
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.close();
    });
    const process = app.process();
    const closed = page.waitForEvent('close');
    await page
      .getByRole('button', { name: '不再重试并关闭', exact: true })
      .click();
    await closed;
    await expect.poll(() => process.exitCode).toBe(0);
    expect((await stat(target)).isDirectory()).toBe(true);
  } finally {
    // A failed assertion must not strand this isolated error-profile behind
    // its save-confirmation dialog and mask the original regression failure.
    const page = app.windows()[0];
    if (page && !page.isClosed()) {
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.close();
      });
      if (!page.isClosed())
        await page
          .getByRole('button', { name: '不再重试并关闭', exact: true })
          .click({ timeout: 4000 });
    }
    await app.close();
    expect(await captureFixtureHashAfterClose(fixtureRoot)).toBe(beforeHash);
  }
});

test('closing without retry after timeout still waits for an accepted atomic write', async ({}, testInfo) => {
  const before = await captureFixtureHash(fixtureRoot);
  const userData = testInfo.outputPath('user-data');
  await mkdir(userData, { recursive: true });
  const app = await electron.launch({
    executablePath,
    args: [desktopDir],
    env: {
      ...process.env,
      PIONEER_E2E: '1',
      PIONEER_E2E_ROOT: fixtureRoot,
      PIONEER_E2E_USER_DATA: userData,
      PIONEER_E2E_SESSION_SAVE_DELAY_MS: '9000',
    },
  });
  const processHandle = app.process();
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'Open project alpha-app' }).click();
    await page.getByRole('button', { name: '新建会话', exact: true }).click();
    await expect(page.locator('.save-status')).toHaveText('正在保存到本机…');
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.close(),
    );
    const closeButton = page.getByRole('button', {
      name: '不再重试并关闭',
      exact: true,
    });
    await expect(closeButton).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByText('尚未确认保存，窗口尚未关闭。已开始的保存仍会完成。', {
        exact: true,
      }),
    ).toBeVisible();
    const closed = page.waitForEvent('close');
    await closeButton.click();
    await closed;
    await expect.poll(() => processHandle.exitCode).toBe(0);
    const record = JSON.parse(
      await readFile(path.join(userData, SESSION_STATE_FILE_NAME), 'utf8'),
    ) as { version: number; state: { sessions: unknown[] } };
    expect(record.version).toBe(4);
    expect(record.state.sessions).toHaveLength(1);
  } finally {
    await app.close();
    expect(await captureFixtureHashAfterClose(fixtureRoot)).toBe(before);
  }
});

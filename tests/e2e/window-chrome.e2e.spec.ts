import {
  _electron as electron,
  expect,
  test,
  type Page,
  type ElectronApplication,
} from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, readFile, rmdir, stat, writeFile } from 'node:fs/promises';
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

function isolatedEnv(userData: string, extra: Record<string, string> = {}) {
  return {
    ...process.env,
    PIONEER_E2E: '1',
    PIONEER_E2E_ROOT: fixtureRoot,
    PIONEER_E2E_USER_DATA: userData,
    ...extra,
  };
}
async function launch(userData: string, extra: Record<string, string> = {}) {
  await mkdir(userData, { recursive: true });
  return electron.launch({
    executablePath,
    args: [desktopDir],
    env: isolatedEnv(userData, extra),
  });
}
async function createDraft(page: Page, text: string) {
  await page.getByRole('button', { name: '选择工作区 alpha-app' }).click();
  await page.getByRole('button', { name: '新建会话', exact: true }).click();
  await page.getByRole('textbox', { name: '给 Agent 的消息' }).fill(text);
}
async function quitMenu(page: Page) {
  await page.getByLabel('窗口菜单', { exact: true }).click();
  await page.getByRole('button', { name: '退出 Pioneer', exact: true }).click();
}
async function secondInstance(userData: string) {
  const child = spawn(executablePath, [desktopDir], {
    env: isolatedEnv(userData),
    windowsHide: true,
    stdio: 'ignore',
  });
  try {
    const exited = new Promise<number | null>((resolve, reject) => {
      child.once('exit', resolve);
      child.once('error', reject);
    });
    await expect(exited).resolves.toBe(0);
  } finally {
    if (child.exitCode === null) child.kill();
  }
}
async function cleanup(app: ElectronApplication, hash: string) {
  await app.close();
  expect(await captureFixtureHashAfterClose(fixtureRoot)).toBe(hash);
}

test('second-instance requests before catalog initialization coalesce into one real window', async ({}, info) => {
  const hash = await captureFixtureHash(fixtureRoot);
  const userData = info.outputPath('user-data');
  const app = await launch(userData, {
    PIONEER_E2E_INITIALIZE_DELAY_MS: '2000',
  });
  try {
    expect(
      await app.evaluate(
        ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
      ),
    ).toBe(0);
    await secondInstance(userData);
    await secondInstance(userData);
    const page = await app.firstWindow();
    await expect(
      page.getByRole('button', { name: '选择工作区 alpha-app' }),
    ).toBeVisible();
    expect(app.windows()).toHaveLength(1);
    await createDraft(page, '启动重开只创建一个写入者');
    await expect(page.locator('.save-status')).toHaveText('已保存到本机');
  } finally {
    await cleanup(app, hash);
  }
});

test('window controls cross the actual preload boundary without changing the session draft', async ({}, testInfo) => {
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
  try {
    const page = await app.firstWindow();
    await expect(
      page.getByRole('button', { name: '关闭窗口', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: '最小化窗口', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: '进入全屏', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: '选择工作区 alpha-app' }).click();
    await page.getByRole('button', { name: '新建会话', exact: true }).click();
    const draft = page.getByRole('textbox', { name: '给 Agent 的消息' });
    await draft.fill('窗口动作不改变这条草稿');
    const before = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.getNormalBounds(),
    );
    await page.getByRole('button', { name: '进入全屏', exact: true }).click();
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0]?.isFullScreen(),
        ),
      )
      .toBe(true);
    await expect(
      page.getByRole('button', { name: '退出全屏', exact: true }),
    ).toBeEnabled();
    await page.getByRole('button', { name: '退出全屏', exact: true }).click();
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0]?.isFullScreen(),
        ),
      )
      .toBe(false);
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0]?.getNormalBounds(),
        ),
      )
      .toEqual(before);
    await expect(draft).toHaveValue('窗口动作不改变这条草稿');
    await page.getByRole('button', { name: '最小化窗口', exact: true }).click();
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0]?.isMinimized(),
        ),
      )
      .toBe(true);
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.restore();
    });
    await expect(draft).toHaveValue('窗口动作不改变这条草稿');
  } finally {
    await app.close();
    expect(await captureFixtureHashAfterClose(fixtureRoot)).toBe(beforeHash);
  }
});

test('maximize is distinct from fullscreen and both preserve normal bounds and draft', async ({}, info) => {
  const hash = await captureFixtureHash(fixtureRoot);
  const app = await launch(info.outputPath('user-data'));
  try {
    const page = await app.firstWindow();
    await createDraft(page, '最大化不等于全屏');
    const original = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.getNormalBounds(),
    );
    await page.getByLabel('窗口菜单', { exact: true }).click();
    await page.getByRole('button', { name: '最大化窗口', exact: true }).click();
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0]?.isMaximized(),
        ),
      )
      .toBe(true);
    await page.getByRole('button', { name: '进入全屏', exact: true }).click();
    await expect(
      page.getByRole('button', { name: '退出全屏', exact: true }),
    ).toBeEnabled();
    await page.getByLabel('窗口菜单', { exact: true }).click();
    await expect(
      page.getByRole('button', { name: /最大化窗口|还原窗口/ }),
    ).toBeDisabled();
    await expect(
      page.getByText('请先退出全屏，再最大化或还原。', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: '退出全屏', exact: true }).click();
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) => ({
          full: BrowserWindow.getAllWindows()[0]?.isFullScreen(),
          max: BrowserWindow.getAllWindows()[0]?.isMaximized(),
        })),
      )
      .toEqual({ full: false, max: true });
    await page.getByLabel('窗口菜单', { exact: true }).click();
    await page.getByRole('button', { name: '还原窗口', exact: true }).click();
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0]?.getNormalBounds(),
        ),
      )
      .toEqual(original);
    await expect(
      page.getByRole('textbox', { name: '给 Agent 的消息' }),
    ).toHaveValue('最大化不等于全屏');
  } finally {
    await cleanup(app, hash);
  }
});

test('red closes only the window, same-profile second instance reopens one writer, explicit quit ends it', async ({}, info) => {
  const hash = await captureFixtureHash(fixtureRoot);
  const userData = info.outputPath('user-data');
  const app = await launch(userData, {
    PIONEER_E2E_SESSION_SAVE_DELAY_MS: '250',
  });
  try {
    const page = await app.firstWindow();
    await createDraft(page, '红点保留会话和草稿');
    const tabs = await page.locator('.tab-strip [role="tab"]').count();
    expect(tabs).toBe(1);
    const closed = page.waitForEvent('close');
    await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
    await closed;
    expect(app.process().exitCode).toBeNull();
    expect(
      await app.evaluate(
        ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
      ),
    ).toBe(0);
    const opened = app.waitForEvent('window');
    await secondInstance(userData);
    const reopened = await opened;
    await expect(
      reopened.getByRole('textbox', { name: '给 Agent 的消息' }),
    ).toHaveValue('红点保留会话和草稿');
    expect(await reopened.locator('.tab-strip [role="tab"]').count()).toBe(
      tabs,
    );
    await secondInstance(userData);
    expect(app.windows()).toHaveLength(1);
    await expect(
      reopened.getByRole('button', { name: '进入全屏', exact: true }),
    ).toBeEnabled();
    const quit = app.waitForEvent('close');
    await quitMenu(reopened);
    await quit;
  } finally {
    await cleanup(app, hash);
  }
});

test('tray failure keeps an actionable window and does not silently turn red into quit', async ({}, info) => {
  const hash = await captureFixtureHash(fixtureRoot);
  const app = await launch(info.outputPath('user-data'), {
    PIONEER_E2E_TRAY_MODE: 'fail',
  });
  try {
    const page = await app.firstWindow();
    await expect(
      page.getByText('托盘不可用，已保留窗口。请用窗口菜单退出 Pioneer。', {
        exact: true,
      }),
    ).toBeVisible();
    await createDraft(page, '托盘失败也不丢草稿');
    await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
    await expect(
      page.getByRole('textbox', { name: '给 Agent 的消息' }),
    ).toHaveValue('托盘失败也不丢草稿');
    expect(app.windows()).toHaveLength(1);
    const quit = app.waitForEvent('close');
    await quitMenu(page);
    await quit;
  } finally {
    await cleanup(app, hash);
  }
});

test('canceling explicit quit clears app intent and a later ordinary red close remains ordinary', async ({}, info) => {
  const hash = await captureFixtureHash(fixtureRoot);
  const app = await launch(info.outputPath('user-data'), {
    PIONEER_E2E_SESSION_SAVE_DELAY_MS: '1500',
  });
  try {
    const page = await app.firstWindow();
    await createDraft(page, '取消退出不继承退出意图');
    await quitMenu(page);
    await page.getByRole('button', { name: '取消关闭', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.save-status')).toHaveText('已保存到本机', {
      timeout: 7000,
    });
    const closed = page.waitForEvent('close');
    await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
    await closed;
    expect(app.process().exitCode).toBeNull();
    expect(
      await app.evaluate(
        ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
      ),
    ).toBe(0);
  } finally {
    await cleanup(app, hash);
  }
});

test('a real failed save cancels explicit quit; repair and retry close only the window', async ({}, info) => {
  const hash = await captureFixtureHash(fixtureRoot);
  const userData = info.outputPath('user-data');
  const app = await launch(userData);
  const target = path.join(userData, SESSION_STATE_FILE_NAME);
  try {
    const page = await app.firstWindow();
    await expect(
      page.getByRole('button', { name: '选择工作区 alpha-app' }),
    ).toBeVisible();
    await mkdir(target);
    await createDraft(page, '失败后退出意图清除');
    await expect(
      page.getByRole('button', { name: '重试保存', exact: true }),
    ).toBeVisible();
    await quitMenu(page);
    await expect(
      page.getByRole('button', { name: '重试并关闭', exact: true }),
    ).toBeVisible();
    expect((await stat(target)).isDirectory()).toBe(true);
    await rmdir(target); // This test-created empty obstruction only; never workspace data.
    const closed = page.waitForEvent('close');
    await page.getByRole('button', { name: '重试并关闭', exact: true }).click();
    await closed;
    expect(app.process().exitCode).toBeNull();
    expect(await readFile(target, 'utf8')).toContain('失败后退出意图清除');
  } finally {
    const page = app.windows()[0];
    if (page && !page.isClosed()) {
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.close();
      });
      if (!page.isClosed())
        await page
          .getByRole('button', { name: '放弃未保存更改并关闭', exact: true })
          .click({ timeout: 4000 });
    }
    await cleanup(app, hash);
  }
});

test('restore failure leaves window controls accessible and quit preserves corrupt bytes', async ({}, info) => {
  const hash = await captureFixtureHash(fixtureRoot);
  const userData = info.outputPath('user-data');
  await mkdir(userData, { recursive: true });
  const target = path.join(userData, SESSION_STATE_FILE_NAME);
  const corrupt = '{ corrupt snapshot stays untouched';
  await writeFile(target, corrupt, 'utf8');
  const app = await launch(userData);
  try {
    const page = await app.firstWindow();
    await expect(
      page.getByRole('heading', { name: '暂时无法恢复会话' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: '关闭窗口', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: '最小化窗口', exact: true }).click();
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0]?.isMinimized(),
        ),
      )
      .toBe(true);
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.restore();
    });
    const quit = app.waitForEvent('close');
    await quitMenu(page);
    await quit;
    expect(await readFile(target, 'utf8')).toBe(corrupt);
  } finally {
    await cleanup(app, hash);
  }
});

test('renderer crash invalidates a pending quit/save close and the recovered renderer stays actionable', async ({}, info) => {
  const hash = await captureFixtureHash(fixtureRoot);
  const app = await launch(info.outputPath('user-data'), {
    PIONEER_E2E_SESSION_SAVE_DELAY_MS: '1500',
  });
  try {
    const page = await app.firstWindow();
    await createDraft(page, '先保存会话');
    await expect(page.locator('.save-status')).toHaveText('已保存到本机', {
      timeout: 7000,
    });
    await page
      .getByRole('textbox', { name: '给 Agent 的消息' })
      .fill('已接受写入需等待，新页面不继承旧退出');
    await expect(page.locator('.save-status')).toHaveText('正在保存到本机…');
    const crashed = page.waitForEvent('crash');
    await app.evaluate(({ app, BrowserWindow }) => {
      app.quit();
      BrowserWindow.getAllWindows()[0]?.webContents.forcefullyCrashRenderer();
    });
    await crashed;
    await app.evaluate(
      ({ BrowserWindow }) =>
        new Promise<void>((resolve) => {
          const w = BrowserWindow.getAllWindows()[0];
          if (!w) throw new Error('Native window lost after crash');
          w.webContents.once('did-finish-load', () => {
            resolve();
          });
          w.webContents.reload();
        }),
    );
    // Playwright 1.62 marks its Page permanently crashed. Read the recovered
    // real renderer through Electron, not that dead CDP Page or a fake DOM.
    await expect
      .poll(
        () =>
          app.evaluate(async ({ BrowserWindow }) => {
            const w = BrowserWindow.getAllWindows()[0];
            if (!w) return false;
            const snapshot: unknown = await w.webContents.executeJavaScript(
              `({ draft: document.querySelector('[aria-label="给 Agent 的消息"]')?.value, enabled: !document.querySelector('[aria-label="进入全屏"]')?.disabled })`,
            );
            return snapshot;
          }),
        { timeout: 9000 },
      )
      .toEqual({
        draft: '已接受写入需等待，新页面不继承旧退出',
        enabled: true,
      });
    await expect
      .poll(() =>
        app.evaluate(
          ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
        ),
      )
      .toBe(1);
    await app.evaluate(async ({ BrowserWindow }) => {
      await BrowserWindow.getAllWindows()[0]?.webContents.executeJavaScript(
        'window.pioneer.closeWindow()',
      );
    });
    await expect
      .poll(() =>
        app.evaluate(
          ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
        ),
      )
      .toBe(0);
    expect(app.process().exitCode).toBeNull();
  } catch (error) {
    const diagnostic = await app.evaluate(async ({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      if (!w) return { windows: 0 };
      const renderer: unknown = await w.webContents
        .executeJavaScript(
          '({ ready:document.readyState, text:document.body.innerText, api:typeof window.pioneer })',
        )
        .catch((e: unknown) => String(e));
      return {
        windows: BrowserWindow.getAllWindows().length,
        destroyed: w.isDestroyed(),
        loading: w.webContents.isLoading(),
        url: w.webContents.getURL(),
        renderer,
      };
    });
    await info.attach('crash-recovery-native-diagnostic', {
      body: JSON.stringify(diagnostic),
      contentType: 'application/json',
    });
    throw error;
  } finally {
    await cleanup(app, hash);
  }
});

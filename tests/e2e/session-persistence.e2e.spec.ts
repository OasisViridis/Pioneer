import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdir, readFile, rmdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { PioneerDesktopApi } from '../../apps/desktop/src/shared/contracts/ipc';

import type { SessionDesktopApi } from '../../apps/desktop/src/shared/contracts/session-ipc';
import { SESSION_STATE_FILE_NAME } from '../../apps/desktop/src/main/session-state-store';
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

interface TestInfoLike {
  outputPath(path: string): string;
}

type TestRendererWindow = Window & { pioneer: PioneerDesktopApi };

/** P1 candidate only: fail explicitly when the session preload has not been wired. */
async function readActivity(page: Page) {
  return page.evaluate(() => {
    const api = (
      window as Window & {
        pioneer: PioneerDesktopApi &
          Partial<Pick<SessionDesktopApi, 'getSessionActivity'>>;
      }
    ).pioneer;
    if (typeof api.getSessionActivity !== 'function')
      throw new Error('P1 session activity API is not connected.');
    return api.getSessionActivity();
  });
}

function launch(
  userDataDir: string,
  overrides: Record<string, string> = {},
): Promise<ElectronApplication> {
  return electron.launch({
    executablePath: electronExecutablePath,
    args: [desktopDir],
    env: {
      ...process.env,
      PIONEER_E2E: '1',
      PIONEER_E2E_ROOT: fixtureRoot,
      PIONEER_E2E_USER_DATA: userDataDir,
      ...overrides,
    },
  });
}

async function createUserDataDir(testInfo: TestInfoLike): Promise<string> {
  const userDataDir = testInfo.outputPath('user-data');
  await mkdir(userDataDir, { recursive: true });
  return userDataDir;
}

async function closeAndCheckFixture(
  application: ElectronApplication,
  beforeHash: string,
): Promise<void> {
  try {
    await application.close();
  } finally {
    expect(await captureFixtureHashAfterClose(fixtureRoot)).toBe(beforeHash);
  }
}

async function createAlphaSession(page: Page): Promise<void> {
  await page.getByRole('button', { name: '选择工作区 alpha-app' }).click();
  await page.getByRole('button', { name: '新建会话', exact: true }).click();
}

const persistedInitialState = {
  version: 1,
  state: {
    sessions: [],
    openSessionIds: [],
    activeTabId: 'library',
    mruTabIds: ['library'],
  },
};

test('records real session activity, excludes layout and close, and preserves the query across Electron restart', async ({}, testInfo) => {
  const beforeHash = await captureFixtureHash(fixtureRoot);
  const userDataDir = await createUserDataDir(testInfo);
  let application = await launch(userDataDir);

  try {
    const page = await application.firstWindow();
    const alphaId = await page.evaluate(async () => {
      const catalog = await (window as TestRendererWindow).pioneer.getCatalog();
      return catalog.projects.find((project) => project.name === 'alpha-app')
        ?.id;
    });
    expect(alphaId).toBeDefined();
    const query = () => readActivity(page);
    await createAlphaSession(page);
    await page
      .getByRole('textbox', { name: '给 Agent 的消息' })
      .fill('第一会话的本机消息');
    await page.getByRole('button', { name: '保存到会话' }).click();
    await expect.poll(async () => (await query()).sessions.length).toBe(1);
    const first = (await query()).sessions[0];
    expect(first?.projectId).toBe(alphaId);
    expect(first?.lastActivityAt).toBeGreaterThan(0);

    await page.getByRole('button', { name: '新建当前工作区会话' }).click();
    await page
      .getByRole('textbox', { name: '给 Agent 的消息' })
      .fill('第二会话的本机消息');
    await page.getByRole('button', { name: '保存到会话' }).click();
    await expect(page.getByText('已保存到本机', { exact: true })).toBeVisible();
    await expect.poll(async () => (await query()).sessions.length).toBe(2);
    const saved = await query();
    const second = saved.sessions[0];
    expect(second?.id).not.toBe(first?.id);
    expect(second?.lastActivityAt).toBeGreaterThan(first?.lastActivityAt ?? 0);
    expect(saved.workspaces).toEqual([
      {
        projectId: alphaId,
        mostRecentSessionId: second?.id,
        lastActivityAt: second?.lastActivityAt,
      },
    ]);

    await page.getByRole('tab', { name: '审阅', exact: true }).click();
    // The default review layout has nothing to save. Make a real UI-only
    // customization before asserting that a layout save adds no activity.
    await page.getByLabel('模块', { exact: true }).click();
    await page.getByRole('button', { name: '+ 上下文', exact: true }).click();
    await page.getByLabel('模块', { exact: true }).press('Escape');
    await expect(page.getByText('布局已调整', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: '保存布局' }).click();
    await page
      .getByRole('button', { name: '关闭会话 第二会话的本机消息' })
      .click();
    await expect(
      page.getByRole('tab', { name: '第二会话的本机消息', exact: true }),
    ).toHaveCount(0);
    await expect(page.getByText('已保存到本机', { exact: true })).toBeVisible();
    expect(await query()).toEqual(saved);

    await closeAndCheckFixture(application, beforeHash);
    application = await launch(userDataDir);
    const restarted = await application.firstWindow();
    await expect(
      restarted.getByRole('tab', { name: '第一会话的本机消息', exact: true }),
    ).toBeVisible();
    expect(await readActivity(restarted)).toEqual(saved);
    await restarted
      .getByRole('button', { name: '全部会话', exact: true })
      .click();
    const all = restarted.getByRole('dialog', { name: '全部会话' });
    await expect(all.getByRole('button', { name: /^打开会话 / })).toHaveCount(
      2,
    );
    await all
      .getByRole('button', { name: '打开会话 第二会话的本机消息' })
      .click();
    await expect(
      restarted.getByRole('tab', { name: '第二会话的本机消息', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect
      .poll(async () => {
        const current = await readActivity(restarted);
        return current.sessions[0]?.lastActivityAt;
      })
      .toBeGreaterThan(second?.lastActivityAt ?? 0);
    await expect(restarted.locator('.message-list li p')).toHaveText([
      '第二会话的本机消息',
    ]);
  } finally {
    await closeAndCheckFixture(application, beforeHash);
  }
});

test('persists closed sessions and restores independent conversation state after a real Electron restart', async ({}, testInfo) => {
  const beforeHash = await captureFixtureHash(fixtureRoot);
  const userDataDir = await createUserDataDir(testInfo);
  let application = await launch(userDataDir);

  try {
    const page = await application.firstWindow();
    await createAlphaSession(page);
    await page.getByRole('button', { name: '重命名会话' }).click();
    await page.getByRole('textbox', { name: '会话名称' }).fill('设计审阅');
    await page.getByRole('textbox', { name: '会话名称' }).press('Enter');

    const message = page.getByRole('textbox', { name: '给 Agent 的消息' });
    await message.fill('保留这一条本地消息');
    await page.getByRole('button', { name: '保存到会话' }).click();
    await expect(page.locator('.message-list li')).toHaveCount(1);
    await message.fill('这是一段要随重启保留的草稿');
    await page.getByRole('tab', { name: '交付', exact: true }).click();
    await page.getByRole('tab', { name: '文件清单', exact: true }).click();

    await page.getByRole('button', { name: '新建当前工作区会话' }).click();
    await expect(
      page.getByRole('tab', { name: '新会话 2', exact: true }),
    ).toBeVisible();
    await page.getByRole('tab', { name: '设计审阅', exact: true }).click();
    await page.getByRole('button', { name: '关闭会话 设计审阅' }).click();
    await page.getByRole('button', { name: '保留并关闭' }).click();
    await expect(
      page.getByRole('tab', { name: '设计审阅', exact: true }),
    ).toHaveCount(0);

    await closeAndCheckFixture(application, beforeHash);
    application = await launch(userDataDir);
    const restarted = await application.firstWindow();
    await expect(
      restarted.getByRole('tab', { name: '新会话 2', exact: true }),
    ).toBeVisible();
    await restarted
      .getByRole('button', { name: '全部会话', exact: true })
      .click();
    const allSessions = restarted.getByRole('dialog', { name: '全部会话' });
    await expect(
      allSessions.getByRole('button', { name: /^打开会话 / }),
    ).toHaveCount(2);
    await allSessions
      .getByRole('button', { name: '打开会话 设计审阅' })
      .click();
    await expect(restarted.locator('.message-list li')).toHaveCount(1);
    await expect(
      restarted.getByRole('textbox', { name: '给 Agent 的消息' }),
    ).toHaveValue('这是一段要随重启保留的草稿');
    await expect(
      restarted.getByRole('tab', { name: '交付', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(
      restarted.getByRole('tab', { name: '文件清单', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
  } finally {
    await closeAndCheckFixture(application, beforeHash);
  }
});

test('restores a docked and resized review layout after a real Electron restart', async ({}, testInfo) => {
  const beforeHash = await captureFixtureHash(fixtureRoot);
  const userDataDir = await createUserDataDir(testInfo);
  let application = await launch(userDataDir);

  try {
    const page = await application.firstWindow();
    await application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 1000);
    });
    await createAlphaSession(page);
    await page.getByRole('tab', { name: '审阅', exact: true }).click();
    await page.getByLabel('模块', { exact: true }).click();
    await page.getByRole('button', { name: '+ 上下文', exact: true }).click();

    await page
      .getByRole('button', { name: '拖动上下文面板' })
      .dragTo(page.locator('.dock-panel[data-panel-id="conversation"]'), {
        targetPosition: { x: 60, y: 10 },
      });
    const rightPanels = page.locator(
      '.dock-column[data-dock-column="1"] .dock-panel',
    );
    await expect(rightPanels).toHaveCount(2);
    expect(
      await rightPanels.evaluateAll((panels) =>
        panels.map((panel) => panel.getAttribute('data-panel-id')),
      ),
    ).toEqual(['context', 'conversation']);

    const width = page.getByRole('separator', { name: '左右分栏宽度' });
    const widthBefore = await width.getAttribute('aria-valuenow');
    const box = await width.boundingBox();
    if (!box) throw new Error('Expected the column resize handle.');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x - 44, box.y + box.height / 2, { steps: 4 });
    await page.mouse.up();
    await expect(width).not.toHaveAttribute('aria-valuenow', widthBefore ?? '');
    const savedWidth = await width.getAttribute('aria-valuenow');

    const height = page.getByRole('separator', {
      name: '上下文与会话的高度',
    });
    const heightBefore = await height.getAttribute('aria-valuenow');
    await height.press('ArrowDown');
    await expect(height).not.toHaveAttribute(
      'aria-valuenow',
      heightBefore ?? '',
    );
    const savedHeight = await height.getAttribute('aria-valuenow');

    await page.getByRole('button', { name: '保存布局' }).click();
    await expect(
      page.getByText('布局已保存 · 下次回到此会话时恢复'),
    ).toBeVisible();
    await closeAndCheckFixture(application, beforeHash);

    application = await launch(userDataDir);
    const restarted = await application.firstWindow();
    await application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 1000);
    });
    await expect(restarted.getByRole('tab', { name: '审阅' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const restoredPanels = restarted.locator(
      '.dock-column[data-dock-column="1"] .dock-panel',
    );
    await expect(restoredPanels).toHaveCount(2);
    expect(
      await restoredPanels.evaluateAll((panels) =>
        panels.map((panel) => panel.getAttribute('data-panel-id')),
      ),
    ).toEqual(['context', 'conversation']);
    await expect(
      restarted.getByRole('separator', { name: '左右分栏宽度' }),
    ).toHaveAttribute('aria-valuenow', savedWidth ?? '');
    await expect(
      restarted.getByRole('separator', { name: '上下文与会话的高度' }),
    ).toHaveAttribute('aria-valuenow', savedHeight ?? '');
  } finally {
    await closeAndCheckFixture(application, beforeHash);
  }
});

test('blocks hydration on corrupt session state without changing bytes, then retries after repair', async ({}, testInfo) => {
  const beforeHash = await captureFixtureHash(fixtureRoot);
  const userDataDir = await createUserDataDir(testInfo);
  const statePath = path.join(userDataDir, SESSION_STATE_FILE_NAME);
  const corruptContents = '{ deliberately malformed session state';
  await writeFile(statePath, corruptContents, 'utf8');
  const application = await launch(userDataDir);

  try {
    const page = await application.firstWindow();
    await expect(
      page.getByRole('heading', { name: '暂时无法恢复会话' }),
    ).toBeVisible();
    await expect(
      page.getByText('原会话文件未改动。修复读取问题后，可重新尝试。'),
    ).toBeVisible();
    await expect(readFile(statePath, 'utf8')).resolves.toBe(corruptContents);

    await writeFile(statePath, JSON.stringify(persistedInitialState), 'utf8');
    await page.getByRole('button', { name: '重试恢复' }).click();
    await expect(
      page.getByRole('button', { name: '选择工作区 alpha-app' }),
    ).toBeVisible();
  } finally {
    await closeAndCheckFixture(application, beforeHash);
  }
});

test('surfaces a real atomic replacement failure, keeps the close gate actionable, and retries safely', async ({}, testInfo) => {
  const beforeHash = await captureFixtureHash(fixtureRoot);
  const userDataDir = await createUserDataDir(testInfo);
  const application = await launch(userDataDir);
  const statePath = path.join(userDataDir, SESSION_STATE_FILE_NAME);

  try {
    const page = await application.firstWindow();
    await expect(
      page.getByRole('button', { name: '选择工作区 alpha-app' }),
    ).toBeVisible();
    // An empty directory occupies the fixed target; fs.rename cannot replace it.
    await mkdir(statePath);
    await createAlphaSession(page);
    await page
      .getByRole('textbox', { name: '给 Agent 的消息' })
      .fill('让原子替换失败的草稿');
    await expect(
      page.getByText('会话尚未保存。请保留窗口并重试，原记录未覆盖。'),
    ).toBeVisible();

    await application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.close();
    });
    const closeDialog = page.getByRole('dialog', {
      name: '还有未保存的会话更改',
    });
    await expect(closeDialog).toBeVisible();
    await expect(
      closeDialog.getByRole('button', { name: '继续编辑' }),
    ).toBeVisible();
    await expect(
      closeDialog.getByRole('button', { name: '重试并关闭' }),
    ).toBeVisible();
    await expect(
      closeDialog.getByRole('button', { name: '放弃未保存更改并关闭' }),
    ).toBeVisible();
    await closeDialog.getByRole('button', { name: '继续编辑' }).click();
    await expect(closeDialog).toBeHidden();

    await rmdir(statePath);
    await page.getByRole('button', { name: '重试保存' }).click();
    await expect(page.getByText('已保存到本机')).toBeVisible();
  } finally {
    await closeAndCheckFixture(application, beforeHash);
  }
});

test('waits for a delayed real save while closing, then restores the draft after restart', async ({}, testInfo) => {
  const beforeHash = await captureFixtureHash(fixtureRoot);
  const userDataDir = await createUserDataDir(testInfo);
  let application = await launch(userDataDir, {
    PIONEER_E2E_SESSION_SAVE_DELAY_MS: '250',
  });

  try {
    const page = await application.firstWindow();
    await createAlphaSession(page);
    const draft = '关闭时还在队列里的草稿';
    await page.getByRole('textbox', { name: '给 Agent 的消息' }).fill(draft);

    await closeAndCheckFixture(application, beforeHash);
    application = await launch(userDataDir);
    const restarted = await application.firstWindow();
    await expect(
      restarted.getByRole('textbox', { name: '给 Agent 的消息' }),
    ).toHaveValue(draft);
  } finally {
    await closeAndCheckFixture(application, beforeHash);
  }
});

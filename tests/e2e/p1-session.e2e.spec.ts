import {
  _electron as electron,
  expect,
  test,
  type Page,
} from '@playwright/test';
import { mkdir, readFile, writeFile, rmdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { PioneerDesktopApi } from '../../apps/desktop/src/shared/contracts/ipc';
import { createDockLayout } from '../../apps/desktop/src/shared/docking';
import { SessionStateRecordSchema } from '../../apps/desktop/src/shared/session-state';
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
type RendererWindow = Window & { pioneer: PioneerDesktopApi };
const launch = (userData: string) =>
  electron.launch({
    executablePath,
    args: [desktopDir],
    env: {
      ...process.env,
      PIONEER_E2E: '1',
      PIONEER_E2E_ROOT: fixtureRoot,
      PIONEER_E2E_USER_DATA: userData,
    },
  });
async function createSession(page: Page, title: string) {
  await page.getByRole('tab', { name: 'Library', exact: true }).click();
  await page
    .getByRole('button', { name: 'Open project alpha-app', exact: true })
    .click();
  await page.getByRole('button', { name: '新建会话', exact: true }).click();
  await page.getByRole('button', { name: '重命名会话', exact: true }).click();
  await page
    .getByRole('textbox', { name: '会话名称', exact: true })
    .fill(title);
  await page.getByRole('button', { name: '保存名称', exact: true }).click();
}

test('creates independent sessions, reopens a closed tab and restores draft, messages and layout after Electron restart', async ({}, info) => {
  const before = await captureFixtureHash(fixtureRoot);
  const userData = info.outputPath('user-data');
  await mkdir(userData, { recursive: true });
  let app = await launch(userData);
  try {
    let page = await app.firstWindow();
    await createSession(page, '修复请求缓存');
    await page
      .getByRole('textbox', { name: '给 Agent 的消息', exact: true })
      .fill('修复缓存键冲突，并补充并发请求测试');
    await page.getByText('模块', { exact: true }).click();
    await page.getByRole('button', { name: '+ 上下文', exact: true }).click();
    await page.getByRole('button', { name: '保存到会话', exact: true }).click();
    await expect(page.locator('.message-list li')).toHaveCount(1);
    await page
      .getByRole('textbox', { name: '给 Agent 的消息', exact: true })
      .fill('修复缓存键冲突，并补充并发请求测试');
    await page.getByText('模块', { exact: true }).click();
    await page.getByRole('button', { name: '+ 产物', exact: true }).click();
    await page.getByRole('tab', { name: '文件清单', exact: true }).click();
    await createSession(page, '补充扫描测试');
    await expect(
      page.getByRole('textbox', { name: '给 Agent 的消息', exact: true }),
    ).toHaveValue('');
    await page
      .getByRole('textbox', { name: '给 Agent 的消息', exact: true })
      .fill('增加符号链接逃逸的拒绝用例');
    await page.getByRole('button', { name: '保存到会话', exact: true }).click();
    await expect(page.locator('.message-list li')).toHaveCount(1);
    await expect(page.getByRole('button', { name: '澄清任务' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '意图摘要' })).toHaveCount(0);
    await page
      .getByRole('textbox', { name: '给 Agent 的消息', exact: true })
      .fill('增加符号链接逃逸的拒绝用例');
    await page.getByRole('tab', { name: '修复请求缓存', exact: true }).click();
    await expect(
      page.getByRole('textbox', { name: '给 Agent 的消息', exact: true }),
    ).toHaveValue('修复缓存键冲突，并补充并发请求测试');
    await page
      .getByRole('button', { name: 'Close 修复请求缓存', exact: true })
      .click();
    await expect(
      page.getByRole('tab', { name: '补充扫描测试', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('tab', { name: 'Library', exact: true }).click();
    await page
      .getByRole('button', { name: '打开会话 修复请求缓存', exact: true })
      .click();
    await expect(page.locator('[data-panel-id="context"]')).toBeVisible();
    await expect(page.locator('.message-list li')).toHaveCount(1);
    await expect(
      page.locator('.message-list').getByText('修复缓存键冲突，并补充并发请求测试'),
    ).toBeVisible();
    await expect(
      page.getByRole('tab', { name: '文件清单', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(
      page.getByRole('tab', { name: /^(专注|审阅|交付)$/ }),
    ).toHaveCount(0);
    await expect(page.locator('.save-status')).toHaveText('已保存到本机');
    await page.screenshot({
      path: info.outputPath('session-before-restart.png'),
    });
    await app.close();
    app = await launch(userData);
    page = await app.firstWindow();
    await expect(
      page.getByRole('tab', { name: '修复请求缓存', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(
      page.getByRole('textbox', { name: '给 Agent 的消息', exact: true }),
    ).toHaveValue('修复缓存键冲突，并补充并发请求测试');
    await expect(page.locator('[data-panel-id="context"]')).toBeVisible();
    await expect(page.locator('.message-list li')).toHaveCount(1);
    await expect(
      page.locator('.message-list').getByText('修复缓存键冲突，并补充并发请求测试'),
    ).toBeVisible();
    await expect(
      page.getByRole('tab', { name: '文件清单', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('tab', { name: '补充扫描测试', exact: true }).click();
    await expect(page.locator('.message-list li')).toHaveCount(1);
    await expect(
      page.getByRole('textbox', { name: '给 Agent 的消息', exact: true }),
    ).toHaveValue('增加符号链接逃逸的拒绝用例');
  } finally {
    await app.close();
    expect(await captureFixtureHashAfterClose(fixtureRoot)).toBe(before);
  }
});

test('retries loading a repaired record without replacing the damaged original', async ({}, info) => {
  const before = await captureFixtureHash(fixtureRoot);
  const userData = info.outputPath('user-data');
  await mkdir(userData, { recursive: true });
  const file = path.join(userData, 'pioneer-session-state.json');
  const original = '{"version":99,"important":"preserve before repair"}';
  await writeFile(file, original, 'utf8');
  const app = await launch(userData);
  try {
    const page = await app.firstWindow();
    await expect(
      page.getByRole('heading', { name: '无法读取会话记录' }),
    ).toBeVisible();
    expect(await readFile(file, 'utf8')).toBe(original);
    // Simulate an explicit user repair only in this isolated test profile.
    await writeFile(
      path.join(userData, 'original-record.backup'),
      original,
      'utf8',
    );
    await writeFile(
      file,
      JSON.stringify({
        version: 4,
        state: {
          sessions: [],
          openSessionIds: [],
          activeTabId: 'library',
          mruTabIds: ['library'],
        },
      }),
      'utf8',
    );
    await page.getByRole('button', { name: '重试读取', exact: true }).click();
    await expect(
      page.getByRole('tab', { name: 'Library', exact: true }),
    ).toBeVisible();
    await createSession(page, '恢复后继续开发');
    await expect(page.locator('.save-status')).toHaveText('已保存到本机');
    expect(
      await readFile(path.join(userData, 'original-record.backup'), 'utf8'),
    ).toBe(original);
  } finally {
    await app.close();
    expect(await captureFixtureHashAfterClose(fixtureRoot)).toBe(before);
  }
});

test('persists a moved panel and keyboard-resized single layout without changing the draft', async ({}, info) => {
  const before = await captureFixtureHash(fixtureRoot);
  const userData = info.outputPath('user-data');
  await mkdir(userData, { recursive: true });
  let app = await launch(userData);
  try {
    let page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 1000);
    });
    await createSession(page, '调整会话面板');
    await page
      .getByRole('textbox', { name: '给 Agent 的消息' })
      .fill('布局变化不改变任务草稿');
    await page.getByText('模块', { exact: true }).click();
    await page.getByRole('button', { name: '+ 上下文', exact: true }).click();
    await page.getByRole('button', { name: '+ 改动', exact: true }).click();
    const context = page.locator('[data-panel-id="context"]');
    await context.getByLabel('上下文面板菜单', { exact: true }).click();
    await context
      .getByRole('button', { name: '移至右侧', exact: true })
      .click();
    await expect(
      page.locator('[data-dock-column="1"] [data-panel-id="context"]'),
    ).toBeVisible();
    const width = page.getByRole('separator', {
      name: '左右分栏宽度',
      exact: true,
    });
    await width.press('ArrowLeft');
    await expect(width).toHaveAttribute('aria-valuenow', '58');
    const height = page.getByRole('separator', {
      name: '会话与上下文的高度',
      exact: true,
    });
    const initialHeight = Number(await height.getAttribute('aria-valuenow'));
    await height.press('ArrowUp');
    await expect(height).toHaveAttribute(
      'aria-valuenow',
      String(initialHeight - 2),
    );
    await page.getByRole('button', { name: '保存布局', exact: true }).click();
    await expect(page.locator('.save-status')).toHaveText('已保存到本机');
    await app.close();
    app = await launch(userData);
    page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 1000);
    });
    await expect(
      page.locator('[data-dock-column="1"] [data-panel-id="context"]'),
    ).toBeVisible();
    await expect(
      page.getByRole('separator', { name: '左右分栏宽度', exact: true }),
    ).toHaveAttribute('aria-valuenow', '58');
    await expect(
      page.getByRole('separator', { name: '会话与上下文的高度', exact: true }),
    ).toHaveAttribute('aria-valuenow', String(initialHeight - 2));
    await expect(
      page.getByRole('textbox', { name: '给 Agent 的消息' }),
    ).toHaveValue('布局变化不改变任务草稿');
  } finally {
    await app.close();
    expect(await captureFixtureHashAfterClose(fixtureRoot)).toBe(before);
  }
});

test('opens v4 records with and without intentState', async ({}, info) => {
  const before = await captureFixtureHash(fixtureRoot);
  const userData = info.outputPath('user-data');
  await mkdir(userData, { recursive: true });
  const file = path.join(userData, 'pioneer-session-state.json');
  let app = await launch(userData);
  try {
    let page = await app.firstWindow();
    await createSession(page, '旧记录兼容');
    await page
      .getByRole('textbox', { name: '给 Agent 的消息', exact: true })
      .fill('保存的历史消息');
    await page.getByRole('button', { name: '保存到会话' }).click();
    await page
      .getByRole('textbox', { name: '给 Agent 的消息', exact: true })
      .fill('保留的历史草稿');
    await page.getByText('模块', { exact: true }).click();
    await page.getByRole('button', { name: '+ 上下文', exact: true }).click();
    await expect(page.locator('.save-status')).toHaveText('已保存到本机');
    await app.close();

    const record = JSON.parse(await readFile(file, 'utf8')) as {
      version: number;
      state: { sessions: Array<{ intentState?: unknown }> };
    };
    const oldSession = record.state.sessions[0];
    if (!oldSession) throw new Error('Expected persisted session');
    oldSession.intentState = {
      phase: 'compose',
      draftInstruction: '2026-10-24 的旧意图草稿',
      intent: null,
      runtime: null,
      error: null,
    };
    const legacyBytes = JSON.stringify(record);
    await writeFile(file, legacyBytes, 'utf8');

    app = await launch(userData);
    page = await app.firstWindow();
    await expect(
      page.getByRole('textbox', { name: '给 Agent 的消息' }),
    ).toHaveValue('保留的历史草稿');
    await expect(page.locator('.message-list li')).toHaveCount(1);
    await expect(
      page.locator('.message-list').getByText('保存的历史消息'),
    ).toBeVisible();
    await expect(page.locator('[data-panel-id="context"]')).toBeVisible();
    await expect(page.getByRole('button', { name: '澄清任务' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '意图摘要' })).toHaveCount(0);
    expect(await readFile(file, 'utf8')).toBe(legacyBytes);
    await app.close();

    delete oldSession.intentState;
    const withoutIntentBytes = JSON.stringify(record);
    await writeFile(file, withoutIntentBytes, 'utf8');
    app = await launch(userData);
    page = await app.firstWindow();
    await expect(
      page.getByRole('textbox', { name: '给 Agent 的消息' }),
    ).toHaveValue('保留的历史草稿');
    await expect(page.locator('.message-list li')).toHaveCount(1);
    await expect(page.locator('[data-panel-id="context"]')).toBeVisible();
    expect(await readFile(file, 'utf8')).toBe(withoutIntentBytes);

    await page
      .getByRole('textbox', { name: '给 Agent 的消息' })
      .fill('新修改的草稿');
    await expect(page.locator('.save-status')).toHaveText('已保存到本机');
    const saved = SessionStateRecordSchema.parse(
      JSON.parse(await readFile(file, 'utf8')),
    );
    expect(saved.version).toBe(4);
    expect(saved.state.sessions[0]?.draft).toBe('新修改的草稿');
    expect(saved.state.sessions[0]?.messages).toEqual(['保存的历史消息']);
    expect(saved.state.sessions[0]?.dock.hidden).not.toContain('context');
  } finally {
    await app.close();
    expect(await captureFixtureHashAfterClose(fixtureRoot)).toBe(before);
  }
});

test('reads a v3 active layout without rewriting it, then preserves its history when UI edits save v4', async ({}, info) => {
  const before = await captureFixtureHash(fixtureRoot);
  const userData = info.outputPath('user-data');
  await mkdir(userData, { recursive: true });
  const file = path.join(userData, 'pioneer-session-state.json');
  let app = await launch(userData);
  try {
    let page = await app.firstWindow();
    await expect(
      page.getByRole('button', { name: 'Open project alpha-app', exact: true }),
    ).toBeVisible();
    const project = await page.evaluate(async () =>
      (await (window as RendererWindow).pioneer.getCatalog()).projects.find(
        (item) => item.name === 'alpha-app',
      ),
    );
    if (!project) throw new Error('Expected catalog fixture');
    await app.close();
    const layouts = {
      focus: createDockLayout('focus'),
      review: { ...createDockLayout('review', ['context']), ratio: 41 },
      delivery: createDockLayout('delivery'),
    };
    const savedLayouts = {
      delivery: { ...createDockLayout('delivery'), ratio: 47 },
    };
    const original = JSON.stringify({
      version: 3,
      state: {
        sessions: [
          {
            id: 'session:legacy',
            project,
            title: '历史缓存任务',
            customTitle: true,
            draft: '旧草稿',
            messages: ['读取缓存模块'],
            lastActivityAt: 100,
            layout: 'review',
            dockLayouts: layouts,
            savedLayouts,
            outputTab: 'files',
          },
        ],
        openSessionIds: ['session:legacy'],
        activeTabId: 'session:legacy',
        mruTabIds: ['session:legacy', 'library'],
      },
    });
    await writeFile(file, original, 'utf8');
    app = await launch(userData);
    page = await app.firstWindow();
    await expect(
      page.getByRole('textbox', { name: '给 Agent 的消息', exact: true }),
    ).toHaveValue('旧草稿');
    await expect(page.locator('[data-panel-id="context"]')).toBeVisible();
    await expect(
      page.getByRole('separator', { name: '左右分栏宽度', exact: true }),
    ).toHaveAttribute('aria-valuenow', '41');
    expect(await readFile(file, 'utf8')).toBe(original);
    await page
      .getByRole('textbox', { name: '给 Agent 的消息', exact: true })
      .fill('迁移后继续定位缓存模块');
    await expect(page.locator('.save-status')).toHaveText('已保存到本机');
    const record = SessionStateRecordSchema.parse(
      JSON.parse(await readFile(file, 'utf8')),
    );
    expect(record.version).toBe(4);
    expect(record.state.sessions[0]?.layoutHistory).toEqual({
      layout: 'review',
      dockLayouts: layouts,
      savedLayouts,
    });
    expect(record.state.sessions[0]?.messages).toEqual(['读取缓存模块']);
  } finally {
    await app.close();
    expect(await captureFixtureHashAfterClose(fixtureRoot)).toBe(before);
  }
});

test('preserves a failed atomic save target, keeps drafts editable and retries safely', async ({}, info) => {
  const before = await captureFixtureHash(fixtureRoot);
  const userData = info.outputPath('user-data');
  await mkdir(userData, { recursive: true });
  const app = await launch(userData);
  const target = path.join(userData, 'pioneer-session-state.json');
  try {
    const page = await app.firstWindow();
    await expect(
      page.getByRole('button', { name: 'Open project alpha-app', exact: true }),
    ).toBeVisible();
    await mkdir(target);
    await createSession(page, '重试原子保存');
    await page
      .getByRole('textbox', { name: '给 Agent 的消息' })
      .fill('保存失败时保留这段草稿');
    await expect(
      page.getByRole('button', { name: '重试保存', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.hazel-companion')).toHaveCount(0);
    expect((await stat(target)).isDirectory()).toBe(true);
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.close();
    });
    const dialog = page.getByRole('dialog', {
      name: '关闭前保存会话',
      exact: true,
    });
    await expect(
      dialog.getByRole('button', { name: '重试保存并关闭', exact: true }),
    ).toBeVisible();
    await dialog.getByRole('button', { name: '继续使用', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole('textbox', { name: '给 Agent 的消息' }),
    ).toHaveValue('保存失败时保留这段草稿');
    // Remove only the empty obstruction this test created, never a user's record.
    await rmdir(target);
    await page.getByRole('button', { name: '重试保存', exact: true }).click();
    await expect(page.locator('.save-status')).toHaveText('已保存到本机');
  } finally {
    // Repair only our empty obstruction if an assertion failed before the repair.
    const obstruction = await stat(target).catch(() => null);
    if (obstruction?.isDirectory()) await rmdir(target);
    const page = app.windows()[0];
    if (
      page &&
      !page.isClosed() &&
      (await page
        .getByRole('button', { name: '重试保存', exact: true })
        .count())
    ) {
      await page.getByRole('button', { name: '重试保存', exact: true }).click();
    }
    await app.close();
    expect(await captureFixtureHashAfterClose(fixtureRoot)).toBe(before);
  }
});

test('keeps an unsupported record intact and offers retry instead of silently starting an empty session library', async ({}, info) => {
  const before = await captureFixtureHash(fixtureRoot);
  const userData = info.outputPath('user-data');
  await mkdir(userData, { recursive: true });
  const file = path.join(userData, 'pioneer-session-state.json');
  const original = '{"version":99,"important":"keep this original"}';
  await writeFile(file, original, 'utf8');
  const app = await launch(userData);
  try {
    const page = await app.firstWindow();
    await expect(
      page.getByRole('heading', { name: '无法读取会话记录', exact: true }),
    ).toBeVisible();
    expect(await readFile(file, 'utf8')).toBe(original);
    await expect(
      page.getByRole('button', { name: '重试读取', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: '新建会话', exact: true }),
    ).toHaveCount(0);
  } finally {
    await app.close();
    expect(await readFile(file, 'utf8')).toBe(original);
    expect(await captureFixtureHashAfterClose(fixtureRoot)).toBe(before);
  }
});

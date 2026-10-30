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
import {
  initialSessionWorkspaceState,
  sessionWorkspaceReducer,
} from '../../apps/desktop/src/renderer/state/session-workspace-reducer';
import {
  SessionStateRecordSchema,
  SESSION_STATE_VERSION,
  MAX_SESSION_STATE_BYTES,
} from '../../apps/desktop/src/shared/session-state';
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

test('explains when a branch would exceed the storage limit without changing the record', async ({}, info) => {
  test.setTimeout(60_000);
  const before = await captureFixtureHash(fixtureRoot);
  const userData = info.outputPath('branch-capacity-user-data');
  await mkdir(userData, { recursive: true });
  const project = {
    id: 'alpha-app',
    name: 'alpha-app',
    absolutePath: path.join(fixtureRoot, 'alpha-app'),
    description: null,
    technologies: [],
    hasGitRepository: false,
    lastModifiedAt: '2026-10-03T00:00:00.000Z',
    coverSeed: 'alpha-app',
  };
  const initial = sessionWorkspaceReducer(initialSessionWorkspaceState, {
    type: 'CREATE_SESSION',
    id: 'session:large-0',
    project,
  });
  const source = initial.sessions[0];
  if (!source) throw new Error('Expected source');
  const messages = Array.from({ length: 100 }, () => '汉'.repeat(2500));
  const sessions = Array.from({ length: 11 }, (_, index) => ({
    ...source,
    id: `session:large-${String(index)}` as const,
    messages: [...messages],
  }));
  const state = { ...initial, sessions };
  const bytes = JSON.stringify(
    SessionStateRecordSchema.parse({ version: SESSION_STATE_VERSION, state }),
  );
  expect(Buffer.byteLength(bytes, 'utf8')).toBeLessThan(
    MAX_SESSION_STATE_BYTES,
  );
  const file = path.join(userData, 'pioneer-session-state.json');
  await writeFile(file, bytes, 'utf8');
  const app = await launch(userData);
  try {
    const page = await app.firstWindow();
    await page
      .getByRole('button', { name: '从第 100 条消息创建分支', exact: true })
      .click();
    await expect(page.getByRole('alert')).toContainText('无法创建分支');
    await expect(
      page.getByRole('tab', { name: '新会话 分支', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('tab', { name: '新会话', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(await readFile(file, 'utf8')).toBe(bytes);
  } finally {
    await app.close();
    expect(await captureFixtureHashAfterClose(fixtureRoot)).toBe(before);
  }
});

test('branches from a saved message, restores independently and handles a missing source', async ({}, info) => {
  const before = await captureFixtureHash(fixtureRoot);
  const userData = info.outputPath('branch-user-data');
  await mkdir(userData, { recursive: true });
  const file = path.join(userData, 'pioneer-session-state.json');
  let app = await launch(userData);
  try {
    let page = await app.firstWindow();
    await createSession(page, '原会话');
    const input = page.getByRole('textbox', {
      name: '给 Agent 的消息',
      exact: true,
    });
    for (const message of ['第一条消息', '第二条消息']) {
      await input.fill(message);
      await page
        .getByRole('button', { name: '保存到会话', exact: true })
        .click();
    }
    await input.fill('原会话草稿');
    await page
      .getByRole('button', { name: '从第 1 条消息创建分支', exact: true })
      .click();
    const childTab = page.getByRole('tab', {
      name: '原会话 分支',
      exact: true,
    });
    await expect(childTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.message-list li')).toHaveCount(1);
    await expect(page.locator('.message-list li').first()).toContainText(
      '第一条消息',
    );
    await expect(input).toHaveValue('');
    await expect(page.locator('.session-branch-origin')).toContainText(
      '来源：原会话 · 第 1 条消息',
    );
    await page
      .getByRole('button', { name: '打开来源会话', exact: true })
      .click();
    await expect(page.locator('.message-list li')).toHaveCount(2);
    await expect(input).toHaveValue('原会话草稿');
    await childTab.click();
    await input.fill('分支的新消息');
    await page.getByRole('button', { name: '保存到会话', exact: true }).click();
    await expect(page.locator('.message-list li')).toHaveCount(2);
    await expect(page.locator('.save-status')).toHaveText('已保存到本机');
    await app.close();

    app = await launch(userData);
    page = await app.firstWindow();
    await expect(
      page.getByRole('tab', { name: '原会话 分支', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.message-list li')).toHaveCount(2);
    await expect(page.locator('.message-list li').last()).toContainText(
      '分支的新消息',
    );
    await expect(page.locator('.session-branch-origin')).toContainText(
      '来源：原会话 · 第 1 条消息',
    );
    const stored = SessionStateRecordSchema.parse(
      JSON.parse(await readFile(file, 'utf8')),
    );
    const branch = stored.state.sessions.find(
      (session) => session.branchOrigin != null,
    );
    expect(branch?.runHistory).toEqual([]);
    expect(branch?.runRevision).toBe(0);
    expect(branch?.lastRunView).toBeNull();
    await app.close();

    if (!branch?.branchOrigin)
      throw new Error('Expected persisted branch origin');
    const sourceId = branch.branchOrigin.sessionId;
    const withoutSource = {
      ...stored,
      state: {
        ...stored.state,
        sessions: stored.state.sessions.filter(
          (session) => session.id !== sourceId,
        ),
        openSessionIds: stored.state.openSessionIds.filter(
          (id) => id !== sourceId,
        ),
        mruTabIds: stored.state.mruTabIds.filter((id) => id !== sourceId),
      },
    };
    await writeFile(
      file,
      JSON.stringify(SessionStateRecordSchema.parse(withoutSource)),
    );
    app = await launch(userData);
    page = await app.firstWindow();
    await expect(page.locator('.session-branch-origin')).toHaveText(
      '来源不可用',
    );
    const branchTab = page.getByRole('tab', {
      name: '原会话 分支',
      exact: true,
    });
    await expect(branchTab).toHaveAccessibleDescription(/分支.*来源不可用/);
    await branchTab.focus();
    await expect(page.locator('.session-branch-hint')).toHaveText('来源不可用');
    await expect(
      page.getByRole('button', { name: '打开来源会话', exact: true }),
    ).toHaveCount(0);
    await expect(page.locator('.message-list li')).toHaveCount(2);
  } finally {
    await app.close();
    expect(await captureFixtureHashAfterClose(fixtureRoot)).toBe(before);
  }
});

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
    await expect(
      page.getByRole('heading', { name: '意图摘要', exact: true }),
    ).toHaveCount(0);
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
        version: 5,
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

test('migrates a v4 record without restoring its intent card and keeps draft, messages and dock layout', async ({}, info) => {
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
    const original = JSON.stringify({
      version: 4,
      state: {
        sessions: [
          {
            id: 'session:stored-intent',
            project,
            title: '旧意图记录',
            customTitle: true,
            draft: '继续定位缓存键冲突',
            messages: ['读取缓存模块'],
            lastActivityAt: 100,
            dock: { ...createDockLayout('review', ['context']), ratio: 41 },
            savedDock: null,
            layoutHistory: null,
            outputTab: 'files',
            intentState: {
              phase: 'ready',
              draftInstruction: '定位缓存键冲突',
              intent: {
                id: 'intent:session:stored-intent',
                projectId: project.id,
                revision: 2,
                instruction: '定位缓存键冲突，不修改文件',
                steps: [{ id: 'step:1', summary: '读取缓存模块' }],
                status: 'ready',
              },
              runtime: null,
              error: null,
            },
          },
        ],
        openSessionIds: ['session:stored-intent'],
        activeTabId: 'session:stored-intent',
        mruTabIds: ['session:stored-intent', 'library'],
      },
    });
    await writeFile(file, original, 'utf8');
    app = await launch(userData);
    page = await app.firstWindow();
    await expect(
      page.getByRole('textbox', { name: '给 Agent 的消息', exact: true }),
    ).toHaveValue('继续定位缓存键冲突');
    await expect(page.locator('.message-list li')).toHaveCount(1);
    await expect(page.locator('[data-panel-id="context"]')).toBeVisible();
    await expect(
      page.getByRole('separator', { name: '左右分栏宽度', exact: true }),
    ).toHaveAttribute('aria-valuenow', '41');
    await expect(
      page.getByRole('button', { name: '澄清任务', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: '意图摘要', exact: true }),
    ).toHaveCount(0);
    await expect(page.getByText('REV 2', { exact: true })).toHaveCount(0);
    // Loading is pure: the stored record stays byte-identical until a save.
    expect(await readFile(file, 'utf8')).toBe(original);
    await page
      .getByRole('textbox', { name: '给 Agent 的消息', exact: true })
      .fill('继续定位缓存键冲突，仅做只读分析');
    await expect(page.locator('.save-status')).toHaveText('已保存到本机');
    const record = SessionStateRecordSchema.parse(
      JSON.parse(await readFile(file, 'utf8')),
    );
    expect(record.state.sessions[0]?.draft).toBe(
      '继续定位缓存键冲突，仅做只读分析',
    );
    expect(record.state.sessions[0]?.messages).toEqual(['读取缓存模块']);
    expect(record.version).toBe(SESSION_STATE_VERSION);
    expect(record.state.sessions[0]).not.toHaveProperty('intentState');
  } finally {
    await app.close();
    expect(await captureFixtureHashAfterClose(fixtureRoot)).toBe(before);
  }
});

test('reads a v3 active layout without rewriting it, then preserves its history when UI edits save the current version', async ({}, info) => {
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
    expect(record.version).toBe(SESSION_STATE_VERSION);
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

test('branch tabs reveal real origin on focus and hover and handle changed source', async ({}, info) => {
  const before = await captureFixtureHash(fixtureRoot);
  const userData = info.outputPath('branch-tab-user-data');
  await mkdir(userData, { recursive: true });
  const file = path.join(userData, 'pioneer-session-state.json');
  let app = await launch(userData);
  try {
    let page = await app.firstWindow();
    await page
      .getByRole('button', { name: 'Open project alpha-app', exact: true })
      .click();
    await page.getByRole('button', { name: '新建会话', exact: true }).click();
    await page.getByRole('button', { name: '重命名会话', exact: true }).click();
    await page
      .getByRole('textbox', { name: '会话名称', exact: true })
      .fill('原会话');
    await page.getByRole('button', { name: '保存名称', exact: true }).click();
    const source = page.getByRole('tab', { name: '原会话', exact: true });
    await expect(source.locator('.session-branch-badge')).toHaveCount(0);
    await page
      .getByRole('textbox', { name: '给 Agent 的消息', exact: true })
      .fill('第一条消息');
    await page.getByRole('button', { name: '保存到会话', exact: true }).click();
    await page
      .getByRole('button', { name: '从第 1 条消息创建分支', exact: true })
      .click();
    const branch = page.getByRole('tab', { name: '原会话 分支', exact: true });
    const hint = page.locator('.session-branch-hint');
    await expect(branch.locator('.session-branch-badge')).toHaveText('分支');
    await expect(branch).toHaveAccessibleDescription(
      /分支.*来源：原会话 · 第 1 条消息/,
    );
    await branch.focus();
    await expect(hint).toBeVisible();
    await expect(hint).toContainText('来源：原会话 · 第 1 条消息');
    await branch.press('Escape');
    await expect(hint).toBeHidden();
    await page.getByRole('tab', { name: 'Library', exact: true }).focus();
    await branch.focus();
    await expect(hint).toBeVisible();
    await page.screenshot({ path: info.outputPath('branch-tab-focused.png') });
    await branch.press('ArrowLeft');
    await expect(source).toBeFocused();
    await expect(source).toHaveAttribute('aria-selected', 'true');
    await source.press('ArrowRight');
    await expect(branch).toBeFocused();
    await expect(branch).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('tab', { name: 'Library', exact: true }).focus();
    await page.mouse.move(0, 0);
    await expect(hint).toBeHidden();
    await branch.hover();
    await expect(hint).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(hint).toBeHidden();
    await page.mouse.move(0, 0);
    await branch.hover();
    await expect(hint).toBeVisible();
    const branchBox = await branch.boundingBox();
    const initialHintBox = await hint.boundingBox();
    if (!branchBox || !initialHintBox)
      throw new Error('Missing hover geometry');
    await page.mouse.move(
      branchBox.x + branchBox.width / 2,
      initialHintBox.y + 2,
    );
    await expect(hint).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(hint).toBeHidden();
    await expect(page.locator('.save-status')).toHaveText('已保存到本机');
    await app.close();

    const stored = SessionStateRecordSchema.parse(
      JSON.parse(await readFile(file, 'utf8')),
    );
    const child = stored.state.sessions.find((session) => session.branchOrigin);
    const original = stored.state.sessions.find(
      (session) => session.id === child?.branchOrigin?.sessionId,
    );
    if (!original) throw new Error('Missing source session');
    original.title = '很长的来源会话名称'.repeat(5).slice(0, 48);
    if (!child) throw new Error('Missing branch session');
    const extra = {
      ...original,
      id: 'session:extra-tab' as const,
      title: '额外会话',
      branchOrigin: null,
    };
    stored.state.sessions.push(extra);
    stored.state.openSessionIds.splice(
      stored.state.openSessionIds.indexOf(child.id),
      0,
      extra.id,
    );
    stored.state.mruTabIds.push(extra.id);
    await writeFile(
      file,
      JSON.stringify(SessionStateRecordSchema.parse(stored)),
    );
    app = await launch(userData);
    page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setContentSize(640, 800),
    );
    const narrowBranch = page.getByRole('tab', {
      name: '原会话 分支',
      exact: true,
    });
    const strip = page.getByRole('tablist', { name: 'Workspace sections' });
    await page.getByRole('tab', { name: 'Settings', exact: true }).focus();
    await page.mouse.move(0, 0);
    await strip.evaluate((node) => {
      node.scrollLeft = 0;
    });
    const beforeScroll = await narrowBranch.boundingBox();
    if (!beforeScroll) throw new Error('Missing branch tab geometry');
    await strip.evaluate((node, left) => {
      node.scrollLeft = Math.max(0, left - 540);
    }, beforeScroll.x);
    const partial = await narrowBranch.boundingBox();
    if (!partial) throw new Error('Missing branch tab geometry');
    expect(partial.x + partial.width).toBeGreaterThan(640);
    const scrollBeforeHover = await strip.evaluate((node) => node.scrollLeft);
    await page.mouse.move(630, partial.y + 20);
    await expect(page.locator('.session-branch-hint')).toBeVisible();
    expect(await strip.evaluate((node) => node.scrollLeft)).toBe(
      scrollBeforeHover,
    );
    await narrowBranch.focus();
    const narrowHint = page.locator('.session-branch-hint');
    await expect(narrowHint).toContainText(original.title);
    const hintBox = await narrowHint.boundingBox();
    const closeBox = await page
      .getByRole('button', { name: 'Close 原会话 分支', exact: true })
      .boundingBox();
    const stripBox = await strip.boundingBox();
    if (!hintBox || !closeBox || !stripBox)
      throw new Error('Missing narrow-window geometry');
    await page.screenshot({
      path: info.outputPath('branch-tab-narrow-long.png'),
    });
    expect(hintBox.x).toBeGreaterThanOrEqual(0);
    expect(hintBox.x + hintBox.width).toBeLessThanOrEqual(640);
    expect(hintBox.y + hintBox.height).toBeLessThanOrEqual(800);
    expect(closeBox.x).toBeGreaterThanOrEqual(stripBox.x);
    expect(closeBox.x + closeBox.width).toBeLessThanOrEqual(
      stripBox.x + stripBox.width + 1,
    );
    expect(await strip.evaluate((node) => node.scrollLeft)).toBeGreaterThan(
      scrollBeforeHover,
    );
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setContentSize(640, 150),
    );
    await expect
      .poll(async () => {
        const box = await narrowHint.boundingBox();
        const height = await page.evaluate(() => window.innerHeight);
        return box != null && box.y >= 0 && box.y + box.height <= height;
      })
      .toBe(true);
    await app.close();

    original.messages[0] = '来源消息已变化';
    await writeFile(
      file,
      JSON.stringify(SessionStateRecordSchema.parse(stored)),
    );
    app = await launch(userData);
    page = await app.firstWindow();
    const stale = page.getByRole('tab', { name: '原会话 分支', exact: true });
    await stale.focus();
    await expect(stale.locator('.session-branch-badge')).toHaveText('分支');
    await expect(page.locator('.session-branch-hint')).toHaveText('来源不可用');
    await expect(stale).toHaveAccessibleDescription(/分支.*来源不可用/);
    await page.screenshot({
      path: info.outputPath('branch-tab-unavailable.png'),
    });
    await expect(
      page.getByRole('button', { name: '打开来源会话', exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole('button', { name: 'Close 原会话 分支', exact: true })
      .click();
    await expect(stale).toHaveCount(0);
    await expect(
      page.getByRole('tab', { name: original.title, exact: true }),
    ).toBeFocused();
    await page.getByRole('tab', { name: 'Library', exact: true }).click();
    await page
      .getByRole('button', { name: '打开会话 原会话 分支', exact: true })
      .click();
    await page.mouse.move(0, 0);
    await expect(page.locator('.session-branch-hint')).toHaveCount(0);
  } finally {
    await app.close();
    expect(await captureFixtureHashAfterClose(fixtureRoot)).toBe(before);
  }
});

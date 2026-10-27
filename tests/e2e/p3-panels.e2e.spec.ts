import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Locator,
  type Page,
} from '@playwright/test';

import {
  captureFixtureHash,
  captureFixtureHashAfterClose,
} from './fixture-integrity';
import { newSessionForProject } from './session-ui';

/**
 * P3-A (#17) Real E2E: the 上下文 / 能力 / 运行日志 dock panels read the real
 * per-session run view that main projects from the actual run context. The
 * controlled adapter still drives the real main → preload → renderer path, so
 * every assertion below comes from main-observed material reads and tool
 * outcomes, never from a fabricated demo list. Fixtures stay untouched and the
 * Chromium profile stays in an isolated userData directory.
 */

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

const launchApplication = async (
  userDataDir: string,
  runScriptPath: string,
): Promise<ElectronApplication> =>
  electron.launch({
    executablePath: electronExecutablePath,
    args: [desktopDir],
    env: {
      ...process.env,
      PIONEER_E2E: '1',
      PIONEER_E2E_ROOT: fixtureRoot,
      PIONEER_E2E_USER_DATA: userDataDir,
      PIONEER_E2E_RUN_ADAPTER: 'controlled',
      PIONEER_E2E_RUN_SCRIPT: runScriptPath,
    },
  });

const writeRunScript = async (dir: string, script: object): Promise<string> => {
  const scriptPath = path.join(dir, 'run-script.json');
  await writeFile(scriptPath, JSON.stringify(script), 'utf-8');
  return scriptPath;
};

/**
 * The default 1200×800 window only fits the conversation plus one dock panel
 * (170px minimum per panel); three opened panels are temporarily collapsed
 * there. Panel tests run in a taller window so all three are really docked.
 */
const resizeWorkbench = async (
  application: ElectronApplication,
  width: number,
  height: number,
): Promise<void> => {
  await application.evaluate(
    ({ BrowserWindow }, size) => {
      BrowserWindow.getAllWindows()[0]?.setContentSize(size.width, size.height);
    },
    { width, height },
  );
};

type PanelLabel = '上下文' | '能力' | '运行日志';

const panelIdByLabel: Record<PanelLabel, string> = {
  能力: 'capabilities',
  上下文: 'context',
  运行日志: 'runlog',
};

const dockPanel = (page: Page, label: PanelLabel): Locator =>
  page.locator(`.dock-panel[data-panel-id="${panelIdByLabel[label]}"]`);

const moduleMenu = (page: Page): Locator =>
  page.getByLabel('模块', { exact: true });

/** Opens a dock panel from the workbench toolbar; the menu marks it with ✓. */
const openPanel = async (page: Page, label: PanelLabel): Promise<void> => {
  await moduleMenu(page).click();
  const item = page
    .locator('details.module-picker')
    .getByRole('button', { name: label });
  await expect(item).toBeVisible();
  if ((await item.getAttribute('aria-pressed')) !== 'true') await item.click();
  await moduleMenu(page).press('Escape');
  await expect(dockPanel(page, label)).toBeVisible();
};

/** The task box stays in the conversation; the event list moved to RunLog. */
const prepareTask = async (page: Page): Promise<void> => {
  await page.locator('details.run-log summary').click();
  await page
    .getByRole('textbox', { name: '运行任务' })
    .fill('读取 alpha-app 的 README 并总结内容。');
  await expect(page.locator('.run-materials label')).toHaveCount(3);
};

const startRun = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: '启动运行' }).click();
};

const waitForCompleted = (page: Page): Promise<void> =>
  expect(page.locator('.run-status', { hasText: '已完成' })).toBeVisible({
    timeout: 10_000,
  });

const activeElementPlacement = async (
  page: Page,
): Promise<{
  inAnyPanel: boolean;
  inOptionalPanel: boolean;
  tag: string;
}> =>
  page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement))
      return { inAnyPanel: true, inOptionalPanel: true, tag: 'none' };
    return {
      inAnyPanel: active.closest('.dock-panel') !== null,
      inOptionalPanel:
        active.closest('.dock-panel:not([data-panel-id="conversation"])') !==
        null,
      tag: active.tagName,
    };
  });

test('context panel shows only approved materials and marks the actually-read file', async ({}, testInfo) => {
  const beforeHash = await captureFixtureHash(fixtureRoot);
  const outputDir = testInfo.outputPath('run');
  await mkdir(outputDir, { recursive: true });
  const userDataDir = testInfo.outputPath('user-data');
  await mkdir(userDataDir, { recursive: true });
  const scriptPath = await writeRunScript(outputDir, {
    steps: [
      { action: 'text', text: '我先读取 README。' },
      {
        action: 'tool',
        request: { tool: 'read_file', arguments: { path: 'README.md' } },
      },
      { action: 'text', text: 'README 已读取。' },
      { action: 'complete' },
    ],
  });

  const application = await launchApplication(userDataDir, scriptPath);
  try {
    const page = await application.firstWindow();
    await resizeWorkbench(application, 1600, 1200);
    await newSessionForProject(page, 'alpha-app', 'context-run');
    await prepareTask(page);

    // The default manifest is every bounded candidate in the fixture project.
    await expect(page.locator('.run-materials input:checked')).toHaveCount(3);

    await openPanel(page, '上下文');
    await openPanel(page, '能力');
    await openPanel(page, '运行日志');

    await startRun(page);
    await waitForCompleted(page);

    const context = dockPanel(page, '上下文');
    await expect(context.locator('.module-run-identity')).toContainText(
      '会话 · context-run',
    );
    await expect(context.locator('.module-run-identity')).toContainText(
      /运行 run:[0-9a-f]{32} · 修订 1 · 已完成/,
    );
    await expect(
      context
        .locator('.run-material', { hasText: 'README.md' })
        .locator('.run-material__state'),
    ).toHaveText('已读取');
    await expect(
      context
        .locator('.run-material', { hasText: 'package.json' })
        .locator('.run-material__state'),
    ).toHaveText('已批准 · 未读取');
    const materialPaths = await context
      .locator('.run-material__path')
      .allInnerTexts();
    expect(materialPaths.sort()).toEqual(
      ['README.md', 'nested/not-a-project.txt', 'package.json'].sort(),
    );

    const capabilities = dockPanel(page, '能力');
    await expect(
      capabilities
        .locator('.capability-list > div', { hasText: '读取文件' })
        .locator('dd'),
    ).toHaveText('可用 · 只读');
    await expect(capabilities.locator('.capability-call')).toHaveCount(1);
    await expect(capabilities.locator('.capability-state')).toHaveText(
      '已完成',
    );

    const runlog = dockPanel(page, '运行日志');
    await expect(
      runlog.getByText('工具请求：read_file', { exact: true }),
    ).toBeVisible();
    await expect(
      runlog.locator('.run-event--host', { hasText: '已完成' }),
    ).toBeVisible();
  } finally {
    try {
      await application.close();
    } finally {
      expect(await captureFixtureHashAfterClose(fixtureRoot)).toBe(beforeHash);
    }
  }
});

test('rejection is not shown as an empty success', async ({}, testInfo) => {
  const beforeHash = await captureFixtureHash(fixtureRoot);
  const outputDir = testInfo.outputPath('run');
  await mkdir(outputDir, { recursive: true });
  const userDataDir = testInfo.outputPath('user-data');
  await mkdir(userDataDir, { recursive: true });
  const scriptPath = await writeRunScript(outputDir, {
    steps: [
      {
        action: 'tool',
        request: { tool: 'read_file', arguments: { path: 'package.json' } },
      },
      { action: 'text', text: '读取结束。' },
      { action: 'complete' },
    ],
  });

  const application = await launchApplication(userDataDir, scriptPath);
  try {
    const page = await application.firstWindow();
    await resizeWorkbench(application, 1600, 1200);
    await newSessionForProject(page, 'alpha-app', 'rejected-run');
    await prepareTask(page);

    // package.json leaves the egress manifest, so the tool request must be
    // refused instead of returning file content.
    const packageToggle = page
      .locator('.run-materials label', { hasText: 'package.json' })
      .locator('input');
    await packageToggle.uncheck();
    await expect(packageToggle).not.toBeChecked();
    await expect(page.locator('.run-materials input:checked')).toHaveCount(2);

    await openPanel(page, '上下文');
    await openPanel(page, '能力');
    await openPanel(page, '运行日志');

    await startRun(page);
    await waitForCompleted(page);

    const capabilities = dockPanel(page, '能力');
    await expect(capabilities.locator('.capability-call')).toHaveCount(1);
    await expect(capabilities.locator('.capability-state')).toHaveText(
      '已拒绝',
    );
    await expect(capabilities.locator('.capability-call')).toContainText(
      'MATERIAL_NOT_ALLOWED',
    );

    const runlog = dockPanel(page, '运行日志');
    await expect(
      runlog.locator('.run-event', {
        hasText: 'rejected · MATERIAL_NOT_ALLOWED',
      }),
    ).toBeVisible();

    // A file outside the manifest must never be presented as approved, so it
    // has no material row at all; nothing that the run refused is marked read.
    const context = dockPanel(page, '上下文');
    await expect(context.locator('.run-material')).toHaveCount(2);
    await expect(
      context.locator('.run-material', { hasText: 'package.json' }),
    ).toHaveCount(0);
    await expect(
      context.locator('.run-material', { hasText: 'README.md' }),
    ).toHaveCount(1);
    await expect(
      context
        .locator('.run-material', { hasText: 'README.md' })
        .locator('.run-material__state'),
    ).toHaveText('已批准 · 未读取');
    await expect(
      context.locator('.run-material__state', { hasText: '已读取' }),
    ).toHaveCount(0);
  } finally {
    try {
      await application.close();
    } finally {
      expect(await captureFixtureHashAfterClose(fixtureRoot)).toBe(beforeHash);
    }
  }
});

test('two sessions in one project never share panels', async ({}, testInfo) => {
  const beforeHash = await captureFixtureHash(fixtureRoot);
  const outputDir = testInfo.outputPath('run');
  await mkdir(outputDir, { recursive: true });
  const userDataDir = testInfo.outputPath('user-data');
  await mkdir(userDataDir, { recursive: true });
  const scriptPath = await writeRunScript(outputDir, {
    steps: [
      {
        action: 'tool',
        request: { tool: 'read_file', arguments: { path: 'README.md' } },
      },
      { action: 'text', text: 'alpha-run 已完成读取。' },
      { action: 'complete' },
    ],
  });

  const application = await launchApplication(userDataDir, scriptPath);
  try {
    const page = await application.firstWindow();
    await resizeWorkbench(application, 1600, 1200);

    await newSessionForProject(page, 'alpha-app', 'alpha-run');
    await prepareTask(page);
    await startRun(page);
    await waitForCompleted(page);

    // Session B belongs to the same project but never started a run.
    await newSessionForProject(page, 'alpha-app', 'beta-run');
    await openPanel(page, '上下文');
    await openPanel(page, '能力');
    await openPanel(page, '运行日志');

    const betaContext = dockPanel(page, '上下文');
    await expect(betaContext.locator('.module-run-identity')).toContainText(
      '会话 · beta-run',
    );
    await expect(betaContext.locator('.module-run-identity')).toContainText(
      '本会话尚未启动运行',
    );
    await expect(
      betaContext.getByRole('heading', { name: '还没有可查看的上下文' }),
    ).toBeVisible();
    await expect(betaContext.locator('.run-material')).toHaveCount(0);

    const betaCapabilities = dockPanel(page, '能力');
    await expect(
      betaCapabilities.getByText('还没有运行，因此没有工具调用。'),
    ).toBeVisible();
    await expect(betaCapabilities.locator('.capability-call')).toHaveCount(0);

    const betaRunlog = dockPanel(page, '运行日志');
    await expect(
      betaRunlog.getByRole('heading', { name: '还没有运行日志' }),
    ).toBeVisible();
    await expect(betaRunlog.locator('.run-event')).toHaveCount(0);

    // Back to session A: its own run context is still there, unshared.
    await page.getByRole('tab', { name: 'alpha-run', exact: true }).click();
    await expect(
      page.getByRole('tab', { name: 'alpha-run', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    await openPanel(page, '上下文');
    const alphaContext = dockPanel(page, '上下文');
    await expect(alphaContext.locator('.module-run-identity')).toContainText(
      '会话 · alpha-run',
    );
    await expect(alphaContext.locator('.module-run-identity')).toContainText(
      /运行 run:[0-9a-f]{32} · 修订 1 · 已完成/,
    );
    await expect(
      alphaContext
        .locator('.run-material', { hasText: 'README.md' })
        .locator('.run-material__state'),
    ).toHaveText('已读取');
  } finally {
    try {
      await application.close();
    } finally {
      expect(await captureFixtureHashAfterClose(fixtureRoot)).toBe(beforeHash);
    }
  }
});

test('opening panels keeps the draft and does not steal focus', async ({}, testInfo) => {
  const beforeHash = await captureFixtureHash(fixtureRoot);
  const outputDir = testInfo.outputPath('run');
  await mkdir(outputDir, { recursive: true });
  const userDataDir = testInfo.outputPath('user-data');
  await mkdir(userDataDir, { recursive: true });
  const scriptPath = await writeRunScript(outputDir, {
    steps: [
      { action: 'text', text: '正在生成回答。' },
      { action: 'wait', ms: 3_000 },
      { action: 'complete' },
    ],
  });

  const application = await launchApplication(userDataDir, scriptPath);
  try {
    const page = await application.firstWindow();
    await resizeWorkbench(application, 1600, 1200);
    await newSessionForProject(page, 'alpha-app', 'draft-run');
    const composer = page.getByRole('textbox', { name: '给 Agent 的消息' });
    const draft = '这是一段不能被面板抢走的草稿。';
    await composer.fill(draft);

    await openPanel(page, '上下文');
    await openPanel(page, '能力');
    await openPanel(page, '运行日志');

    await expect(composer).toHaveValue(draft);
    const placement = await activeElementPlacement(page);
    expect(
      placement.inOptionalPanel,
      `activeElement is <${placement.tag}> inside a context/capabilities/runlog panel`,
    ).toBe(false);
    expect(
      placement.inAnyPanel,
      `activeElement is <${placement.tag}> inside a dock panel`,
    ).toBe(false);

    await prepareTask(page);
    await startRun(page);
    await expect(
      page.locator('.run-status', { hasText: '运行中' }),
    ).toBeVisible();
    await expect(composer).toHaveValue(draft);
    await waitForCompleted(page);
    await expect(composer).toHaveValue(draft);
    const afterRun = await activeElementPlacement(page);
    expect(
      afterRun.inOptionalPanel,
      `run completion moved focus into <${afterRun.tag}> inside a context/capabilities/runlog panel`,
    ).toBe(false);
  } finally {
    try {
      await application.close();
    } finally {
      expect(await captureFixtureHashAfterClose(fixtureRoot)).toBe(beforeHash);
    }
  }
});

test('keyboard opens a dock panel and keeps focus in the toolbar', async ({}, testInfo) => {
  const beforeHash = await captureFixtureHash(fixtureRoot);
  const userDataDir = testInfo.outputPath('user-data');
  await mkdir(userDataDir, { recursive: true });
  const outputDir = testInfo.outputPath('run');
  await mkdir(outputDir, { recursive: true });
  const scriptPath = await writeRunScript(outputDir, {
    steps: [{ action: 'complete' }],
  });

  const application = await launchApplication(userDataDir, scriptPath);
  try {
    const page = await application.firstWindow();
    await resizeWorkbench(application, 1600, 1200);
    await newSessionForProject(page, 'alpha-app', 'keyboard-run');

    const menu = page.locator('details.module-picker');
    const summary = page.getByLabel('模块', { exact: true });
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(menu).toHaveAttribute('open', '');

    // Tab moves into the menu's first item; Enter activates it.
    await page.keyboard.press('Tab');
    const focusedItem = await page.evaluate(() => {
      const active = document.activeElement;
      return active instanceof HTMLElement ? active.textContent.trim() : '';
    });
    expect(focusedItem).toContain('上下文');
    await page.keyboard.press('Enter');
    const context = dockPanel(page, '上下文');
    await expect(context).toBeVisible();
    await expect(menu.getByRole('button', { name: '上下文' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // The dock panel itself is a named region for screen-reader navigation.
    await expect(page.getByRole('region', { name: '上下文' })).toBeVisible();
    await expect(context.locator('.module-run-identity')).toContainText(
      '会话 · keyboard-run',
    );

    // Escape closes the menu and returns focus to its summary.
    await page.keyboard.press('Escape');
    await expect(menu).not.toHaveAttribute('open', '');
    expect(
      await page.evaluate(() => {
        const active = document.activeElement;
        return active instanceof HTMLElement
          ? active.getAttribute('aria-label')
          : null;
      }),
    ).toBe('模块');
  } finally {
    try {
      await application.close();
    } finally {
      expect(await captureFixtureHashAfterClose(fixtureRoot)).toBe(beforeHash);
    }
  }
});

test('panels survive a real restart with the persisted run summary', async ({}, testInfo) => {
  const beforeHash = await captureFixtureHash(fixtureRoot);
  const outputDir = testInfo.outputPath('run');
  await mkdir(outputDir, { recursive: true });
  const userDataDir = testInfo.outputPath('user-data');
  await mkdir(userDataDir, { recursive: true });
  const scriptPath = await writeRunScript(outputDir, {
    steps: [
      {
        action: 'tool',
        request: { tool: 'read_file', arguments: { path: 'README.md' } },
      },
      { action: 'text', text: 'README 读取完成。' },
      { action: 'complete' },
    ],
  });

  let application = await launchApplication(userDataDir, scriptPath);
  try {
    let page = await application.firstWindow();
    await resizeWorkbench(application, 1600, 1200);
    await newSessionForProject(page, 'alpha-app', 'restart-run');
    await prepareTask(page);
    await startRun(page);
    await waitForCompleted(page);

    await openPanel(page, '上下文');
    await openPanel(page, '运行日志');
    await expect(
      dockPanel(page, '上下文')
        .locator('.run-material', { hasText: 'README.md' })
        .locator('.run-material__state'),
    ).toHaveText('已读取');

    const identityBefore = await dockPanel(page, '运行日志')
      .locator('.module-run-identity')
      .innerText();
    const runId = /运行 (run:[0-9a-f]{32}) · 修订 1 · 已完成/.exec(
      identityBefore,
    )?.[1];
    if (runId === undefined)
      throw new Error(`Run identity did not carry a runId: ${identityBefore}`);

    await page.getByRole('button', { name: '保存布局', exact: true }).click();
    await expect(
      page.getByText('布局已保存 · 下次回到此会话时恢复'),
    ).toBeVisible();
    await application.close();

    application = await launchApplication(userDataDir, scriptPath);
    page = await application.firstWindow();
    await resizeWorkbench(application, 1600, 1200);
    await page.getByRole('tab', { name: 'restart-run', exact: true }).click();
    await expect(
      page.getByRole('tab', { name: 'restart-run', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');

    const context = dockPanel(page, '上下文');
    await expect(context).toBeVisible();
    await expect(context.locator('.module-run-identity')).toContainText(
      `运行 ${runId} · 修订 1 · 已完成`,
    );
    await expect(context.locator('.module-run-identity')).toContainText(
      '这是本机保存的上次运行摘要；事件流不持久化，重启后只显示摘要。',
    );
    await expect(
      context
        .locator('.run-material', { hasText: 'README.md' })
        .locator('.run-material__state'),
    ).toHaveText('已读取');

    const runlog = dockPanel(page, '运行日志');
    await expect(runlog).toBeVisible();
    await expect(runlog.locator('.module-run-identity')).toContainText(
      `运行 ${runId}`,
    );
    await expect(
      runlog.getByRole('heading', { name: '调用摘要' }),
    ).toBeVisible();
    await expect(
      runlog.locator('[aria-label="运行调用摘要"] .run-event'),
    ).toHaveCount(1);
    await expect(
      runlog.getByText(
        '事件流仅保存在运行期间；重启后这里显示有界调用摘要，不重放未保存的事件。',
      ),
    ).toBeVisible();
    // The wire events are not persisted, so a live-stream row must not appear.
    await expect(runlog.getByText('工具请求：read_file')).toHaveCount(0);
  } finally {
    try {
      await application.close();
    } finally {
      expect(await captureFixtureHashAfterClose(fixtureRoot)).toBe(beforeHash);
    }
  }
});

test('narrow window keeps panels reachable', async ({}, testInfo) => {
  const beforeHash = await captureFixtureHash(fixtureRoot);
  const outputDir = testInfo.outputPath('run');
  await mkdir(outputDir, { recursive: true });
  const userDataDir = testInfo.outputPath('user-data');
  await mkdir(userDataDir, { recursive: true });
  const scriptPath = await writeRunScript(outputDir, {
    steps: [
      {
        action: 'tool',
        request: { tool: 'read_file', arguments: { path: 'README.md' } },
      },
      { action: 'text', text: '窄窗运行结束。' },
      { action: 'complete' },
    ],
  });

  const application = await launchApplication(userDataDir, scriptPath);
  try {
    const page = await application.firstWindow();
    await resizeWorkbench(application, 1600, 1200);
    await newSessionForProject(page, 'alpha-app', 'narrow-run');
    await prepareTask(page);
    await startRun(page);
    await waitForCompleted(page);

    // 640px is below the dock's 760px compact threshold, so the panel is
    // temporarily collapsed into the overflow menu instead of being lost.
    await resizeWorkbench(application, 640, 480);
    const overflow = page.locator('.dock-overflow');
    const runlogDock = dockPanel(page, '运行日志');
    const anyEntryPoint = runlogDock.or(overflow);
    await moduleMenu(page).click();
    const runlogItem = page
      .locator('details.module-picker')
      .getByRole('button', { name: '运行日志' });
    await expect(runlogItem).toBeVisible();
    if ((await runlogItem.getAttribute('aria-pressed')) !== 'true')
      await runlogItem.click();
    await moduleMenu(page).press('Escape');
    await expect(anyEntryPoint).toBeVisible();
    await expect(overflow).toBeVisible();

    await overflow.locator('summary').click();
    await overflow.getByRole('button', { name: '运行日志' }).click();
    const expanded = page.getByRole('dialog', { name: '运行日志 · 临时展开' });
    await expect(expanded).toBeVisible();
    await expect(
      expanded.locator('.run-event', { hasText: '工具请求：read_file' }),
    ).toBeVisible();
    await expect(
      expanded.locator('.run-event--host', { hasText: '已完成' }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(expanded).toHaveCount(0);
  } finally {
    try {
      await application.close();
    } finally {
      expect(await captureFixtureHashAfterClose(fixtureRoot)).toBe(beforeHash);
    }
  }
});

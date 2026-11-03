import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { TestInfo } from '@playwright/test';

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';

import {
  captureFixtureHash,
  captureFixtureHashAfterClose,
} from './fixture-integrity';
import { newSessionForProject } from './session-ui';

/**
 * P4-A (#19) Real E2E: a controlled adapter proposes one `replace_file`, main
 * builds the preview, and the user rejects, approves or re-reads it through the
 * real main → preload → renderer path. Every write happens in a per-test copy
 * of the fixture; the committed fixture must keep its exact hash.
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

const ORIGINAL_README = '# Alpha app\n\nAn alpha application fixture.\n';
const REVIEWED_README =
  '# Alpha app\n\nAn alpha application fixture.\n\nReviewed change.\n';

const copyWorkspace = async (testInfo: TestInfo): Promise<string> => {
  const workspace = testInfo.outputPath('workspace');
  await mkdir(workspace, { recursive: true });
  await cp(fixtureRoot, workspace, { recursive: true });
  return workspace;
};

const launchApplication = async (
  workspace: string,
  userDataDir: string,
  runScriptPath: string,
): Promise<ElectronApplication> => {
  await mkdir(userDataDir, { recursive: true });
  return electron.launch({
    executablePath: electronExecutablePath,
    args: [desktopDir],
    env: {
      ...process.env,
      PIONEER_E2E: '1',
      PIONEER_E2E_ROOT: workspace,
      PIONEER_E2E_USER_DATA: userDataDir,
      PIONEER_E2E_RUN_ADAPTER: 'controlled',
      PIONEER_E2E_RUN_SCRIPT: runScriptPath,
    },
  });
};

const writeRunScript = async (
  dir: string,
  content: string,
): Promise<string> => {
  await mkdir(dir, { recursive: true });
  const scriptPath = path.join(dir, 'run-script.json');
  await writeFile(
    scriptPath,
    JSON.stringify({
      steps: [
        { action: 'text', text: '准备提交一次 README 修改。' },
        { action: 'propose_write', path: 'README.md', content },
        { action: 'complete' },
      ],
    }),
    'utf-8',
  );
  return scriptPath;
};

const resizeWorkbench = async (
  application: ElectronApplication,
): Promise<void> => {
  await application.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 1000);
  }, undefined);
};

const openRunControls = async (page: Page): Promise<void> => {
  await page.locator('details.run-log summary').click();
};

const choosePermission = async (page: Page, label: string): Promise<void> => {
  await page.getByRole('radio', { name: label, exact: true }).check();
  await expect(
    page.getByText('写入权限已保存到这个会话', { exact: true }),
  ).toBeVisible();
};

const startRun = async (page: Page, task = '把 README 更新为已审阅版本。') => {
  await page.getByRole('textbox', { name: '运行任务' }).fill(task);
  await page.getByRole('button', { name: '启动运行' }).click();
  await expect(page.locator('.run-status', { hasText: '已完成' })).toBeVisible({
    timeout: 10_000,
  });
};

/** Opens the 改动 dock module; panel buttons mark an open panel with ✓. */
const openDiffPanel = async (page: Page): Promise<void> => {
  const menu = page.getByLabel('模块', { exact: true });
  await menu.click();
  const item = page
    .locator('details.module-picker')
    .getByRole('button', { name: '改动' });
  await expect(item).toBeVisible();
  if ((await item.getAttribute('aria-pressed')) !== 'true') await item.click();
  await menu.press('Escape');
  await expect(page.locator('.dock-panel[data-panel-id="diff"]')).toBeVisible();
};

const previewList = (page: Page) => page.locator('.write-preview-list__item');

test('previews, rejects without touching the file, then applies a reviewed change', async ({}, testInfo) => {
  const beforeHash = await captureFixtureHash(fixtureRoot);
  const workspace = await copyWorkspace(testInfo);
  const scriptPath = await writeRunScript(
    testInfo.outputPath('run'),
    REVIEWED_README,
  );
  const application = await launchApplication(
    workspace,
    testInfo.outputPath('user-data'),
    scriptPath,
  );
  try {
    const page = await application.firstWindow();
    await resizeWorkbench(application);
    await newSessionForProject(page, 'alpha-app');
    await openRunControls(page);
    await choosePermission(page, '工作区内修改');
    await startRun(page);
    await openDiffPanel(page);

    await expect(previewList(page)).toHaveCount(1);
    await expect(previewList(page).first()).toContainText('README.md');
    await expect(previewList(page).first()).toContainText('待审阅');
    const diff = page.locator('.write-diff__text');
    await expect(diff).toContainText('An alpha application fixture.');
    await expect(diff).toContainText('+Reviewed change.');
    await expect(page.locator('.write-target__header')).toContainText(
      '写入前 SHA-256',
    );

    await page.getByRole('button', { name: '拒绝修改' }).click();
    await expect(page.getByText('这份预览状态：')).toContainText('已拒绝');
    expect(
      await readFile(path.join(workspace, 'alpha-app', 'README.md'), 'utf-8'),
    ).toBe(ORIGINAL_README);

    // A second run is a fresh revision; the first rejected preview stays listed.
    await startRun(page, '再提交一次 README 修改。');
    await expect(previewList(page)).toHaveCount(2);
    await page.getByRole('button', { name: '批准写入' }).click();
    await expect(
      page.getByRole('heading', { name: '已写入 1 个目标' }),
    ).toBeVisible();
    expect(
      await readFile(path.join(workspace, 'alpha-app', 'README.md'), 'utf-8'),
    ).toBe(REVIEWED_README);
  } finally {
    try {
      await application.close();
    } finally {
      expect(await captureFixtureHashAfterClose(fixtureRoot)).toBe(beforeHash);
    }
  }
});

test('refuses a changed target, re-reads it and applies only the re-reviewed revision', async ({}, testInfo) => {
  const beforeHash = await captureFixtureHash(fixtureRoot);
  const workspace = await copyWorkspace(testInfo);
  const scriptPath = await writeRunScript(
    testInfo.outputPath('run'),
    REVIEWED_README,
  );
  const application = await launchApplication(
    workspace,
    testInfo.outputPath('user-data'),
    scriptPath,
  );
  try {
    const page = await application.firstWindow();
    await resizeWorkbench(application);
    await newSessionForProject(page, 'alpha-app');
    await openRunControls(page);
    await choosePermission(page, '工作区内修改');
    await startRun(page);
    await openDiffPanel(page);
    await expect(previewList(page)).toHaveCount(1);

    // The user edits the target after the preview was shown.
    await writeFile(
      path.join(workspace, 'alpha-app', 'README.md'),
      '# Alpha app\n\nA user edit after the preview.\n',
      'utf-8',
    );
    await page.getByRole('button', { name: '批准写入' }).click();
    await expect(page.getByRole('alert')).toContainText(
      '目标文件在预览后已被修改',
    );
    expect(
      await readFile(path.join(workspace, 'alpha-app', 'README.md'), 'utf-8'),
    ).toBe('# Alpha app\n\nA user edit after the preview.\n');
    await expect(page.locator('.write-preview__header')).toContainText(
      '预览 1',
    );

    await page.getByRole('button', { name: '重新读取目标' }).click();
    await expect(page.locator('.write-preview__header')).toContainText(
      '预览 2',
    );
    await expect(page.locator('.write-diff__text')).toContainText(
      '-A user edit after the preview.',
    );
    await page.getByRole('button', { name: '批准写入' }).click();
    await expect(
      page.getByRole('heading', { name: '已写入 1 个目标' }),
    ).toBeVisible();
    expect(
      await readFile(path.join(workspace, 'alpha-app', 'README.md'), 'utf-8'),
    ).toBe(REVIEWED_README);
  } finally {
    try {
      await application.close();
    } finally {
      expect(await captureFixtureHashAfterClose(fixtureRoot)).toBe(beforeHash);
    }
  }
});

test('refuses to apply under read-only without changing the file', async ({}, testInfo) => {
  const beforeHash = await captureFixtureHash(fixtureRoot);
  const workspace = await copyWorkspace(testInfo);
  const scriptPath = await writeRunScript(
    testInfo.outputPath('run'),
    REVIEWED_README,
  );
  const application = await launchApplication(
    workspace,
    testInfo.outputPath('user-data'),
    scriptPath,
  );
  try {
    const page = await application.firstWindow();
    await resizeWorkbench(application);
    await newSessionForProject(page, 'alpha-app');
    await openRunControls(page);
    await choosePermission(page, '仅可查看');
    await startRun(page);
    await openDiffPanel(page);
    await expect(previewList(page)).toHaveCount(1);

    await page.getByRole('button', { name: '批准写入' }).click();
    await expect(page.getByRole('alert')).toContainText('当前权限为仅可查看');
    expect(
      await readFile(path.join(workspace, 'alpha-app', 'README.md'), 'utf-8'),
    ).toBe(ORIGINAL_README);
  } finally {
    try {
      await application.close();
    } finally {
      expect(await captureFixtureHashAfterClose(fixtureRoot)).toBe(beforeHash);
    }
  }
});

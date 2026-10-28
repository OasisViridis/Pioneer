import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import {
  _electron as electron,
  expect,
  test,
  type Page,
} from '@playwright/test';

import {
  captureFixtureHash,
  captureFixtureHashAfterClose,
} from './fixture-integrity';
import { newSessionForProject } from './session-ui';

/**
 * P2 read-only harness Real E2E (#13): a controlled model injected through
 * the E2E-only launch guard drives the real main → preload → renderer path,
 * executes a real read-only tool against the fixture, streams text, and stops
 * mid-run. Fixture hashes must not change and the Chromium profile stays in
 * an isolated userData directory.
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

const launchApplication = async (userDataDir: string, runScriptPath: string) =>
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

const prepareTask = async (page: Page): Promise<void> => {
  await page.locator('details.run-log summary').click();
  await page
    .getByRole('textbox', { name: '运行任务' })
    .fill('读取 alpha-app 的 README 并总结内容。');
};

test('completes a controlled read-only run with a real tool result and unchanged fixtures', async ({}, testInfo) => {
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
      { action: 'text', text: 'README 总结：这是一个 alpha 应用 fixture。' },
      { action: 'complete' },
    ],
  });

  const application = await launchApplication(userDataDir, scriptPath);
  try {
    const page = await application.firstWindow();
    await newSessionForProject(page, 'alpha-app');
    await prepareTask(page);

    await expect(page.locator('.hazel-companion')).toHaveCount(1);
    await page.getByRole('button', { name: '启动运行' }).click();
    await expect(page.locator('.hazel-companion')).toHaveCount(0);

    await expect(
      page.getByText('工具请求：read_file', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(/An alpha application fixture\./),
    ).toBeVisible();
    await expect(
      page.locator('.run-status', { hasText: '已完成' }),
    ).toBeVisible({
      timeout: 10_000,
    });

    const journalPath = path.join(userDataDir, 'runs', 'journal.jsonl');
    const journal = await readFile(journalPath, 'utf-8');
    expect(journal).toContain('"kind":"accept"');
    expect(journal).toContain('"kind":"terminal"');
    expect(journal).toContain('"adapter":"controlled"');
  } finally {
    try {
      await application.close();
    } finally {
      expect(await captureFixtureHashAfterClose(fixtureRoot)).toBe(beforeHash);
    }
  }
});

test('persists each session task and result across an app restart', async ({}, testInfo) => {
  const beforeHash = await captureFixtureHash(fixtureRoot);
  const outputDir = testInfo.outputPath('run');
  await mkdir(outputDir, { recursive: true });
  const userDataDir = testInfo.outputPath('user-data');
  await mkdir(userDataDir, { recursive: true });
  const taskText = '读取 alpha-app 的 README 并总结内容。';
  const resultText = '受控结果：alpha fixture 已读取。';
  const scriptPath = await writeRunScript(outputDir, {
    steps: [{ action: 'text', text: resultText }, { action: 'complete' }],
  });

  let application = await launchApplication(userDataDir, scriptPath);
  try {
    let page = await application.firstWindow();
    await newSessionForProject(page, 'alpha-app');
    await prepareTask(page);
    await page.getByRole('button', { name: '启动运行' }).click();
    await expect(
      page.locator('.run-status', { hasText: '已完成' }),
    ).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator('.run-history')).toContainText(taskText);
    await expect(page.locator('.run-history')).toContainText(resultText);
    await application.close();

    application = await launchApplication(userDataDir, scriptPath);
    page = await application.firstWindow();
    await page.getByRole('tab', { name: 'alpha-app', exact: true }).click();
    await page.locator('details.run-log summary').click();
    await expect(page.locator('.run-history')).toContainText(taskText);
    await expect(page.locator('.run-history')).toContainText(resultText);
  } finally {
    try {
      await application.close();
    } finally {
      expect(await captureFixtureHashAfterClose(fixtureRoot)).toBe(beforeHash);
    }
  }
});

test('rejects file content the user did not add to the egress manifest', async ({}, testInfo) => {
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
    await newSessionForProject(page, 'alpha-app');
    await prepareTask(page);
    await page
      .locator('.run-materials label', { hasText: 'package.json' })
      .locator('input')
      .uncheck();
    await page.getByRole('button', { name: '启动运行' }).click();
    await expect(
      page.locator('.run-status', { hasText: '已完成' }),
    ).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.locator('.run-event', {
        hasText: 'rejected · MATERIAL_NOT_ALLOWED',
      }),
    ).toBeVisible();
  } finally {
    try {
      await application.close();
    } finally {
      expect(await captureFixtureHashAfterClose(fixtureRoot)).toBe(beforeHash);
    }
  }
});

test('stops mid-run and shows 已停止 only after background convergence', async ({}, testInfo) => {
  const beforeHash = await captureFixtureHash(fixtureRoot);
  const outputDir = testInfo.outputPath('run');
  await mkdir(outputDir, { recursive: true });
  const userDataDir = testInfo.outputPath('user-data');
  await mkdir(userDataDir, { recursive: true });
  const scriptPath = await writeRunScript(outputDir, {
    steps: [
      { action: 'text', text: '开始长时间分析。' },
      { action: 'wait', ms: 8_000 },
      { action: 'text', text: '不应出现的迟到文本' },
      { action: 'complete' },
    ],
  });

  const application = await launchApplication(userDataDir, scriptPath);
  try {
    const page = await application.firstWindow();
    await newSessionForProject(page, 'alpha-app');
    await prepareTask(page);

    await expect(page.locator('.hazel-companion')).toHaveCount(1);
    await page.getByRole('button', { name: '启动运行' }).click();
    await expect(page.locator('.hazel-companion')).toHaveCount(0);
    await expect(
      page.locator('.run-status', { hasText: '运行中' }),
    ).toBeVisible();

    // Closing a mapped SessionTab must not stop the background Run.
    await page
      .getByRole('button', { name: 'Close alpha-app', exact: true })
      .click();
    await page
      .getByRole('button', { name: '打开会话 alpha-app', exact: true })
      .click();
    await page.locator('details.run-log summary').click();
    await expect(
      page.locator('.run-status', { hasText: '运行中' }),
    ).toBeVisible();
    await expect(page.locator('.hazel-companion')).toHaveCount(0);
    const stopButton = page.getByRole('button', { name: '停止', exact: true });
    await stopButton.click();

    // The button's own feedback ("停止中…"，不可再点) or the already-confirmed
    // terminal state must be visible; convergence can complete within
    // the click's own round trip when the abort lands on the pending wait.
    await expect(
      page
        .getByRole('button', { name: '停止中…', exact: true })
        .or(page.locator('.run-status', { hasText: '已停止' })),
    ).toBeVisible();

    await expect(
      page.locator('.run-status', { hasText: '已停止' }),
    ).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText('不应出现的迟到文本')).toHaveCount(0);
  } finally {
    try {
      await application.close();
    } finally {
      expect(await captureFixtureHashAfterClose(fixtureRoot)).toBe(beforeHash);
    }
  }
});

test('allows a fresh authorized run after a stopped one converges', async ({}, testInfo) => {
  const beforeHash = await captureFixtureHash(fixtureRoot);
  const outputDir = testInfo.outputPath('run');
  await mkdir(outputDir, { recursive: true });
  const userDataDir = testInfo.outputPath('user-data');
  await mkdir(userDataDir, { recursive: true });
  const scriptPath = await writeRunScript(outputDir, {
    steps: [
      { action: 'text', text: '第一轮工作。' },
      { action: 'wait', ms: 8_000 },
      { action: 'complete' },
    ],
  });

  const application = await launchApplication(userDataDir, scriptPath);
  try {
    const page = await application.firstWindow();
    await newSessionForProject(page, 'alpha-app');
    await prepareTask(page);

    await expect(page.locator('.hazel-companion')).toHaveCount(1);
    await page.getByRole('button', { name: '启动运行' }).click();
    await expect(page.locator('.hazel-companion')).toHaveCount(0);
    await expect(
      page.locator('.run-status', { hasText: '运行中' }),
    ).toBeVisible();
    await page.getByRole('button', { name: '停止', exact: true }).click();
    await expect(
      page.locator('.run-status', { hasText: '已停止' }),
    ).toBeVisible({
      timeout: 10_000,
    });

    // A terminal run releases the session slot: the launch action returns.
    await expect(page.locator('.hazel-companion')).toHaveCount(0);
    await page.getByRole('button', { name: '启动运行' }).click();
    await expect(page.locator('.hazel-companion')).toHaveCount(0);
    await expect(
      page.locator('.run-status', { hasText: '运行中' }),
    ).toBeVisible();
    await page.getByRole('button', { name: '停止', exact: true }).click();
    await expect(
      page.locator('.run-status', { hasText: '已停止' }),
    ).toBeVisible({
      timeout: 10_000,
    });

    const journal = await readFile(
      path.join(userDataDir, 'runs', 'journal.jsonl'),
      'utf-8',
    );
    expect(journal.match(/"kind":"accept"/g)?.length).toBe(2);
    expect(journal.match(/"kind":"terminal"/g)?.length).toBe(2);
  } finally {
    try {
      await application.close();
    } finally {
      expect(await captureFixtureHashAfterClose(fixtureRoot)).toBe(beforeHash);
    }
  }
});

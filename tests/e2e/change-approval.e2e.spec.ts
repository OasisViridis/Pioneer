import {
  _electron as electron,
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import { hashFixtureTree } from '../helpers/hash-tree';
import { captureFixtureHash } from './fixture-integrity';
import { newSessionForProject } from './session-ui';

/**
 * #19 real Electron flow: a controlled run completes first, then main prepares
 * the reviewed request for the newest completed run, the renderer shows the real
 * diff, the source run identity and the S2 permission card, and only the approve
 * action crosses the write channel. Writes happen in a temporary copy of the
 * library fixture; the committed fixture is hashed before and after and never
 * changes.
 */

const desktop = path.join(process.cwd(), 'apps/desktop');
const fixtureRoot = path.join(
  process.cwd(),
  'tests/fixtures/workspaces/library',
);
const marker = '\n<!-- pioneer:change-approval-preview -->\n';
const executablePath = createRequire(path.join(desktop, 'package.json'))(
  'electron',
) as string;

const RUN_SCRIPT = {
  steps: [{ action: 'text', text: '受控运行完成。' }, { action: 'complete' }],
};

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function writeRunScript(info: TestInfo): Promise<string> {
  const outputDir = info.outputPath('run');
  await mkdir(outputDir, { recursive: true });
  const scriptPath = path.join(outputDir, 'run-script.json');
  await writeFile(scriptPath, JSON.stringify(RUN_SCRIPT), 'utf-8');
  return scriptPath;
}

async function launch(
  workspace: string,
  userData: string,
  runScriptPath: string,
) {
  await mkdir(userData, { recursive: true });
  // A host that itself runs inside Electron may export this; left set, the
  // Electron binary runs as plain Node and rejects Playwright's debug flags.
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return electron.launch({
    executablePath,
    args: [desktop],
    env: {
      ...env,
      PIONEER_E2E: '1',
      PIONEER_E2E_ROOT: workspace,
      PIONEER_E2E_USER_DATA: userData,
      PIONEER_E2E_RUN_ADAPTER: 'controlled',
      PIONEER_E2E_RUN_SCRIPT: runScriptPath,
    },
  });
}

async function makeWorkspace(info: TestInfo): Promise<string> {
  const workspace = info.outputPath('workspace');
  await mkdir(path.dirname(workspace), { recursive: true });
  await cp(fixtureRoot, workspace, { recursive: true });
  return workspace;
}

/** Completes one real controlled run so the review has a source identity. */
async function completeControlledRun(page: Page): Promise<void> {
  await page.locator('details.run-log summary').click();
  await page
    .getByRole('textbox', { name: '运行任务' })
    .fill('读取 alpha-app 的 README 并总结内容。');
  await page.getByRole('button', { name: '启动运行' }).click();
  await expect(page.locator('.run-status', { hasText: '已完成' })).toBeVisible({
    timeout: 10_000,
  });
}

/** Opens the session diff panel after a completed run and waits for prepare. */
async function openReviewPanel(page: Page): Promise<Locator> {
  await newSessionForProject(page, 'alpha-app');
  await completeControlledRun(page);
  await page.getByText('模块', { exact: true }).click();
  await page.getByRole('button', { name: '+ 改动', exact: true }).click();
  const panel = page.locator('[data-panel-id="diff"]');
  await expect(
    panel.getByRole('heading', { name: '受控变更审批', exact: true }),
  ).toBeVisible();
  // The review is bound to the completed run, not to an anonymous session.
  await expect(
    panel.getByText(/来源运行 run:[0-9a-f]+ · 修订 1/),
  ).toBeVisible();
  return panel;
}

/** Types a target and prepares it; main is the one that reads the file. */
async function prepareTarget(
  panel: Locator,
  targetPath = 'README.md',
): Promise<void> {
  if (targetPath !== 'README.md') {
    await panel
      .getByRole('textbox', { name: '目标路径（项目相对）' })
      .fill(targetPath);
  }
  await panel.getByRole('button', { name: '审阅受控变更' }).click();
  await expect(panel.locator('.change-review__diff')).toHaveAttribute(
    'data-target',
    targetPath,
  );
}

test('denying the prepared change keeps the target byte-identical', async ({}, info) => {
  const fixtureHashBefore = await captureFixtureHash(fixtureRoot);
  const workspace = await makeWorkspace(info);
  const readme = path.join(workspace, 'alpha-app/README.md');
  const workspaceBefore = await hashFixtureTree(workspace);
  const before = await readFile(readme);
  const app = await launch(
    workspace,
    info.outputPath('user-data'),
    await writeRunScript(info),
  );
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 1000),
    );
    const panel = await openReviewPanel(page);
    await prepareTarget(panel);

    await expect(
      panel
        .locator('.change-review__line--added')
        .filter({ hasText: 'pioneer:change-approval-preview' }),
    ).toHaveCount(1);
    await panel.getByRole('button', { name: '拒绝，不写入' }).click();

    await expect(
      panel.getByText('已拒绝；没有写入任何文件。可以修改需求后重新审阅。'),
    ).toBeVisible();
    await expect(panel.locator('.permission-card')).toHaveAttribute(
      'data-state',
      'Denied',
    );
    const after = await readFile(readme);
    expect(sha256(after)).toBe(sha256(before));
    expect(after.toString('utf8')).not.toContain(
      'pioneer:change-approval-preview',
    );
    expect(await hashFixtureTree(workspace)).toBe(workspaceBefore);
  } finally {
    try {
      await app.close();
    } finally {
      expect(await captureFixtureHash(fixtureRoot)).toBe(fixtureHashBefore);
      expect((await readFile(readme)).toString('utf8')).not.toContain(
        'pioneer:change-approval-preview',
      );
    }
  }
});

test('approving writes the reviewed bytes only after a verified read-back', async ({}, info) => {
  const fixtureHashBefore = await captureFixtureHash(fixtureRoot);
  const workspace = await makeWorkspace(info);
  const readme = path.join(workspace, 'alpha-app/README.md');
  const packageJson = path.join(workspace, 'alpha-app/package.json');
  const before = await readFile(readme, 'utf8');
  const packageBefore = await readFile(packageJson);
  const userData = info.outputPath('user-data');
  const app = await launch(workspace, userData, await writeRunScript(info));
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 1000),
    );
    const panel = await openReviewPanel(page);
    await prepareTarget(panel);

    // The preview comes from main's read, not from renderer-authored content.
    await expect(panel.locator('.change-review__diff')).toContainText(
      'BEFORE ',
    );
    await expect(
      panel
        .locator('.change-review__line--added')
        .filter({ hasText: 'pioneer:change-approval-preview' }),
    ).toHaveCount(1);
    const identityText = await panel
      .locator('.change-review__diff-header .metadata')
      .filter({ hasText: '来源运行' })
      .textContent();
    const runId = identityText?.match(/run:[0-9a-f]+/)?.[0];
    expect(runId).toBeDefined();
    await page.screenshot({
      path: info.outputPath('change-approval-review.png'),
    });

    await panel.getByRole('button', { name: '批准并写入' }).click();
    await expect(
      panel.getByText('已应用并回读校验：main 读到的字节与后像哈希一致。'),
    ).toBeVisible();
    await expect(panel.locator('.permission-card')).toHaveAttribute(
      'data-state',
      'Approved',
    );

    const after = await readFile(readme, 'utf8');
    expect(after).toBe(`${before}${marker}`);
    const afterHash = sha256(Buffer.from(after, 'utf8'));
    await expect(panel.locator('.change-review__result')).toContainText(
      afterHash.slice(0, 12),
    );
    await expect(panel.locator('.change-review__result')).toContainText(
      '已应用并回读校验',
    );
    // Only the reviewed target in the temp copy changed.
    expect(await readFile(packageJson)).toEqual(packageBefore);
    expect(afterHash).not.toBe(sha256(Buffer.from(before, 'utf8')));

    // The production journal path is userData, never the project.
    const journal = await readFile(
      path.join(userData, 'write-journal.jsonl'),
      'utf8',
    );
    const records = journal
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => JSON.parse(line) as { kind: string; runId: string });
    expect(records.map((record) => record.kind)).toEqual(['intent', 'applied']);
    expect(records.every((record) => record.runId === runId)).toBe(true);
    expect(
      await readFile(
        path.join(workspace, 'alpha-app/write-journal.jsonl'),
      ).catch(() => null),
    ).toBeNull();
  } finally {
    try {
      await app.close();
    } finally {
      expect(await captureFixtureHash(fixtureRoot)).toBe(fixtureHashBefore);
    }
  }
});

test('writes a non-README target typed by the user', async ({}, info) => {
  const fixtureHashBefore = await captureFixtureHash(fixtureRoot);
  const workspace = await makeWorkspace(info);
  const target = path.join(workspace, 'alpha-app/nested/not-a-project.txt');
  const readme = path.join(workspace, 'alpha-app/README.md');
  const targetBefore = await readFile(target, 'utf8');
  const readmeBefore = await readFile(readme, 'utf8');
  const app = await launch(
    workspace,
    info.outputPath('user-data'),
    await writeRunScript(info),
  );
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 1000),
    );
    const panel = await openReviewPanel(page);
    await prepareTarget(panel, 'nested/not-a-project.txt');

    await expect(
      panel.getByRole('heading', {
        name: '变更预览 · alpha-app/nested/not-a-project.txt',
      }),
    ).toBeVisible();
    await panel.getByRole('button', { name: '批准并写入' }).click();
    await expect(
      panel.getByText('已应用并回读校验：main 读到的字节与后像哈希一致。'),
    ).toBeVisible();

    expect(await readFile(target, 'utf8')).toBe(`${targetBefore}${marker}`);
    expect(await readFile(readme, 'utf8')).toBe(readmeBefore);
  } finally {
    try {
      await app.close();
    } finally {
      expect(await captureFixtureHash(fixtureRoot)).toBe(fixtureHashBefore);
    }
  }
});

test('refuses traversal and absolute target paths before prepare', async ({}, info) => {
  const fixtureHashBefore = await captureFixtureHash(fixtureRoot);
  const workspace = await makeWorkspace(info);
  const readme = path.join(workspace, 'alpha-app/README.md');
  const before = await readFile(readme, 'utf8');
  const app = await launch(
    workspace,
    info.outputPath('user-data'),
    await writeRunScript(info),
  );
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 1000),
    );
    const panel = await openReviewPanel(page);
    const input = panel.getByRole('textbox', { name: '目标路径（项目相对）' });
    const prepareButton = panel.getByRole('button', {
      name: '审阅受控变更',
    });

    for (const targetPath of ['../escape.txt', 'C:/Windows/win.ini']) {
      await input.fill(targetPath);
      await expect(panel.getByText(/路径必须是项目相对路径/)).toBeVisible();
      await expect(prepareButton).toBeDisabled();
      await expect(panel.locator('.change-review__diff')).toHaveCount(0);
    }

    expect(await readFile(readme, 'utf8')).toBe(before);
    expect(
      await readFile(path.join(workspace, 'escape.txt')).catch(() => null),
    ).toBeNull();
  } finally {
    try {
      await app.close();
    } finally {
      expect(await captureFixtureHash(fixtureRoot)).toBe(fixtureHashBefore);
    }
  }
});

test('read_only is refused by main and never shows an approve button', async ({}, info) => {
  const fixtureHashBefore = await captureFixtureHash(fixtureRoot);
  const workspace = await makeWorkspace(info);
  const readme = path.join(workspace, 'alpha-app/README.md');
  const before = await readFile(readme, 'utf8');
  const app = await launch(
    workspace,
    info.outputPath('user-data'),
    await writeRunScript(info),
  );
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 1000),
    );
    const panel = await openReviewPanel(page);

    await panel.getByRole('radio', { name: /仅可查看/ }).check();
    await panel.getByRole('button', { name: '审阅受控变更' }).click();

    await expect(
      panel.getByText(/未准备成功（PERMISSION_READ_ONLY）/),
    ).toBeVisible();
    await expect(panel.getByRole('button', { name: '批准并写入' })).toHaveCount(
      0,
    );
    await expect(panel.locator('.change-review__diff')).toHaveCount(0);
    expect(await readFile(readme, 'utf8')).toBe(before);
  } finally {
    try {
      await app.close();
    } finally {
      expect(await captureFixtureHash(fixtureRoot)).toBe(fixtureHashBefore);
    }
  }
});

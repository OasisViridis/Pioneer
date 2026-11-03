import {
  _electron as electron,
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import { hashFixtureTree } from '../helpers/hash-tree';
import { captureFixtureHash } from './fixture-integrity';
import { newSessionForProject } from './session-ui';

/**
 * #19 real Electron flow: main prepares the reviewed request, the renderer
 * shows the real diff and the S2 permission card, and only the approve action
 * crosses the write channel. Writes happen in a temporary copy of the library
 * fixture; the committed fixture is hashed before and after and never changes.
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

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function launch(workspace: string, userData: string) {
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
    },
  });
}

async function makeWorkspace(info: TestInfo): Promise<string> {
  const workspace = info.outputPath('workspace');
  await mkdir(path.dirname(workspace), { recursive: true });
  await cp(fixtureRoot, workspace, { recursive: true });
  return workspace;
}

/** Opens the session diff panel and prepares the controlled review. */
async function openPreparedReview(page: Page): Promise<Locator> {
  await newSessionForProject(page, 'alpha-app');
  await page.getByText('模块', { exact: true }).click();
  await page.getByRole('button', { name: '+ 改动', exact: true }).click();
  const panel = page.locator('[data-panel-id="diff"]');
  await expect(
    panel.getByRole('heading', { name: '受控变更审批', exact: true }),
  ).toBeVisible();
  await panel.getByRole('button', { name: '审阅受控变更' }).click();
  await expect(
    panel.getByRole('heading', {
      name: /变更预览 · alpha-app\/README\.md/,
    }),
  ).toBeVisible();
  return panel;
}

test('denying the prepared change keeps the target byte-identical', async ({}, info) => {
  const fixtureHashBefore = await captureFixtureHash(fixtureRoot);
  const workspace = await makeWorkspace(info);
  const readme = path.join(workspace, 'alpha-app/README.md');
  const workspaceBefore = await hashFixtureTree(workspace);
  const before = await readFile(readme);
  const app = await launch(workspace, info.outputPath('user-data'));
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 1000),
    );
    const panel = await openPreparedReview(page);

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
  const app = await launch(workspace, info.outputPath('user-data'));
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 1000),
    );
    const panel = await openPreparedReview(page);

    // The preview comes from main's read, not from renderer-authored content.
    await expect(panel.locator('.change-review__diff')).toContainText(
      'BEFORE ',
    );
    await expect(
      panel
        .locator('.change-review__line--added')
        .filter({ hasText: 'pioneer:change-approval-preview' }),
    ).toHaveCount(1);
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
  } finally {
    try {
      await app.close();
    } finally {
      expect(await captureFixtureHash(fixtureRoot)).toBe(fixtureHashBefore);
    }
  }
});

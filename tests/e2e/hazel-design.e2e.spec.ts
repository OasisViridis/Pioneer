import {
  _electron as electron,
  expect,
  test,
  type Locator,
} from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { SessionStateRecordSchema } from '../../apps/desktop/src/shared/session-state';
import {
  initialSessionWorkspaceState,
  sessionWorkspaceReducer,
} from '../../apps/desktop/src/renderer/state/session-workspace-reducer';
import type { ProjectSummary } from '../../apps/desktop/src/shared/contracts/catalog';

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

// Independent source hashes from the v3.1 asset contract. Validate the resource
// the browser actually displays, not a component prop or the webpack filename.
async function expectDecorativeAsset(
  image: Locator,
  sha256: string,
  intrinsicWidth: number | null = 1254,
) {
  await expect(image).toHaveAttribute('alt', '');
  await expect(image).toHaveAttribute('aria-hidden', 'true');
  const width = expect.poll(() =>
    image.evaluate((node) => (node as HTMLImageElement).naturalWidth),
  );
  if (intrinsicWidth === null) await width.toBeGreaterThan(0);
  else await width.toBe(intrinsicWidth);
  const source = new URL(
    await image.evaluate((node) => (node as HTMLImageElement).currentSrc),
  );
  expect(source.protocol).toBe('file:');
  expect(
    createHash('sha256')
      .update(await readFile(source))
      .digest('hex'),
  ).toBe(sha256);
}

async function expectLayoutDecoration(
  image: Locator,
  layout: string,
  viewportWidth: number,
) {
  const policy = JSON.parse(
    await readFile('docs/design/hazel-v3/decoration-policy.json', 'utf8'),
  ) as {
    assets: {
      file: string;
      sha256: string;
      size: number;
      intrinsicWidth: number | null;
    }[];
    selection: { pools: Record<string, string[]> };
  };
  await expect
    .poll(() =>
      image.evaluate((node) => (node as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  const source = new URL(
    await image.evaluate((node) => (node as HTMLImageElement).currentSrc),
  );
  const actualHash = createHash('sha256')
    .update(await readFile(source))
    .digest('hex');
  const allowed = policy.selection.pools[layout];
  if (!allowed) throw new Error('Missing layout allowlist: ' + layout);
  const asset = policy.assets.find(
    (a) => a.sha256 === actualHash && allowed.includes(a.file),
  );
  if (!asset)
    throw new Error(
      'Displayed asset is outside the independent layout allowlist: ' +
        actualHash,
    );
  await expectDecorativeAsset(image, asset.sha256, asset.intrinsicWidth);
  const size = asset.size === 88 && viewportWidth <= 900 ? 64 : asset.size;
  await expect(image).toHaveCSS('width', `${String(size)}px`);
  await expect(image).toHaveCSS('height', `${String(size)}px`);
}

test('v3.2 keeps all decoration themes in one stable empty-state slot across restart', async ({}, testInfo) => {
  test.setTimeout(60_000);
  const beforeHash = await captureFixtureHash(fixtureRoot);
  const userDataDir = testInfo.outputPath('user-data');
  await mkdir(userDataDir, { recursive: true });
  const policy = JSON.parse(
    await readFile('docs/design/hazel-v3/decoration-policy.json', 'utf8'),
  ) as {
    assets: {
      file: string;
      sha256: string;
      size: number;
      intrinsicWidth: number | null;
    }[];
    illustrativeFixtures: Record<string, Record<string, string>>;
  };
  const project: ProjectSummary = {
    id: 'decoration-alpha',
    name: 'alpha-app',
    absolutePath: path.join(fixtureRoot, 'alpha-app'),
    description: 'Alpha package fixture',
    technologies: ['TypeScript'],
    hasGitRepository: false,
    lastModifiedAt: '2026-10-01T00:00:00.000Z',
    coverSeed: 'decoration-alpha',
  };
  let state = initialSessionWorkspaceState;
  for (const id of [
    'session:0',
    'session:1',
    'session:2',
    'session:3',
  ] as const)
    state = sessionWorkspaceReducer(state, {
      type: 'CREATE_SESSION',
      id,
      project,
      occurredAt: 1000,
    });
  await writeFile(
    path.join(userDataDir, 'pioneer-session-state.json'),
    JSON.stringify(SessionStateRecordSchema.parse({ version: 3, state })),
  );
  const launch = () =>
    electron.launch({
      executablePath,
      args: [desktopDir],
      env: {
        ...process.env,
        PIONEER_E2E: '1',
        PIONEER_E2E_ROOT: fixtureRoot,
        PIONEER_E2E_USER_DATA: userDataDir,
      },
    });
  let application = await launch();
  try {
    let page = await application.firstWindow();
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 800),
    );
    const visited = new Set<string>();
    for (const [index, id] of [
      'session:0',
      'session:1',
      'session:2',
      'session:3',
    ].entries()) {
      await page
        .getByRole('tab', { name: `新会话 ${String(index + 1)}`, exact: true })
        .click();
      for (const [layout, label] of [
        ['focus', '专注'],
        ['review', '审阅'],
        ['delivery', '交付'],
      ] as const) {
        await page.getByRole('tab', { name: label, exact: true }).click();
        const file = policy.illustrativeFixtures[id]?.[layout];
        if (!file)
          throw new Error(
            'Missing independent theme fixture: ' + id + '/' + layout,
          );
        const asset = policy.assets.find((a) => a.file === file);
        if (!asset)
          throw new Error('Missing independent decoration fixture: ' + file);
        const image = page.locator('.conversation-welcome .hazel-companion');
        await expectDecorativeAsset(image, asset.sha256, asset.intrinsicWidth);
        await expect(image).toHaveCSS('width', `${String(asset.size)}px`);
        await expect(image).toHaveCSS('pointer-events', 'none');
        await expect(page.locator('.hazel-companion:visible')).toHaveCount(1);
        await expect(
          page.locator('.module-content .hazel-companion'),
        ).toHaveCount(0);
        const art = await image.boundingBox();
        const copy = await page
          .locator('.conversation-welcome > h2')
          .boundingBox();
        if (!art || !copy) throw new Error('Missing visible welcome geometry.');
        expect(art.x - copy.x - copy.width).toBeGreaterThanOrEqual(24);
        visited.add(file);
        if (index > 0)
          await page.screenshot({
            path: testInfo.outputPath(`theme-${String(index)}-${layout}.png`),
          });
      }
    }
    // Eleven conversation choices plus organizing in the separate onboarding test.
    expect(visited.size).toBe(11);
    await page
      .getByRole('textbox', { name: '给 Agent 的消息' })
      .fill('稳定主题的本机草稿');
    const cherry = policy.assets.find((a) => a.file === 'cherry-pair.svg');
    if (!cherry) throw new Error('Missing cherry fixture.');
    await expectDecorativeAsset(
      page.locator('.hazel-companion'),
      cherry.sha256,
      null,
    );
    await application.close();
    application = await launch();
    page = await application.firstWindow();
    await expect(
      page.getByRole('textbox', { name: '给 Agent 的消息' }),
    ).toHaveValue('稳定主题的本机草稿');
    await expectDecorativeAsset(
      page.locator('.hazel-companion'),
      cherry.sha256,
      null,
    );
    await page.getByRole('tab', { name: '专注', exact: true }).click();
    const outline = policy.assets.find((a) => a.file === 'jelly-outline.svg');
    if (!outline) throw new Error('Missing outline fixture.');
    await expectDecorativeAsset(
      page.locator('.hazel-companion'),
      outline.sha256,
      48,
    );
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setContentSize(640, 800),
    );
    await expect(page.locator('.hazel-companion')).toHaveCSS('width', '48px');
    // At 640px review stacks its panels and has no column separator.
    // Constrain the real split view at 900px through its user's resize control.
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setContentSize(900, 800),
    );
    await page.getByRole('tab', { name: '审阅', exact: true }).click();
    await page.getByRole('separator', { name: '左右分栏宽度' }).press('End');
    await expect(page.locator('.hazel-companion')).toBeHidden();
    await page.getByRole('tab', { name: '专注', exact: true }).click();
    await page.getByRole('button', { name: '保存到会话' }).click();
    await expect(page.locator('.message-list li')).toHaveCount(1);
    for (const label of ['专注', '审阅', '交付']) {
      await page.getByRole('tab', { name: label, exact: true }).click();
      await expect(page.locator('.hazel-companion')).toHaveCount(0);
    }
  } finally {
    await application.close();
    expect(await captureFixtureHashAfterClose(fixtureRoot)).toBe(beforeHash);
  }
});

test('v3.1 workspace onboarding is decorative and errors remain text-only', async ({}, testInfo) => {
  const beforeHash = await captureFixtureHash(fixtureRoot);
  const userDataDir = testInfo.outputPath('user-data');
  await mkdir(userDataDir, { recursive: true });
  const application = await electron.launch({
    executablePath,
    args: [desktopDir],
    env: {
      ...process.env,
      PIONEER_E2E: '1',
      PIONEER_E2E_ROOT: fixtureRoot,
      PIONEER_E2E_USER_DATA: userDataDir,
      PIONEER_E2E_SKIP_INITIAL_ROOT: '1',
      PIONEER_E2E_PICKER_ROOT: testInfo.outputPath('unavailable-root'),
    },
  });
  try {
    const page = await application.firstWindow();
    await application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 800);
    });
    await expect(
      page.getByRole('button', { name: '添加工作区' }),
    ).toBeVisible();
    const companion = page.locator('.empty-state .hazel-companion');
    await expectDecorativeAsset(
      companion,
      '0d54c45287fcf4f0390dc1feb57af1ba509e5482aacf3bb48c10666e131a8bdf',
    );
    await expect(companion).toHaveCSS('width', '88px');
    await expect(page.locator('.hazel-companion:visible')).toHaveCount(1);
    const illustrationBox = await companion.boundingBox();
    const headingBox = await page
      .getByRole('heading', { name: '工作区', exact: true })
      .boundingBox();
    if (!illustrationBox || !headingBox)
      throw new Error('Expected the onboarding illustration and heading.');
    expect(headingBox.y - illustrationBox.y - illustrationBox.height).toBe(24);
    expect(
      Math.abs(
        headingBox.x +
          headingBox.width / 2 -
          illustrationBox.x -
          illustrationBox.width / 2,
      ),
    ).toBeLessThan(1);
    await page.screenshot({ path: testInfo.outputPath('onboarding-1440.png') });
    for (const width of [900, 640]) {
      await application.evaluate(
        ({ BrowserWindow }, size) =>
          BrowserWindow.getAllWindows()[0]?.setContentSize(size, 800),
        width,
      );
      await expect(companion).toHaveCSS('width', '64px');
      await expect(companion).toHaveCSS('height', '64px');
      await expect(page.locator('.hazel-companion:visible')).toHaveCount(1);
      await page.screenshot({
        path: testInfo.outputPath(`onboarding-${String(width)}.png`),
      });
    }
    await page.getByRole('button', { name: '添加工作区' }).click();
    await expect(page.locator('.empty-state')).toContainText(
      'Workspace root is unavailable.',
    );
    await expect(page.locator('.hazel-companion')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: '添加工作区' }),
    ).toBeEnabled();
  } finally {
    await application.close();
    expect(await captureFixtureHashAfterClose(fixtureRoot)).toBe(beforeHash);
  }
});

test('Hazel stays decorative, loads offline, and leaves the local workflow usable at 640, 900 and 1440', async ({}, testInfo) => {
  test.setTimeout(60_000);
  const beforeHash = await captureFixtureHash(fixtureRoot);
  const userDataDir = testInfo.outputPath('user-data');
  await mkdir(userDataDir, { recursive: true });
  const application = await electron.launch({
    executablePath,
    args: [desktopDir],
    env: {
      ...process.env,
      PIONEER_E2E: '1',
      PIONEER_E2E_ROOT: fixtureRoot,
      PIONEER_E2E_USER_DATA: userDataDir,
    },
  });
  try {
    const page = await application.firstWindow();
    const noOverflow = async () => {
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    };
    for (const width of [640, 900, 1440]) {
      await application.evaluate(({ BrowserWindow }, size) => {
        BrowserWindow.getAllWindows()[0]?.setContentSize(size, 800);
      }, width);
      await page.getByRole('button', { name: '工作区库' }).click();
      await expect(
        page.getByRole('button', { name: '选择工作区 alpha-app' }),
      ).toBeVisible();
      await expect(page.locator('.brand-mark')).toHaveCSS('width', '20px');
      await noOverflow();
      await page.screenshot({
        path: testInfo.outputPath(`library-${String(width)}.png`),
      });
      if (width === 640) {
        await page
          .getByRole('button', { name: '选择工作区 alpha-app' })
          .click();
        await page
          .getByRole('button', { name: '新建会话', exact: true })
          .click();
      } else {
        await page.getByRole('tab', { name: '新会话 1', exact: true }).click();
      }
      const companion = page.locator('.conversation-welcome .hazel-companion');
      await expect(companion).toBeVisible();
      await expectLayoutDecoration(companion, 'focus', width);
      await expect(page.locator('.hazel-companion:visible')).toHaveCount(1);
      await expect(
        page.getByText('运行器尚未连接', { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('textbox', { name: '给 Agent 的消息' }),
      ).toBeVisible();
      await noOverflow();
      await page.screenshot({
        path: testInfo.outputPath(`focus-${String(width)}.png`),
      });
      await page.getByRole('tab', { name: '审阅', exact: true }).click();
      await expect(
        page.getByRole('textbox', { name: '给 Agent 的消息' }),
      ).toBeVisible();
      await expectLayoutDecoration(
        page.locator('.conversation-welcome .hazel-companion'),
        'review',
        width,
      );
      await expect(
        page.locator('.module-content .hazel-companion'),
      ).toHaveCount(0);
      await noOverflow();
      await page.screenshot({
        path: testInfo.outputPath(`review-${String(width)}.png`),
      });
      await page.getByRole('tab', { name: '专注', exact: true }).click();
    }
    await application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setContentSize(900, 800);
    });
    // The application has a 640px minimum layout. Constrain a real docked
    // conversation through the user's resize control, not an invalid viewport.
    await page.getByRole('tab', { name: '审阅', exact: true }).click();
    // Review's conversation is in the right column; End enlarges the left one.
    await page.getByRole('separator', { name: '左右分栏宽度' }).press('End');
    await expect
      .poll(() =>
        page.locator('.conversation').evaluate((node) => node.clientWidth),
      )
      .toBeLessThan(380);
    await expect(page.locator('.conversation .hazel-companion')).toBeHidden();
    await expect(page.locator('.conversation-welcome > p')).toHaveCSS(
      'margin-right',
      '0px',
    );
    await page.screenshot({
      path: testInfo.outputPath('review-constrained-900.png'),
    });
    await page.getByRole('tab', { name: '专注', exact: true }).click();
    await application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 800);
    });
    await page
      .getByRole('textbox', { name: '给 Agent 的消息' })
      .fill('仅保存本机的视觉回归消息');
    await page.getByRole('button', { name: '保存到会话' }).click();
    await expect(page.locator('.message-list li')).toHaveCount(1);
    await expect(page.locator('.hazel-companion')).toHaveCount(0);
    await page.getByRole('tab', { name: '审阅', exact: true }).click();
    await expect(page.locator('.hazel-companion')).toHaveCount(0);
    await page.getByRole('tab', { name: '交付', exact: true }).click();
    await expect(page.locator('.hazel-companion')).toHaveCount(0);
    await page.getByRole('tab', { name: '专注', exact: true }).click();
    await expect(
      page.getByText('等待连接运行器。没有生成回复，也没有执行任何操作。'),
    ).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('active-1440.png') });
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: '设置', exact: true }),
    ).toBeVisible();
    await noOverflow();
    await page.screenshot({ path: testInfo.outputPath('settings-1440.png') });
  } finally {
    await application.close();
    expect(await captureFixtureHashAfterClose(fixtureRoot)).toBe(beforeHash);
  }
});

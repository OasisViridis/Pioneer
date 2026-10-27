import {
  _electron as electron,
  expect,
  test,
  type Locator,
} from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { PioneerDesktopApi } from '../../apps/desktop/src/shared/contracts/ipc';
import {
  initialSessionWorkspaceState,
  sessionWorkspaceReducer,
} from '../../apps/desktop/src/renderer/state/session-workspace-reducer';
import { SessionStateRecordSchema } from '../../apps/desktop/src/shared/session-state';
import {
  captureFixtureHash,
  captureFixtureHashAfterClose,
} from './fixture-integrity';

const desktop = path.join(process.cwd(), 'apps/desktop');
const root = path.join(process.cwd(), 'tests/fixtures/workspaces/library');
const executablePath = createRequire(path.join(desktop, 'package.json'))(
  'electron',
) as string;
interface Asset {
  file: string;
  sha256: string;
  size: number;
  intrinsicWidth: number | null;
}
const policy = JSON.parse(
  readFileSync('design/sync/asset-policy.json', 'utf8'),
) as {
  conversationPool: string[];
  budget: { maxIllustrationsPerView: number; safeTextGap: number };
};
const historical = JSON.parse(
  readFileSync('docs/design/hazel-v3/decoration-policy.json', 'utf8'),
) as { assets: Asset[] };

async function displayedAsset(image: Locator, asset: Asset, size: number) {
  await expect(image).toHaveAttribute('alt', '');
  await expect(image).toHaveAttribute('aria-hidden', 'true');
  await expect(image).toHaveCSS('pointer-events', 'none');
  await expect(image).toHaveCSS('width', `${String(size)}px`);
  await expect(image).toHaveCSS('height', `${String(size)}px`);
  await expect
    .poll(() =>
      image.evaluate((node) => (node as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  const source = new URL(
    await image.evaluate((node) => (node as HTMLImageElement).currentSrc),
  );
  expect(source.protocol).toBe('file:');
  expect(
    createHash('sha256')
      .update(await readFile(source))
      .digest('hex'),
  ).toBe(asset.sha256);
  if (asset.intrinsicWidth !== null)
    expect(
      await image.evaluate((node) => (node as HTMLImageElement).naturalWidth),
    ).toBe(asset.intrinsicWidth);
}

test('S1 decoration follows the current single-workspace pool, geometry and empty-state budget', async ({}, info) => {
  test.setTimeout(60_000);
  const before = await captureFixtureHash(root);
  const userData = info.outputPath('user-data');
  await mkdir(userData, { recursive: true });
  const launch = () =>
    electron.launch({
      executablePath,
      args: [desktop],
      env: {
        ...process.env,
        PIONEER_E2E: '1',
        PIONEER_E2E_ROOT: root,
        PIONEER_E2E_USER_DATA: userData,
      },
    });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await expect(
      page.getByRole('button', { name: 'Open project alpha-app', exact: true }),
    ).toBeVisible();
    const project = await page.evaluate(async () =>
      (
        await (
          window as Window & { pioneer: PioneerDesktopApi }
        ).pioneer.getCatalog()
      ).projects.find((p) => p.name === 'alpha-app'),
    );
    if (!project) throw new Error('Missing real catalog fixture');
    await app.close();
    let state = initialSessionWorkspaceState;
    for (let i = 0; i < policy.conversationPool.length; i++) {
      const id = `session:${String.fromCharCode(48 + i)}` as const;
      state = sessionWorkspaceReducer(state, {
        type: 'CREATE_SESSION',
        id,
        project,
      });
      state = sessionWorkspaceReducer(state, {
        type: 'RENAME_SESSION',
        id,
        title: `S1 theme ${String(i)}`,
      });
    }
    const record = SessionStateRecordSchema.parse({ version: 4, state });
    await writeFile(
      path.join(userData, 'pioneer-session-state.json'),
      JSON.stringify(record),
    );
    app = await launch();
    page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 1000),
    );
    const image = page.locator('.conversation-welcome .hazel-companion');
    const visited = new Set<string>();
    for (let i = 0; i < policy.conversationPool.length; i++) {
      await page
        .getByRole('tab', { name: `S1 theme ${String(i)}`, exact: true })
        .click();
      const name =
        policy.conversationPool[(48 + i) % policy.conversationPool.length];
      const asset = historical.assets.find((a) => a.file === name);
      if (!asset) throw new Error('Missing independent asset policy entry');
      await displayedAsset(image, asset, asset.size);
      await expect(page.locator('.hazel-companion:visible')).toHaveCount(
        policy.budget.maxIllustrationsPerView,
      );
      await expect(
        page.locator('.module-content .hazel-companion'),
      ).toHaveCount(0);
      for (const selector of ['h2', 'p']) {
        const art = await image.boundingBox();
        const text = await page
          .locator(`.conversation-welcome > ${selector}`)
          .boundingBox();
        if (!art || !text) throw new Error('Missing decoration geometry');
        expect(art.x - text.x - text.width).toBeGreaterThanOrEqual(
          policy.budget.safeTextGap - 1,
        );
      }
      visited.add(asset.file);
    }
    expect(visited.size).toBe(11);
    const illustrationIndex = policy.conversationPool.findIndex(
      (file) => file === 'greendou-listening.png',
    );
    const sessionIndex = Array.from({ length: 11 }, (_, i) => i).find(
      (i) => (48 + i) % 11 === illustrationIndex,
    );
    if (sessionIndex === undefined)
      throw new Error('Missing illustration fixture');
    await page
      .getByRole('tab', {
        name: `S1 theme ${String(sessionIndex)}`,
        exact: true,
      })
      .click();
    await page
      .getByRole('textbox', { name: '给 Agent 的消息' })
      .fill('装饰保持静态，本机草稿不丢失');
    await expect(page.locator('.save-status')).toHaveText('已保存到本机');
    const source = await image.getAttribute('src');
    await page.screenshot({ path: info.outputPath('s1-decoration-1440.png') });
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await expect(page.locator('.hazel-companion')).toHaveAttribute(
      'src',
      source ?? '',
    );
    await expect(
      page.getByRole('textbox', { name: '给 Agent 的消息' }),
    ).toHaveValue('装饰保持静态，本机草稿不丢失');
    for (const width of [900, 640]) {
      await app.evaluate(
        ({ BrowserWindow }, value) =>
          BrowserWindow.getAllWindows()[0]?.setContentSize(value, 1000),
        width,
      );
      await expect(page.locator('.hazel-companion')).toHaveCSS('width', '64px');
      await expect(page.locator('.hazel-companion:visible')).toHaveCount(1);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`s1-decoration-${String(width)}.png`),
      });
    }
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setContentSize(900, 1000),
    );
    await page.getByText('模块', { exact: true }).click();
    await page.getByRole('button', { name: '+ 上下文', exact: true }).click();
    await page
      .getByRole('separator', { name: '左右分栏宽度', exact: true })
      .press('End');
    await expect(page.locator('.hazel-companion')).toBeHidden();
    await page.getByLabel('布局操作', { exact: true }).click();
    await page
      .getByRole('button', { name: '恢复默认布局', exact: true })
      .first()
      .click();
    await expect(page.locator('.hazel-companion')).toBeVisible();
    await page.getByRole('button', { name: '保存到会话', exact: true }).click();
    await expect(page.locator('.message-list li')).toHaveCount(1);
    await expect(page.locator('.hazel-companion')).toHaveCount(0);
    await page.getByRole('tab', { name: 'S1 theme 0', exact: true }).click();
    if (sessionIndex === 0)
      await page.getByRole('tab', { name: 'S1 theme 1', exact: true }).click();
    await expect(page.locator('.hazel-companion')).toHaveCount(1);
    await expect(
      page.getByRole('button', { name: '澄清任务', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: '意图摘要', exact: true }),
    ).toHaveCount(0);
  } finally {
    try {
      await app.close();
    } finally {
      expect(await captureFixtureHashAfterClose(root)).toBe(before);
    }
  }
});

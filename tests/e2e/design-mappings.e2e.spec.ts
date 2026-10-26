import { _electron as electron, expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import {
  captureFixtureHash,
  captureFixtureHashAfterClose,
} from './fixture-integrity';
import { newSessionForProject } from './session-ui';

const desktop = path.join(process.cwd(), 'apps/desktop');
const root = path.join(process.cwd(), 'tests/fixtures/workspaces/library');
const executablePath = createRequire(path.join(desktop, 'package.json'))(
  'electron',
) as string;

async function launch(
  userData: string,
  overrides: Record<string, string> = {},
) {
  await mkdir(userData, { recursive: true });
  return electron.launch({
    executablePath,
    args: [desktop],
    env: {
      ...process.env,
      PIONEER_E2E: '1',
      PIONEER_E2E_ROOT: root,
      PIONEER_E2E_USER_DATA: userData,
      ...overrides,
    },
  });
}

test('S1 poster variants retain gradients and unavailable cards recover after rescan', async ({}, info) => {
  const before = await captureFixtureHash(root);
  const app = await launch(info.outputPath('user-data'), {
    PIONEER_E2E_PICKER_ROOT: info.outputPath('missing-root'),
  });
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 1000),
    );
    const posters = page.getByRole('button', { name: /^Open project / });
    await expect(posters).toHaveCount(3);
    // Code/Map/Doc all intentionally use this existing visual. No runtime
    // classification is inferred from the catalog's name or technologies.
    for (const poster of await posters.all()) {
      await expect(poster).toBeEnabled();
      await expect(poster.locator('.project-poster__cover')).toHaveCSS(
        'background-image',
        /linear-gradient/,
      );
    }
    await page.screenshot({
      path: info.outputPath('s1-posters-available.png'),
    });
    await page
      .getByRole('button', { name: 'Change workspace', exact: true })
      .click();
    for (const poster of await posters.all()) {
      await expect(poster).toBeDisabled();
      await expect(poster).toHaveAccessibleDescription(
        '目录状态已过期，请重新扫描后打开。',
      );
      await expect(poster.locator('.project-poster__cover')).toHaveCSS(
        'filter',
        'grayscale(1)',
      );
      await poster.evaluate((node) => {
        (node as HTMLButtonElement).click();
      });
    }
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.screenshot({
      path: info.outputPath('s1-posters-unavailable.png'),
    });
    await page.getByRole('button', { name: 'Rescan', exact: true }).click();
    await expect(posters.first()).toBeEnabled();
    await expect(page.locator('.project-poster__unavailable')).toHaveCount(0);
    await newSessionForProject(page, 'alpha-app');
    await expect(
      page.getByRole('tab', { name: 'alpha-app', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
  } finally {
    try {
      await app.close();
    } finally {
      expect(await captureFixtureHashAfterClose(root)).toBe(before);
    }
  }
});

test('S1 session and dock compositions preserve selection, focus and close semantics', async ({}, info) => {
  const before = await captureFixtureHash(root);
  const app = await launch(info.outputPath('user-data'));
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 1000),
    );
    await newSessionForProject(page, 'alpha-app');
    const draft = page.getByRole('textbox', { name: '给 Agent 的消息' });
    await draft.fill('S1 映射不改变草稿或 Run');
    await page.getByRole('tab', { name: 'Library', exact: true }).click();
    await newSessionForProject(page, 'beta-notes');
    const alpha = page.getByRole('tab', { name: 'alpha-app', exact: true });
    const beta = page.getByRole('tab', { name: 'beta-notes', exact: true });
    await expect(alpha).toHaveAttribute('aria-selected', 'false');
    await expect(beta).toHaveAttribute('aria-selected', 'true');
    await expect(alpha).toHaveCSS('color', 'rgb(215, 227, 218)');
    await expect(beta).toHaveCSS('color', 'rgb(51, 60, 80)');
    await expect(beta).toHaveCSS('background-color', 'rgb(249, 250, 247)');
    await expect(
      page.getByRole('button', { name: 'Close alpha-app', exact: true }),
    ).toHaveAttribute('tabindex', '-1');
    await page.screenshot({
      path: info.outputPath('s1-session-active-inactive.png'),
    });
    await alpha.click();
    await expect(draft).toHaveValue('S1 映射不改变草稿或 Run');
    await page
      .getByRole('button', { name: 'Close beta-notes', exact: true })
      .click();
    await expect(alpha).toHaveAttribute('aria-selected', 'true');
    await expect(draft).toHaveValue('S1 映射不改变草稿或 Run');

    await page.getByText('模块', { exact: true }).click();
    await page.getByRole('button', { name: '+ 上下文', exact: true }).click();
    const context = page.locator('[data-panel-id="context"]');
    const conversation = page.locator('[data-panel-id="conversation"]');
    const handle = context.getByRole('button', {
      name: '拖动上下文面板',
      exact: true,
    });
    await handle.focus();
    await expect(handle).toHaveAttribute('draggable', 'true');
    await expect(context.locator('.module-header')).toHaveCSS(
      'background-color',
      'rgb(238, 237, 234)',
    );
    await expect(conversation.locator('.module-header')).toHaveCSS(
      'background-color',
      'rgba(0, 0, 0, 0)',
    );
    await page.screenshot({
      path: info.outputPath('s1-panel-active-inactive.png'),
    });
    await draft.focus();
    await expect(context.locator('.module-header')).toHaveCSS(
      'background-color',
      'rgba(0, 0, 0, 0)',
    );
    await expect(conversation.locator('.module-header')).toHaveCSS(
      'background-color',
      'rgb(238, 237, 234)',
    );
    await handle.dragTo(conversation.locator('.module-header'));
    await expect(
      page.locator('[data-dock-column="1"] [data-panel-id="context"]'),
    ).toBeVisible();
    await context.getByLabel('上下文面板菜单', { exact: true }).click();
    await context
      .getByRole('button', { name: '收起面板', exact: true })
      .click();
    await expect(context).toHaveCount(0);
    await expect(draft).toHaveValue('S1 映射不改变草稿或 Run');
    await expect(
      page.getByRole('tab', { name: 'alpha-app', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    await page
      .getByRole('button', { name: 'Close alpha-app', exact: true })
      .click();
    await expect(
      page.getByRole('tab', { name: 'Library', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    await page
      .getByRole('button', { name: '打开会话 alpha-app', exact: true })
      .click();
    await expect(draft).toHaveValue('S1 映射不改变草稿或 Run');
  } finally {
    try {
      await app.close();
    } finally {
      expect(await captureFixtureHashAfterClose(root)).toBe(before);
    }
  }
});

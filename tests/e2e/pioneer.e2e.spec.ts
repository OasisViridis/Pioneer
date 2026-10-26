import { _electron as electron, expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import {
  captureFixtureHash,
  captureFixtureHashAfterClose,
} from './fixture-integrity';

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
const electronCloseTimeoutMs = 5_000;

test('opens fixture projects in unique MRU tabs without mutating the workspace', async ({}, testInfo) => {
  const beforeHash = await captureFixtureHash(fixtureRoot);
  const userDataDir = testInfo.outputPath('user-data');
  await mkdir(userDataDir, { recursive: true });
  const application = await electron.launch({
    executablePath: electronExecutablePath,
    args: [desktopDir],
    env: {
      ...process.env,
      PIONEER_E2E: '1',
      PIONEER_E2E_ROOT: fixtureRoot,
      PIONEER_E2E_USER_DATA: userDataDir,
    },
  });

  let bodyError: unknown;
  try {
    const page = await application.firstWindow();
    const projectPosters = page.getByRole('button', { name: /^Open project / });

    const libraryTab = page.getByRole('tab', { name: 'Library' });
    const settingsTab = page.getByRole('tab', { name: 'Settings' });
    await expect(libraryTab).toBeVisible();
    await libraryTab.focus();
    await libraryTab.press('ArrowRight');
    await expect(settingsTab).toBeFocused();
    await expect(settingsTab).toHaveAttribute('aria-selected', 'true');
    await settingsTab.press('Home');
    await expect(libraryTab).toBeFocused();
    await libraryTab.press('End');
    await expect(settingsTab).toBeFocused();
    await settingsTab.press('ArrowRight');
    await expect(libraryTab).toBeFocused();
    await libraryTab.press('ArrowLeft');
    await expect(settingsTab).toBeFocused();
    await settingsTab.press('ArrowRight');
    await expect(libraryTab).toBeFocused();

    await expect(
      page.getByRole('button', { name: 'Open project alpha-app' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Open project beta-notes' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Open project broken-metadata' }),
    ).toBeVisible();
    await expect(projectPosters).toHaveCount(3);
    await expect(page.getByText('not-a-project.txt')).toHaveCount(0);

    // The exported color proposal reaches a real Electron renderer through
    // the generated semantic alias; font and relative spacing stay compatible.
    const html = page.locator('html');
    await expect(html).toHaveCSS('color', 'rgb(44, 53, 71)');
    await expect(html).toHaveCSS(
      'font-family',
      'Inter, "Noto Sans SC", system-ui, sans-serif',
    );
    const alphaPoster = page.getByRole('button', {
      name: 'Open project alpha-app',
    });
    await alphaPoster.hover();
    await expect(alphaPoster).toHaveCSS(
      'background-color',
      'rgb(238, 237, 234)',
    );
    await expect(alphaPoster.locator('.project-poster__body')).toHaveCSS(
      'padding',
      '16px',
    );

    await page.getByRole('button', { name: 'Open project alpha-app' }).click();
    await expect(page.getByRole('tab', { name: 'alpha-app' })).toHaveCount(1);

    await page.getByRole('tab', { name: 'Library' }).click();
    await page.getByRole('button', { name: 'Open project alpha-app' }).click();
    await expect(page.getByRole('tab', { name: 'alpha-app' })).toHaveCount(1);
    await expect(page.getByRole('tab', { name: 'alpha-app' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await page.getByRole('tab', { name: 'Library' }).click();
    await page.getByRole('button', { name: 'Open project beta-notes' }).click();
    await page.getByRole('tab', { name: 'alpha-app' }).click();
    await page.getByRole('button', { name: 'Close alpha-app' }).click();
    await expect(page.getByRole('tab', { name: 'beta-notes' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('tab', { name: 'beta-notes' })).toBeFocused();

    await page.getByRole('button', { name: 'Close beta-notes' }).click();
    await expect(page.getByRole('tab', { name: 'Library' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('tab', { name: 'Library' })).toBeFocused();

    await page.getByRole('tab', { name: 'Settings' }).click();
    await expect(page.getByText(fixtureRoot, { exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Library' }).click();
    await expect(page.getByRole('status')).toContainText('metadata');
    await expect(
      page.getByRole('button', { name: 'Open project alpha-app' }),
    ).toBeVisible();
  } catch (error) {
    bodyError = error;
    throw error;
  } finally {
    let closeError: unknown;
    try {
      try {
        await test.step('close Electron', () => application.close(), {
          timeout: electronCloseTimeoutMs,
        });
        console.info('[e2e teardown] Electron close completed');
      } catch (error) {
        closeError = error;
        application.process().kill();
        console.warn(
          '[e2e teardown] Electron close failed; process terminated',
        );
      }
    } finally {
      const afterHash = await captureFixtureHashAfterClose(fixtureRoot);
      expect(afterHash, 'fixture hash after Electron close').toBe(beforeHash);
      console.info('[e2e teardown] Fixture hash verified after close');
    }

    if (closeError !== undefined && bodyError === undefined) {
      throw closeError instanceof Error
        ? closeError
        : new Error('Electron close failed with a non-Error value', {
            cause: closeError,
          });
    }
  }
});

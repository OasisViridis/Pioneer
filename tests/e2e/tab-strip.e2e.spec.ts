import { newSessionForProject } from './session-ui';
import { _electron as electron, expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
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

test('supports keyboard activation and restores focus after closing active session tabs', async ({}, testInfo) => {
  const beforeHash = await captureFixtureHash(fixtureRoot);
  const userDataDir = testInfo.outputPath('user-data');
  await mkdir(userDataDir, { recursive: true });
  await writeFile(
    path.join(userDataDir, 'pioneer-settings.json'),
    JSON.stringify({ rootPath: fixtureRoot }),
    'utf8',
  );

  const application = await electron.launch({
    executablePath: electronExecutablePath,
    args: [`--user-data-dir=${userDataDir}`, desktopDir],
  });

  try {
    const page = await application.firstWindow();
    const libraryTab = page.getByRole('tab', { name: 'Library' });
    const settingsTab = page.getByRole('tab', { name: 'Settings' });

    await newSessionForProject(page, 'alpha-app');
    const alphaTab = page.getByRole('tab', { name: 'alpha-app' });
    await alphaTab.focus();
    await alphaTab.press('Home');
    await expect(libraryTab).toBeFocused();
    await expect(libraryTab).toHaveAttribute('aria-selected', 'true');
    await libraryTab.press('End');
    await expect(alphaTab).toBeFocused();
    await alphaTab.press('ArrowLeft');
    await expect(settingsTab).toBeFocused();
    await expect(settingsTab).toHaveAttribute('aria-selected', 'true');
    await settingsTab.press('ArrowRight');
    await expect(alphaTab).toBeFocused();

    await libraryTab.click();
    await newSessionForProject(page, 'beta-notes');
    await expect(
      page.getByRole('button', { name: 'Close alpha-app' }),
    ).toHaveAttribute('tabindex', '-1');
    await alphaTab.click();
    await page.getByRole('button', { name: 'Close alpha-app' }).click();
    const betaTab = page.getByRole('tab', { name: 'beta-notes' });
    await expect(betaTab).toHaveAttribute('aria-selected', 'true');
    await expect(betaTab).toBeFocused();

    await page.getByRole('button', { name: 'Close beta-notes' }).click();
    await expect(libraryTab).toHaveAttribute('aria-selected', 'true');
    await expect(libraryTab).toBeFocused();
  } finally {
    try {
      await application.close();
    } finally {
      expect(await captureFixtureHashAfterClose(fixtureRoot)).toBe(beforeHash);
    }
  }
});

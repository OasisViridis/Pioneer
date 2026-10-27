import {
  _electron as electron,
  expect,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { PioneerDesktopApi } from '../../apps/desktop/src/shared/contracts/ipc';
import { SessionStateRecordSchema } from '../../apps/desktop/src/shared/session-state';
import {
  initialSessionWorkspaceState,
  sessionWorkspaceReducer,
} from '../../apps/desktop/src/renderer/state/session-workspace-reducer';
import {
  captureFixtureHash,
  captureFixtureHashAfterClose,
} from './fixture-integrity';

export const fixedTime = new Date('2026-10-01T00:00:00.000Z');
export async function designApp(info: TestInfo) {
  const desktop = path.join(process.cwd(), 'apps/desktop');
  const root = path.join(process.cwd(), 'tests/fixtures/workspaces/library');
  const before = await captureFixtureHash(root);
  const userData = info.outputPath('user-data');
  await mkdir(userData, { recursive: true });
  const launch = () =>
    electron.launch({
      executablePath: createRequire(path.join(desktop, 'package.json'))(
        'electron',
      ) as string,
      args: [desktop, '--force-device-scale-factor=1', '--lang=en-US'],
      env: {
        ...process.env,
        TZ: 'UTC',
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
    if (!project) throw new Error('Missing real catalog project');
    await app.close();
    const state = sessionWorkspaceReducer(initialSessionWorkspaceState, {
      type: 'CREATE_SESSION',
      id: 'session:0',
      project,
      occurredAt: fixedTime.getTime(),
    });
    await writeFile(
      path.join(userData, 'pioneer-session-state.json'),
      JSON.stringify(SessionStateRecordSchema.parse({ version: 5, state })),
    );
    app = await launch();
    page = await app.firstWindow();
    await page.route(/^https?:/, (route) => route.abort());
    await page.clock.setFixedTime(fixedTime);
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
    await page.reload();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 1000),
    );
    await expect(
      page.getByRole('textbox', { name: '给 Agent 的消息', exact: true }),
    ).toBeVisible();
    await page.evaluate(async () => {
      for (const family of ['Noto Sans SC', 'Noto Serif SC']) {
        const faces = await document.fonts.load(
          `400 16px "${family}"`,
          '代码工作区',
        );
        if (!faces.some((face) => face.status === 'loaded'))
          throw new Error('Packaged font did not load');
      }
      await document.fonts.ready;
    });
    return {
      app,
      page,
      close: async () => {
        try {
          await app.close();
        } finally {
          expect(await captureFixtureHashAfterClose(root)).toBe(before);
        }
      },
    };
  } catch (error) {
    try {
      await app.close();
    } finally {
      expect(await captureFixtureHashAfterClose(root)).toBe(before);
    }
    throw error;
  }
}

export async function expectNoOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

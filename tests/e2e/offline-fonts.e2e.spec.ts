import { _electron as electron, expect, test } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import {
  captureFixtureHash,
  captureFixtureHashAfterClose,
} from './fixture-integrity';

test('packaged CJK fonts load locally at multiple weights without external requests', async ({}, info) => {
  const root = path.join(process.cwd(), 'tests/fixtures/workspaces/library');
  const before = await captureFixtureHash(root);
  const desktop = path.join(process.cwd(), 'apps/desktop');
  const userData = info.outputPath('user-data');
  await mkdir(userData, { recursive: true });
  const app = await electron.launch({
    executablePath: createRequire(path.join(desktop, 'package.json'))(
      'electron',
    ) as string,
    args: [desktop],
    env: {
      ...process.env,
      PIONEER_E2E: '1',
      PIONEER_E2E_ROOT: root,
      PIONEER_E2E_USER_DATA: userData,
    },
  });
  try {
    const page = await app.firstWindow();
    const external: string[] = [];
    await page.route(/^https?:/, (route) => {
      external.push(route.request().url());
      return route.abort();
    });
    await page.reload();
    const fonts = await page.evaluate(async () => {
      const result: number[] = [];
      for (const family of ['Noto Sans SC', 'Noto Serif SC'])
        for (const weight of [400, 500, 700]) {
          const faces = await document.fonts.load(
            `${String(weight)} 16px "${family}"`,
            '代码工作区',
          );
          result.push(faces.filter((face) => face.status === 'loaded').length);
        }
      return result;
    });
    expect(fonts).toEqual([1, 1, 1, 1, 1, 1]);
    expect(external).toEqual([]);
    for (const family of ['NotoSansSC', 'NotoSerifSC']) {
      const packaged = await readFile(
        path.join(
          desktop,
          '.webpack/renderer/assets/font-licenses',
          family + '-OFL.txt',
        ),
      );
      const source = await readFile(
        path.join(
          desktop,
          'src/renderer/assets/fonts/licenses',
          family + '-OFL.txt',
        ),
      );
      expect(createHash('sha256').update(packaged).digest('hex')).toBe(
        createHash('sha256').update(source).digest('hex'),
      );
    }
  } finally {
    await app.close();
    expect(await captureFixtureHashAfterClose(root)).toBe(before);
  }
});

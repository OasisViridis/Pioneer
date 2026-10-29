import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import { designApp, expectNoOverflow } from './design-fixture';

test('reviewed Windows application pixels: normal, narrow, long text, focus and reduced motion', async ({}, info) => {
  expect(process.platform, 'Visual evidence must come from Windows').toBe(
    'win32',
  );
  const fixture = await designApp(info);
  const { app, page } = fixture;
  try {
    const fonts: Record<string, string> = {};
    for (const name of [
      'NotoSansSC-Variable.woff2',
      'NotoSerifSC-Variable.woff2',
    ]) {
      fonts[name] = createHash('sha256')
        .update(
          await readFile(`apps/desktop/src/renderer/assets/fonts/${name}`),
        )
        .digest('hex');
    }
    const environment = {
      os: os.release(),
      image: process.env.ImageVersion ?? 'local-windows',
      versions: await app.evaluate(() => ({
        electron: process.versions.electron,
        chrome: process.versions.chrome,
      })),
      pixelRatio: await page.evaluate(() => devicePixelRatio),
      fonts,
      locale: await page.evaluate(() => navigator.language),
      time: '2026-10-01T00:00:00.000Z',
      motion: 'reduce',
      colorScheme: 'light',
    };
    await info.attach('environment', {
      body: JSON.stringify(environment, null, 2),
      contentType: 'application/json',
    });
    // A runner/font/Electron change must be reviewed separately, before pixels.
    expect(JSON.stringify(environment, null, 2)).toMatchSnapshot(
      'environment.txt',
    );
    for (const width of [1440, 900, 640]) {
      await app.evaluate(
        ({ BrowserWindow }, value) =>
          BrowserWindow.getAllWindows()[0]?.setContentSize(value, 1000),
        width,
      );
      await expect(
        page.locator('.conversation-welcome .hazel-companion'),
      ).toBeVisible();
      await expectNoOverflow(page);
      await expect(page).toHaveScreenshot(`conversation-${String(width)}.png`);
      await info.attach(`NORMAL conversation ${String(width)}`, {
        body: await page.screenshot({ animations: 'disabled', caret: 'hide' }),
        contentType: 'image/png',
      });
    }
    const draft = page.getByRole('textbox', {
      name: '给 Agent 的消息',
      exact: true,
    });
    await draft.fill('长文本验证：换行、可见焦点、减少动态效果。'.repeat(30));
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(draft).toBeFocused();
    await expect(page.locator('.save-status')).toHaveText('已保存到本机');
    await expectNoOverflow(page);
    await info.attach('NORMAL long text and keyboard focus', {
      body: await page.screenshot({ animations: 'disabled', caret: 'hide' }),
      contentType: 'image/png',
    });
    await expect(page).toHaveScreenshot('long-text-focus-reduced-motion.png');
    // Deliberate visible regression uses the SAME reviewed image and must fail.
    // No baseline mutation: Playwright emits actual/expected/diff for this probe.
    if (!info.config.metadata.candidate) {
      await test.step('INTENTIONAL FAILURE: inverted colors; diff is not the normal UI', async () => {
        const style = await page.addStyleTag({
          content: '.app-shell { filter: invert(1) !important; }',
        });
        try {
          await expect(
            expect(page).toHaveScreenshot(
              'long-text-focus-reduced-motion.png',
              {
                timeout: 1500,
              },
            ),
          ).rejects.toThrow();
        } finally {
          await style.evaluate((node) => node.parentNode?.removeChild(node));
        }
        await expect(page).toHaveScreenshot(
          'long-text-focus-reduced-motion.png',
        );
      });
    }
  } finally {
    await fixture.close();
  }
});

import { expect, test } from '@playwright/test';
import { designApp } from './design-fixture';

// The current app uses native chrome. WindowChrome and its preload adapter are
// dormant: operating BrowserWindow here is native automation, not Window API proof.
test('native window resize, minimize and restore preserve a draft saved through real IPC', async ({}, info) => {
  const fixture = await designApp(info);
  const { app, page } = fixture;
  try {
    const draft = page.getByRole('textbox', {
      name: '给 Agent 的消息',
      exact: true,
    });
    await draft.fill('原生窗口变化不丢失草稿');
    await expect(page.locator('.save-status')).toHaveText('已保存到本机');
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.minimize(),
    );
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0]?.isMinimized(),
        ),
      )
      .toBe(true);
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      w?.restore();
      w?.setContentSize(640, 800);
    });
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0]?.isMinimized(),
        ),
      )
      .toBe(false);
    await expect(draft).toHaveValue('原生窗口变化不丢失草稿');
    await page.reload();
    await expect(draft).toHaveValue('原生窗口变化不丢失草稿');
    expect(app.windows()).toHaveLength(1);
  } finally {
    await fixture.close();
  }
});

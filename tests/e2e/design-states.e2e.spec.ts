import { expect, test } from '@playwright/test';
import { designApp, expectNoOverflow } from './design-fixture';

test('current Hazel conversation supports narrow windows, long text, keyboard focus and reduced motion', async ({}, info) => {
  const fixture = await designApp(info);
  const { app, page } = fixture;
  try {
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
      await page.screenshot({
        path: info.outputPath(`s3-empty-${String(width)}.png`),
        animations: 'disabled',
      });
    }
    const draft = page.getByRole('textbox', {
      name: '给 Agent 的消息',
      exact: true,
    });
    const longText = '长文本用于检查换行和窄窗布局，不连接外部模型。'.repeat(
      30,
    );
    await draft.fill(longText);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(draft).toBeFocused();
    expect(await draft.evaluate((node) => node.matches(':focus-visible'))).toBe(
      true,
    );
    expect(
      await draft.evaluate((node) => getComputedStyle(node).outlineStyle),
    ).not.toBe('none');
    expect(
      await page.evaluate(
        () => matchMedia('(prefers-reduced-motion: reduce)').matches,
      ),
    ).toBe(true);
    await expectNoOverflow(page);
    await expect(page.locator('.save-status')).toHaveText('已保存到本机');
    await page.screenshot({
      path: info.outputPath('s3-long-focus-reduced-motion.png'),
      animations: 'disabled',
      caret: 'hide',
    });
    await page.getByRole('button', { name: '保存到会话', exact: true }).click();
    await expect(page.locator('.message-list li')).toHaveCount(1);
    await expect(page.locator('.hazel-companion')).toHaveCount(0);
    await expectNoOverflow(page);
  } finally {
    await fixture.close();
  }
});

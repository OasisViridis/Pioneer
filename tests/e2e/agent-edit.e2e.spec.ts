import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test, expect, _electron as electron } from '@playwright/test';
import { newSessionForProject } from './session-ui';
import {
  captureFixtureHash,
  captureFixtureHashAfterClose,
} from './fixture-integrity';

const desktop = path.join(process.cwd(), 'apps/desktop');
const fixtures = path.join(process.cwd(), 'tests/fixtures/workspaces/library');
const executablePath = createRequire(path.join(desktop, 'package.json'))(
  'electron',
) as string;

for (const stopAfterWrite of [false, true]) {
  test(`Agent edits selected text with optional Diff; ${stopAfterWrite ? 'stops after write' : 'completes and restores receipt'}`, async ({}, info) => {
    const fixtureHash = await captureFixtureHash(fixtures);
    const workspace = info.outputPath('workspace');
    const userData = info.outputPath('user-data');
    await mkdir(userData, { recursive: true });
    await cp(fixtures, workspace, { recursive: true });
    const target = path.join(workspace, 'alpha-app/README.md');
    const before = await readFile(target, 'utf8');
    const script = info.outputPath('script.json');
    await writeFile(
      script,
      JSON.stringify({
        steps: [
          {
            action: 'tool',
            request: { tool: 'read_file', arguments: { path: 'README.md' } },
          },
          {
            action: 'tool',
            request: {
              tool: 'edit_file',
              arguments: {
                path: 'README.md',
                oldText: 'An alpha application fixture.',
                newText: 'A task-edited application fixture.',
              },
            },
          },
          {
            action: 'tool',
            request: { tool: 'read_file', arguments: { path: 'README.md' } },
          },
          ...(stopAfterWrite ? [{ action: 'wait', ms: 30_000 }] : []),
          { action: 'text', text: '已修改所选说明文字。' },
          { action: 'complete' },
        ],
      }),
    );
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PIONEER_E2E: '1',
      PIONEER_E2E_ROOT: workspace,
      PIONEER_E2E_USER_DATA: userData,
      PIONEER_E2E_RUN_ADAPTER: 'controlled',
      PIONEER_E2E_RUN_SCRIPT: script,
    };
    delete env.ELECTRON_RUN_AS_NODE;
    const launch = () =>
      electron.launch({
        executablePath,
        args: [desktop],
        env: Object.fromEntries(
          Object.entries(env).filter(
            (entry): entry is [string, string] => entry[1] !== undefined,
          ),
        ),
      });
    let app = await launch();
    try {
      let page = await app.firstWindow();
      await newSessionForProject(page, 'alpha-app');
      await page.locator('details.run-log summary').click();
      await expect(
        page.getByRole('combobox', { name: '文件权限' }),
      ).toHaveValue('read_only');
      await page
        .getByRole('textbox', { name: '运行任务' })
        .fill('把 README 的介绍改成任务编辑后的说明。');
      await page
        .getByRole('combobox', { name: '文件权限' })
        .selectOption('workspace_write');
      await page.getByRole('radio', { name: /README.md/ }).check();
      await page.getByRole('button', { name: '启动运行', exact: true }).click();
      await expect
        .poll(() => readFile(target, 'utf8'))
        .toBe(
          before.replace(
            'An alpha application fixture.',
            'A task-edited application fixture.',
          ),
        );
      if (stopAfterWrite)
        await page.getByRole('button', { name: '停止', exact: true }).click();
      await expect(page.locator('.run-status')).toContainText(
        stopAfterWrite ? '已停止' : '已完成',
      );
      await expect(
        page.getByText('已修改文件：README.md', { exact: true }),
      ).toBeVisible();
      await expect(page.locator('[data-panel-id="diff"]')).toHaveCount(0);
      await page.getByRole('button', { name: '查看改动', exact: true }).click();
      const diff = page.locator('[data-panel-id="diff"]');
      await expect(
        diff.getByText('已写入并核对', { exact: true }),
      ).toBeVisible();
      await expect(diff.getByLabel('文本改动')).toContainText(
        'A task-edited application fixture.',
      );
      await expect(diff.getByLabel('文本改动')).toContainText(
        'An alpha application fixture.',
      );
      await page.screenshot({ path: info.outputPath('agent-edit.png') });
      if (!stopAfterWrite) {
        // A persisted terminal snapshot contains the receipt, never a renewed permission.
        await expect
          .poll(async () => {
            const content = await readFile(
              path.join(userData, 'pioneer-session-state.json'),
              'utf8',
            ).catch(() => '');
            return content.includes('A task-edited application fixture.');
          })
          .toBe(true);
        await app.close();
        app = await launch();
        page = await app.firstWindow();
        await expect(
          page
            .locator('[data-panel-id="diff"]')
            .getByText('已写入并核对', { exact: true }),
        ).toBeVisible();
      }
    } finally {
      await app.close();
      expect(await captureFixtureHashAfterClose(fixtures)).toBe(fixtureHash);
      // Restore only the disposable copy to compare every unrelated file.
      await writeFile(target, before);
      expect(await captureFixtureHash(workspace)).toBe(fixtureHash);
    }
  });
}

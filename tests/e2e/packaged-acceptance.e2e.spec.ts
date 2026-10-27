import { createHash } from 'node:crypto';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  readFileSync,
  type WriteStream,
} from 'node:fs';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  chromium,
  expect,
  test,
  type Browser,
  type Page,
} from '@playwright/test';

import type { PackagedAcceptanceReport } from '../../apps/desktop/src/main/acceptance-report';
import {
  RunJournalRecordSchema,
  type RunJournalAccept,
  type RunJournalRecord,
  type RunJournalTerminal,
} from '../../apps/desktop/src/main/harness/run-journal';

import {
  captureFixtureHash,
  captureFixtureHashAfterClose,
} from './fixture-integrity';
import { newSessionForProject } from './session-ui';

/**
 * Issue #53 packaged acceptance. The shipped build disables the
 * `EnableNodeCliInspectArguments` fuse, so Playwright's `_electron.launch`
 * cannot attach to the main process and `firstWindow` always times out. This
 * spec therefore drives the real packaged renderer over Chromium CDP, while the
 * run facts come from main-process artifacts: the startup report the
 * acceptance seam writes and the atomically persisted run journal.
 *
 * It is not part of `pnpm check`: `pnpm acceptance:packaged` packages the app
 * and then runs this file through `playwright.acceptance.config.ts`.
 */

const repositoryRoot = process.cwd();
const packagedExecutablePath = path.join(
  repositoryRoot,
  'apps',
  'desktop',
  'out',
  '@pioneer-desktop-win32-x64',
  '@pioneer-desktop.exe',
);
const fixtureRoot = path.join(
  repositoryRoot,
  'tests',
  'fixtures',
  'workspaces',
  'library',
);
const evidenceDirectory = path.join(
  repositoryRoot,
  'tmp',
  'issue53-acceptance',
  'latest',
);

const cdpStartupTimeoutMs = 45_000;
const windowTimeoutMs = 60_000;
const runTimeoutMs = 90_000;

/** Development-only variables must not leak into the packaged launch. */
const inheritedLaunchVariables = [
  'ELECTRON_RUN_AS_NODE',
  'PIONEER_E2E',
  'PIONEER_E2E_ROOT',
  'PIONEER_E2E_USER_DATA',
  'PIONEER_E2E_RUN_ADAPTER',
  'PIONEER_E2E_RUN_SCRIPT',
  'PIONEER_E2E_PICKER_MODE',
  'PIONEER_E2E_PICKER_ROOT',
  'PIONEER_E2E_PICKER_DELAY_MS',
  'PIONEER_E2E_SESSION_SAVE_DELAY_MS',
  'PIONEER_E2E_REJECT_SAVE_ONCE',
  'PIONEER_E2E_RESCAN_DELAY_MS',
  'PIONEER_E2E_RESCAN_FAIL_ONCE',
  'PIONEER_PI_PROBE_OUT',
  'PIONEER_PI_PROBE_EXIT',
  'PIONEER_PI_PROVIDER_ID',
  'PIONEER_PI_MODEL_ID',
  'PIONEER_PI_ENDPOINT',
  'PIONEER_PI_API_KEY_ENV',
] as const;

const readOnlyRunScript = {
  steps: [
    { action: 'text', text: 'I will read the README first.' },
    {
      action: 'tool',
      request: { tool: 'read_file', arguments: { path: 'README.md' } },
    },
    { action: 'text', text: 'README summary written by the controlled run.' },
    { action: 'complete' },
  ],
};

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const sha256File = (filePath: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => {
      hash.update(chunk);
    });
    stream.on('end', () => {
      resolve(hash.digest('hex'));
    });
  });

const readGitEvidence = (): { commit: string; dirty: boolean } => {
  try {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repositoryRoot,
      encoding: 'utf-8',
    }).trim();
    const status = execFileSync('git', ['status', '--porcelain'], {
      cwd: repositoryRoot,
      encoding: 'utf-8',
    });
    return { commit, dirty: status.trim().length > 0 };
  } catch {
    return { commit: 'unknown', dirty: false };
  }
};

interface AcceptancePaths {
  workspacePath: string;
  userDataPath: string;
  reportPath: string;
  runScriptPath: string;
}

const createAcceptanceEnvironment = (
  paths: AcceptancePaths,
): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = { ...process.env };
  for (const variable of inheritedLaunchVariables) {
    Reflect.deleteProperty(environment, variable);
  }
  environment.PIONEER_ACCEPTANCE = '1';
  environment.PIONEER_ACCEPTANCE_WORKSPACE = paths.workspacePath;
  environment.PIONEER_ACCEPTANCE_USER_DATA = paths.userDataPath;
  environment.PIONEER_ACCEPTANCE_REPORT = paths.reportPath;
  environment.PIONEER_ACCEPTANCE_RUN_SCRIPT = paths.runScriptPath;
  return environment;
};

interface PackagedApp {
  child: ChildProcess;
  port: number;
  logStream: WriteStream;
}

const waitForDevToolsPort = async (userDataPath: string): Promise<number> => {
  const activePortPath = path.join(userDataPath, 'DevToolsActivePort');
  const deadline = Date.now() + cdpStartupTimeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(activePortPath)) {
      const [firstLine] = readFileSync(activePortPath, 'utf-8').split(/\r?\n/);
      const port = Number(firstLine);
      if (Number.isInteger(port) && port > 0 && port <= 65_535) return port;
    }
    await delay(200);
  }
  throw new Error(
    `CDP_UNAVAILABLE: ${activePortPath} was not written within ${String(cdpStartupTimeoutMs)} ms`,
  );
};

const waitForDevToolsEndpoint = async (port: number): Promise<void> => {
  const deadline = Date.now() + cdpStartupTimeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(
        `http://127.0.0.1:${String(port)}/json/version`,
      );
      if (response.ok) return;
    } catch {
      // The listener is not up yet; keep polling until the deadline.
    }
    await delay(200);
  }
  throw new Error(
    `CDP_UNAVAILABLE: http://127.0.0.1:${String(port)}/json/version never answered`,
  );
};

const launchPackagedApp = async (options: {
  environment: NodeJS.ProcessEnv;
  logPath: string;
  userDataPath: string;
}): Promise<PackagedApp> => {
  const logStream = createWriteStream(options.logPath, { flags: 'w' });
  const child = spawn(packagedExecutablePath, ['--remote-debugging-port=0'], {
    env: options.environment,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);
  const port = await waitForDevToolsPort(options.userDataPath);
  return { child, port, logStream };
};

const findPackagedWindow = async (
  browser: Browser,
  timeoutMs: number,
): Promise<Page> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const windows = browser
      .contexts()
      .flatMap((context) => context.pages())
      .filter((page) => page.url().startsWith('file:'));
    if (windows.length > 1) {
      throw new Error(
        `AMBIGUOUS_WINDOW: ${windows.map((page) => page.url()).join(', ')}`,
      );
    }
    const [window] = windows;
    if (window !== undefined) return window;
    await delay(250);
  }
  throw new Error(
    `WINDOW_NOT_READY: no packaged renderer window appeared within ${String(timeoutMs)} ms`,
  );
};

const stopPackagedApp = async (child: ChildProcess): Promise<void> => {
  const { pid } = child;
  if (pid === undefined) return;
  const alreadyExited = child.exitCode !== null || child.signalCode !== null;
  try {
    execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
      stdio: 'ignore',
    });
  } catch {
    // taskkill reports a missing process; the loop below confirms the result.
  }
  if (!alreadyExited) {
    await Promise.race([
      new Promise<void>((resolve) => {
        child.once('exit', () => {
          resolve();
        });
      }),
      delay(15_000),
    ]);
  }
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
    await delay(200);
  }
  throw new Error(
    `PROCESS_LEAK: packaged process ${String(pid)} is still running`,
  );
};

const readJournalRecords = async (
  journalPath: string,
): Promise<RunJournalRecord[]> => {
  const content = await readFile(journalPath, 'utf-8');
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      const parsed = RunJournalRecordSchema.safeParse(
        JSON.parse(line) as unknown,
      );
      if (!parsed.success) {
        throw new Error(
          `JOURNAL_MISMATCH: line ${String(index + 1)} of ${journalPath} does not match the run journal schema`,
        );
      }
      return parsed.data;
    });
};

const waitForJournal = async (
  journalPath: string,
  timeoutMs: number,
): Promise<RunJournalRecord[]> => {
  const deadline = Date.now() + timeoutMs;
  let lastError = new Error(
    `JOURNAL_MISMATCH: ${journalPath} was never written`,
  );
  while (Date.now() < deadline) {
    try {
      const records = await readJournalRecords(journalPath);
      if (records.some((record) => record.kind === 'terminal')) return records;
      lastError = new Error(
        `JOURNAL_MISMATCH: ${journalPath} has no terminal record yet`,
      );
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
    await delay(250);
  }
  throw lastError;
};

const readStartupReport = async (
  reportPath: string,
  timeoutMs: number,
): Promise<PackagedAcceptanceReport> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(reportPath)) {
      const parsed: unknown = JSON.parse(await readFile(reportPath, 'utf-8'));
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed as PackagedAcceptanceReport;
      }
    }
    await delay(200);
  }
  throw new Error(
    `WORKSPACE_NOT_READY: ${reportPath} was not written within ${String(timeoutMs)} ms`,
  );
};

const expectSamePath = (
  actual: string | null,
  expected: string,
  label: string,
): void => {
  if (actual === null) {
    throw new Error(`${label}: expected ${expected} but the path was null`);
  }
  expect(actual.toLowerCase(), label).toBe(
    path.resolve(expected).toLowerCase(),
  );
};

test('the packaged build completes one read-only run through the acceptance seam', async ({}, testInfo) => {
  expect(
    existsSync(packagedExecutablePath),
    `missing packaged executable: ${packagedExecutablePath}. Run \`pnpm acceptance:packaged\`, which packages the app first.`,
  ).toBe(true);

  const startedAt = new Date().toISOString();
  const git = readGitEvidence();
  const executableSha256 = await sha256File(packagedExecutablePath);
  const beforeHash = await captureFixtureHash(fixtureRoot);

  await rm(evidenceDirectory, { force: true, recursive: true });
  const userDataPath = path.join(evidenceDirectory, 'user-data');
  const reportsPath = path.join(evidenceDirectory, 'reports');
  const evidenceFilesPath = path.join(evidenceDirectory, 'evidence');
  await Promise.all([
    mkdir(userDataPath, { recursive: true }),
    mkdir(reportsPath, { recursive: true }),
    mkdir(evidenceFilesPath, { recursive: true }),
  ]);

  const reportPath = path.join(reportsPath, 'startup-report.json');
  const runScriptPath = path.join(reportsPath, 'run-script.json');
  const journalPath = path.join(userDataPath, 'runs', 'journal.jsonl');
  const statusScreenshotPath = path.join(
    evidenceFilesPath,
    'packaged-run-status.png',
  );
  const eventsScreenshotPath = path.join(
    evidenceFilesPath,
    'packaged-run-events.png',
  );
  const logPath = path.join(evidenceFilesPath, 'packaged-app.log');
  const summaryPath = path.join(evidenceDirectory, 'summary.json');
  await writeFile(
    runScriptPath,
    `${JSON.stringify(readOnlyRunScript, null, 2)}\n`,
    'utf-8',
  );

  const environment = createAcceptanceEnvironment({
    workspacePath: fixtureRoot,
    userDataPath,
    reportPath,
    runScriptPath,
  });

  const app = await launchPackagedApp({
    environment,
    logPath,
    userDataPath,
  });

  let browser: Browser | null = null;
  let startupReport: PackagedAcceptanceReport | null = null;
  let journal: RunJournalRecord[] = [];
  let transcript = '';
  let failure: unknown;

  try {
    await waitForDevToolsEndpoint(app.port);
    browser = await chromium.connectOverCDP(
      `http://127.0.0.1:${String(app.port)}`,
      { timeout: 30_000 },
    );
    const window = await findPackagedWindow(browser, windowTimeoutMs);
    await expect(window).toHaveTitle('Pioneer');

    startupReport = await readStartupReport(reportPath, cdpStartupTimeoutMs);
    expect(startupReport.kind).toBe('pioneer-packaged-acceptance-startup');
    expect(startupReport.schemaVersion).toBe(1);
    expect(
      startupReport.isPackaged,
      'the acceptance run must exercise a packaged build',
    ).toBe(true);
    expect(startupReport.processId).toBe(app.child.pid);
    expect(startupReport.adapterKind).toBe('controlled');
    expect(startupReport.adapterAvailable).toBe(true);
    expectSamePath(
      startupReport.workspaceRoot,
      fixtureRoot,
      'startup report workspace root',
    );
    expectSamePath(
      startupReport.userDataRoot,
      userDataPath,
      'startup report user data root',
    );
    expect(
      startupReport.projects.map((project) => project.name).sort(),
    ).toEqual(['alpha-app', 'beta-notes', 'broken-metadata']);
    expect(startupReport.channels).toContain('run:start');
    const alphaProject = startupReport.projects.find(
      (project) => project.name === 'alpha-app',
    );
    if (alphaProject === undefined) {
      throw new Error('WORKSPACE_NOT_READY: startup report lacks alpha-app');
    }

    // The renderer must show the same workspace main reported.
    await expect(
      window.getByRole('button', {
        name: 'Open project alpha-app',
        exact: true,
      }),
    ).toBeVisible({ timeout: 30_000 });
    await newSessionForProject(window, 'alpha-app');

    // The four dockable panels the packaged workbench offers, read from the UI.
    const moduleMenu = window.locator('details.module-picker');
    await moduleMenu.locator('summary').click();
    await expect(
      moduleMenu.getByRole('button', { name: /上下文/ }),
    ).toBeVisible();
    await expect(
      moduleMenu.getByRole('button', { name: /能力/ }),
    ).toBeVisible();
    await expect(
      moduleMenu.getByRole('button', { name: /改动/ }),
    ).toBeVisible();
    await expect(
      moduleMenu.getByRole('button', { name: /产物/ }),
    ).toBeVisible();
    await window.keyboard.press('Escape');

    await window.locator('details.run-log summary').click();
    await window
      .getByRole('textbox', { name: '运行任务' })
      .fill('读取 alpha-app 的 README.md 并总结内容。');
    await window.getByRole('button', { name: '启动运行' }).click();

    await expect(
      window.getByText('工具请求：read_file', { exact: true }),
    ).toBeVisible({ timeout: runTimeoutMs });
    await expect(
      window.getByText(/An alpha application fixture\./),
    ).toBeVisible({ timeout: runTimeoutMs });
    await expect(
      window.locator('.run-status', { hasText: '已完成' }),
    ).toBeVisible({ timeout: runTimeoutMs });

    transcript = await window.locator('.run-panel').innerText();
    expect(transcript).toContain('工具请求：read_file');
    expect(transcript).toContain('An alpha application fixture.');
    // Two frames: the terminal status header, then the real tool exchange the
    // panel renders below the fold of this window size.
    await window.locator('.run-status').scrollIntoViewIfNeeded();
    await window.screenshot({ path: statusScreenshotPath });
    await window.locator('.run-log__list').scrollIntoViewIfNeeded();
    await window.screenshot({ path: eventsScreenshotPath });
    await testInfo.attach('packaged-run-status.png', {
      path: statusScreenshotPath,
      contentType: 'image/png',
    });
    await testInfo.attach('packaged-run-events.png', {
      path: eventsScreenshotPath,
      contentType: 'image/png',
    });

    journal = await waitForJournal(journalPath, 30_000);
    const accepts = journal.filter(
      (record): record is RunJournalAccept => record.kind === 'accept',
    );
    const terminals = journal.filter(
      (record): record is RunJournalTerminal => record.kind === 'terminal',
    );
    const tombstones = journal.filter((record) => record.kind === 'tombstone');
    expect(
      accepts,
      'a fresh profile must contain exactly one accepted run',
    ).toHaveLength(1);
    expect(terminals, 'the accepted run must commit one terminal').toHaveLength(
      1,
    );
    expect(tombstones, 'no run may be left as host_restarted').toHaveLength(0);

    const [accepted] = accepts;
    const [terminal] = terminals;
    if (accepted === undefined || terminal === undefined) {
      throw new Error('JOURNAL_MISMATCH: accept or terminal record is missing');
    }
    expect(accepted.adapter).toBe('controlled');
    expect(accepted.projectId).toBe(alphaProject.id);
    expect(terminal.runId).toBe(accepted.runId);
    expect(terminal.status).toBe('completed');

    await copyFile(journalPath, path.join(evidenceFilesPath, 'journal.jsonl'));
    await copyFile(
      reportPath,
      path.join(evidenceFilesPath, 'startup-report.json'),
    );
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    const cleanupErrors: string[] = [];
    try {
      if (browser !== null) await browser.close();
    } catch (error) {
      cleanupErrors.push(`browser close: ${describeError(error)}`);
    }
    try {
      await stopPackagedApp(app.child);
    } catch (error) {
      cleanupErrors.push(`process stop: ${describeError(error)}`);
    }
    await new Promise<void>((resolve) => {
      app.logStream.end(() => {
        resolve();
      });
    });

    const afterHash = await captureFixtureHashAfterClose(fixtureRoot);
    const terminalRecord = journal.find(
      (record): record is RunJournalTerminal => record.kind === 'terminal',
    );
    const summary = {
      kind: 'pioneer-packaged-acceptance' as const,
      outcome:
        failure === undefined ? ('passed' as const) : ('failed' as const),
      startedAt,
      endedAt: new Date().toISOString(),
      git,
      executable: { path: packagedExecutablePath, sha256: executableSha256 },
      launch: {
        processId: app.child.pid ?? null,
        cdpPort: app.port,
        cdpDiscovery: 'DevToolsActivePort',
        userDataPath,
        workspacePath: fixtureRoot,
      },
      startupReport,
      run: {
        runId: terminalRecord?.runId ?? null,
        terminalStatus: terminalRecord?.status ?? null,
        records: journal,
        transcript,
      },
      fixture: {
        beforeHash,
        afterHash,
        unchanged: beforeHash === afterHash,
      },
      evidence: {
        statusScreenshot: existsSync(statusScreenshotPath)
          ? statusScreenshotPath
          : null,
        eventsScreenshot: existsSync(eventsScreenshotPath)
          ? eventsScreenshotPath
          : null,
        log: existsSync(logPath) ? logPath : null,
        startupReport: existsSync(reportPath) ? reportPath : null,
        journal: existsSync(journalPath) ? journalPath : null,
      },
      cleanupErrors,
      failure: failure === undefined ? null : describeError(failure),
    };
    await mkdir(path.dirname(summaryPath), { recursive: true });
    await writeFile(
      summaryPath,
      `${JSON.stringify(summary, null, 2)}\n`,
      'utf-8',
    );
    await testInfo.attach('acceptance-summary.json', {
      path: summaryPath,
      contentType: 'application/json',
    });

    if (failure === undefined) {
      expect(
        afterHash,
        'FIXTURE_MUTATED: the acceptance run changed the fixture workspace',
      ).toBe(beforeHash);
      if (cleanupErrors.length > 0) {
        throw new Error(`EVIDENCE_INCOMPLETE: ${cleanupErrors.join(' | ')}`);
      }
      console.log(`[acceptance] packaged run passed: ${eventsScreenshotPath}`);
    }
  }
});

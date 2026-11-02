import { createHash } from 'node:crypto';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  readFileSync,
  statSync,
  type WriteStream,
} from 'node:fs';
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  chromium,
  expect,
  test,
  type Browser,
  type Page,
} from '@playwright/test';

import type { PackagedAcceptanceConfig } from '../../apps/desktop/src/main/acceptance-config';
import {
  canonicalizeExistingPath,
  pathsEqual,
} from '../../apps/desktop/src/main/launch-paths';
import {
  acceptanceChannels,
  type PackagedAcceptanceReport,
} from '../../apps/desktop/src/main/acceptance-report';
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
const packagedAsarPath = path.join(
  repositoryRoot,
  'apps',
  'desktop',
  'out',
  '@pioneer-desktop-win32-x64',
  'resources',
  'app.asar',
);
const fixtureRoot = path.join(
  repositoryRoot,
  'tests',
  'fixtures',
  'workspaces',
  'library',
);
const alphaReadmePath = path.join(fixtureRoot, 'alpha-app', 'README.md');
const evidenceDirectory = path.join(
  repositoryRoot,
  'tmp',
  'issue53-acceptance',
  'latest',
);

const runStatePath = path.join(
  repositoryRoot,
  'tmp',
  'issue53-acceptance',
  'run.json',
);

const cdpStartupTimeoutMs = 45_000;
const windowTimeoutMs = 60_000;
const runTimeoutMs = 90_000;

const expectedChannels = acceptanceChannels().sort();

/**
 * Development-only variables must not leak into the packaged launch. Any
 * PIONEER_ variable is dropped, so a future seam cannot be inherited just
 * because this list went stale.
 */
const dropInheritedVariables = (environment: NodeJS.ProcessEnv): void => {
  for (const name of Object.keys(environment)) {
    if (name === 'ELECTRON_RUN_AS_NODE' || name.startsWith('PIONEER_')) {
      Reflect.deleteProperty(environment, name);
    }
  }
};

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

const sha256Bytes = (content: Buffer): string =>
  createHash('sha256').update(content).digest('hex');

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

interface AcceptanceRunState {
  startedAt: string;
  commit: string | null;
  dirty: boolean | null;
}

/**
 * Reads the marker `prepare-acceptance-run.mjs` wrote before the package build.
 * It anchors the run: the executable may not predate it, and the recorded
 * commit describes the tree the package was built from.
 */
const readAcceptanceRunState = (): AcceptanceRunState => {
  if (!existsSync(runStatePath)) {
    throw new Error(
      `STALE_EXECUTABLE: ${runStatePath} is missing; run \`pnpm acceptance:packaged\` instead of invoking playwright directly`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(runStatePath, 'utf-8'));
  } catch (error) {
    throw new Error(
      `STALE_EXECUTABLE: ${runStatePath} is unreadable; run \`pnpm acceptance:packaged\` again`,
      { cause: error },
    );
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`STALE_EXECUTABLE: ${runStatePath} is not a run marker`);
  }
  const state = parsed as Partial<AcceptanceRunState>;
  if (typeof state.startedAt !== 'string') {
    throw new Error(`STALE_EXECUTABLE: ${runStatePath} has no startedAt`);
  }
  return {
    startedAt: state.startedAt,
    commit: typeof state.commit === 'string' ? state.commit : null,
    dirty: typeof state.dirty === 'boolean' ? state.dirty : null,
  };
};

const createAcceptanceEnvironment = (
  paths: PackagedAcceptanceConfig,
): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = { ...process.env };
  dropInheritedVariables(environment);
  environment.PIONEER_ACCEPTANCE = '1';
  environment.PIONEER_ACCEPTANCE_WORKSPACE = paths.workspacePath;
  environment.PIONEER_ACCEPTANCE_USER_DATA = paths.userDataPath;
  environment.PIONEER_ACCEPTANCE_EVIDENCE = paths.evidencePath;
  environment.PIONEER_ACCEPTANCE_REPORT = paths.reportPath;
  environment.PIONEER_ACCEPTANCE_RUN_SCRIPT = paths.runScriptPath;
  return environment;
};

interface WaitOptions<T> {
  task: string;
  timeoutMs: number;
  probe: () => Promise<T | null> | T | null;
}

/** Polls `probe` until it yields a value; `null` means "not ready yet". */
const waitFor = async <T>(options: WaitOptions<T>): Promise<T> => {
  const deadline = Date.now() + options.timeoutMs;
  while (Date.now() < deadline) {
    const value = await options.probe();
    if (value !== null) return value;
    await delay(200);
  }
  throw new Error(
    `${options.task}: no result within ${String(options.timeoutMs)} ms`,
  );
};

interface PackagedApp {
  child: ChildProcess;
  port: number;
  logStream: WriteStream;
  logErrors: string[];
}

const readDevToolsPort = (userDataPath: string): number | null => {
  const activePortPath = path.join(userDataPath, 'DevToolsActivePort');
  if (!existsSync(activePortPath)) return null;
  const [firstLine] = readFileSync(activePortPath, 'utf-8').split(/\r?\n/);
  const port = Number(firstLine);
  return Number.isInteger(port) && port > 0 && port <= 65_535 ? port : null;
};

const waitForDevToolsPort = (userDataPath: string): Promise<number> =>
  waitFor({
    task: `CDP_UNAVAILABLE: ${path.join(userDataPath, 'DevToolsActivePort')} never appeared`,
    timeoutMs: cdpStartupTimeoutMs,
    probe: () => readDevToolsPort(userDataPath),
  });

const waitForDevToolsEndpoint = (port: number): Promise<true> =>
  waitFor({
    task: `CDP_UNAVAILABLE: http://127.0.0.1:${String(port)}/json/version never answered`,
    timeoutMs: cdpStartupTimeoutMs,
    probe: async () => {
      try {
        const response = await fetch(
          `http://127.0.0.1:${String(port)}/json/version`,
        );
        return response.ok ? true : null;
      } catch {
        return null;
      }
    },
  });

const closeStream = (stream: WriteStream): Promise<void> =>
  new Promise((resolve) => {
    stream.end(() => {
      resolve();
    });
  });

const stopChild = async (child: ChildProcess): Promise<void> => {
  const { pid } = child;
  if (pid === undefined) return;
  const alreadyExited = child.exitCode !== null || child.signalCode !== null;
  try {
    execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
      stdio: 'ignore',
    });
  } catch {
    // taskkill reports a missing process; the wait below confirms the result.
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
  await waitFor<true>({
    task: `PROCESS_LEAK: packaged process ${String(pid)} is still running`,
    timeoutMs: 15_000,
    probe: () => {
      try {
        process.kill(pid, 0);
        return null;
      } catch {
        return true;
      }
    },
  });
};

/**
 * Spawns the packaged executable. A spawn error and a missing CDP port both end
 * in the same cleanup, so a failed launch cannot leak an Electron process or an
 * open log stream.
 */
const launchPackagedApp = async (options: {
  environment: NodeJS.ProcessEnv;
  logPath: string;
  userDataPath: string;
}): Promise<PackagedApp> => {
  const logStream = createWriteStream(options.logPath, { flags: 'w' });
  const logErrors: string[] = [];
  logStream.on('error', (error) => {
    logErrors.push(describeError(error));
  });
  const child = spawn(packagedExecutablePath, ['--remote-debugging-port=0'], {
    env: options.environment,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);
  const spawnFailure = new Promise<never>((_resolve, reject) => {
    child.once('error', (error) => {
      reject(new Error(`SPAWN_FAILED: ${describeError(error)}`));
    });
  });
  try {
    const port = await Promise.race([
      waitForDevToolsPort(options.userDataPath),
      spawnFailure,
    ]);
    return { child, port, logStream, logErrors };
  } catch (error) {
    await stopChild(child).catch(() => undefined);
    await closeStream(logStream);
    throw error;
  }
};

const findPackagedWindow = (browser: Browser): Promise<Page> =>
  waitFor<Page>({
    task: 'WINDOW_NOT_READY: no packaged renderer window appeared',
    timeoutMs: windowTimeoutMs,
    probe: () => {
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
      return window ?? null;
    },
  });

/** A journal read that landed on a half-written line; the caller retries. */
class PartialJournalRead extends Error {}

/** The startup facts this spec relies on must be present and well typed. */
const parseStartupReport = (parsed: unknown): PackagedAcceptanceReport => {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('WORKSPACE_NOT_READY: the startup report is not an object');
  }
  const report = parsed as Partial<PackagedAcceptanceReport>;
  if (
    report.kind !== 'pioneer-packaged-acceptance-startup' ||
    report.schemaVersion !== 1 ||
    typeof report.isPackaged !== 'boolean' ||
    typeof report.processId !== 'number' ||
    typeof report.adapterKind !== 'string' ||
    typeof report.adapterAvailable !== 'boolean' ||
    typeof report.executablePath !== 'string' ||
    typeof report.userDataRoot !== 'string' ||
    !Array.isArray(report.projects) ||
    !Array.isArray(report.warnings) ||
    !Array.isArray(report.channels) ||
    report.projects.some(
      (project) =>
        typeof project !== 'object' ||
        typeof project.id !== 'string' ||
        typeof project.name !== 'string' ||
        typeof project.absolutePath !== 'string',
    ) ||
    report.channels.some((channel) => typeof channel !== 'string')
  ) {
    throw new Error(
      'WORKSPACE_NOT_READY: the startup report does not match the expected shape',
    );
  }
  return report as PackagedAcceptanceReport;
};

const readJournalRecords = (journalPath: string): RunJournalRecord[] => {
  const content = readFileSync(journalPath, 'utf-8');
  const records: RunJournalRecord[] = [];
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  for (const [index, line] of lines.entries()) {
    let parsedLine: unknown;
    try {
      parsedLine = JSON.parse(line) as unknown;
    } catch {
      throw new PartialJournalRead(journalPath);
    }
    const parsed = RunJournalRecordSchema.safeParse(parsedLine);
    if (!parsed.success) {
      throw new Error(
        `JOURNAL_MISMATCH: line ${String(index + 1)} of ${journalPath} does not match the run journal schema`,
      );
    }
    records.push(parsed.data);
  }
  return records;
};

const waitForJournal = (journalPath: string): Promise<RunJournalRecord[]> =>
  waitFor({
    task: `JOURNAL_MISMATCH: ${journalPath} never reached a terminal record`,
    timeoutMs: 30_000,
    probe: () => {
      if (!existsSync(journalPath)) return null;
      let records: RunJournalRecord[];
      try {
        records = readJournalRecords(journalPath);
      } catch (error) {
        if (error instanceof PartialJournalRead) return null;
        throw error;
      }
      return records.some((record) => record.kind === 'terminal')
        ? records
        : null;
    },
  });

const readStartupReport = (
  reportPath: string,
): Promise<PackagedAcceptanceReport> =>
  waitFor<PackagedAcceptanceReport>({
    task: `WORKSPACE_NOT_READY: ${reportPath} was not written`,
    timeoutMs: cdpStartupTimeoutMs,
    probe: () => {
      if (!existsSync(reportPath)) return null;
      try {
        const parsed: unknown = JSON.parse(readFileSync(reportPath, 'utf-8'));
        return parseStartupReport(parsed);
      } catch {
        return null;
      }
    },
  });

const expectSamePath = (
  actual: string | null,
  expected: string,
  label: string,
): void => {
  if (actual === null) {
    throw new Error(`${label}: expected ${expected} but the path was null`);
  }
  expect(
    pathsEqual(
      canonicalizeExistingPath(actual),
      canonicalizeExistingPath(expected),
    ),
    label,
  ).toBe(true);
};

interface ReadmeEvidence {
  path: string;
  bytes: number;
  sha256: string;
  lines: string[];
}

const readReadmeEvidence = (): ReadmeEvidence => {
  const content = readFileSync(alphaReadmePath);
  return {
    path: alphaReadmePath,
    bytes: content.byteLength,
    sha256: sha256Bytes(content),
    lines: content
      .toString('utf-8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
  };
};

/**
 * A fresh profile must commit exactly one accepted run and one terminal, for
 * the project under test, with the run id the visible panel showed.
 */
const assertJournalRecords = (
  records: RunJournalRecord[],
  alphaProjectId: string,
  transcript: string,
): RunJournalTerminal => {
  const accepts = records.filter(
    (record): record is RunJournalAccept => record.kind === 'accept',
  );
  const terminals = records.filter(
    (record): record is RunJournalTerminal => record.kind === 'terminal',
  );
  const tombstones = records.filter((record) => record.kind === 'tombstone');
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
  expect(accepted.projectId).toBe(alphaProjectId);
  expect(terminal.runId).toBe(accepted.runId);
  expect(terminal.status).toBe('completed');
  expect(
    transcript,
    'the run-log panel must show the run id the journal recorded',
  ).toContain(terminal.runId);
  return terminal;
};

test('the packaged build completes one read-only run through the acceptance seam', async ({}, testInfo) => {
  expect(
    existsSync(packagedExecutablePath),
    `missing packaged executable: ${packagedExecutablePath}. Run \`pnpm acceptance:packaged\`, which packages the app first.`,
  ).toBe(true);

  const startedAt = new Date().toISOString();
  const runState = readAcceptanceRunState();
  const runStartedAtMs = Date.parse(runState.startedAt);
  if (!Number.isFinite(runStartedAtMs)) {
    throw new Error(
      `STALE_EXECUTABLE: ${runStatePath} startedAt is not a timestamp`,
    );
  }
  const executableMtimeMs = statSync(packagedExecutablePath).mtimeMs;
  expect(
    executableMtimeMs,
    'STALE_EXECUTABLE: the packaged executable predates this run, so the build did not produce it',
  ).toBeGreaterThan(runStartedAtMs);
  expect(
    existsSync(packagedAsarPath),
    `missing packaged asar: ${packagedAsarPath}`,
  ).toBe(true);
  const executableSha256 = await sha256File(packagedExecutablePath);
  const appAsarSha256 = await sha256File(packagedAsarPath);
  const readme = readReadmeEvidence();
  const beforeHash = await captureFixtureHash(fixtureRoot);

  await rm(evidenceDirectory, { force: true, recursive: true });
  const userDataPath = path.join(evidenceDirectory, 'user-data');
  const evidencePath = path.join(evidenceDirectory, 'evidence');
  await Promise.all([
    mkdir(userDataPath, { recursive: true }),
    mkdir(evidencePath, { recursive: true }),
  ]);

  const reportPath = path.join(evidencePath, 'startup-report.json');
  const runScriptPath = path.join(evidencePath, 'run-script.json');
  const journalPath = path.join(userDataPath, 'runs', 'journal.jsonl');
  const statusScreenshotPath = path.join(
    evidencePath,
    'packaged-run-status.png',
  );
  const eventsScreenshotPath = path.join(
    evidencePath,
    'packaged-run-events.png',
  );
  const logPath = path.join(evidencePath, 'packaged-app.log');
  const summaryPath = path.join(evidenceDirectory, 'summary.json');
  await writeFile(
    runScriptPath,
    `${JSON.stringify(readOnlyRunScript, null, 2)}\n`,
    'utf-8',
  );

  const environment = createAcceptanceEnvironment({
    workspacePath: fixtureRoot,
    userDataPath,
    evidencePath,
    reportPath,
    runScriptPath,
  });

  let app: PackagedApp | null = null;
  let browser: Browser | null = null;
  let startupReport: PackagedAcceptanceReport | null = null;
  let journal: RunJournalRecord[] = [];
  let transcript = '';
  let failure: unknown;

  try {
    app = await launchPackagedApp({ environment, logPath, userDataPath });
    const launchedApp = app;
    await waitForDevToolsEndpoint(launchedApp.port);
    browser = await chromium.connectOverCDP(
      `http://127.0.0.1:${String(launchedApp.port)}`,
      { timeout: 30_000 },
    );
    const window = await findPackagedWindow(browser);
    await expect(window).toHaveTitle('Pioneer');

    startupReport = await readStartupReport(reportPath);
    expect(startupReport.kind).toBe('pioneer-packaged-acceptance-startup');
    expect(startupReport.schemaVersion).toBe(1);
    expect(
      startupReport.isPackaged,
      'the acceptance run must exercise a packaged build',
    ).toBe(true);
    expect(startupReport.processId).toBe(launchedApp.child.pid);
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
    expectSamePath(
      startupReport.executablePath,
      packagedExecutablePath,
      'startup report executable path',
    );
    expect(
      startupReport.projects.map((project) => project.name).sort(),
    ).toEqual(['alpha-app', 'beta-notes', 'broken-metadata']);
    expect([...startupReport.channels].sort()).toEqual(expectedChannels);
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

    // Every dockable panel the packaged workbench offers, read from the UI.
    const moduleMenu = window.locator('details.module-picker');
    await moduleMenu.locator('summary').click();
    for (const panelName of ['上下文', '能力', '运行日志', '改动', '产物']) {
      await expect(
        moduleMenu.getByRole('button', { name: new RegExp(panelName) }),
      ).toBeVisible();
    }
    await moduleMenu
      .getByRole('button', { name: '+ 运行日志', exact: true })
      .click();
    await window.keyboard.press('Escape');
    const runLogPanel = window.locator('.dock-panel[data-panel-id="runlog"]');
    await expect(runLogPanel).toBeVisible();

    await window.locator('details.run-log summary').click();
    await window
      .getByRole('textbox', { name: '运行任务' })
      .fill('读取 alpha-app 的 README.md 并总结内容。');
    await window.getByRole('button', { name: '启动运行' }).click();

    await expect(
      window.getByText('工具请求：read_file', { exact: true }),
    ).toBeVisible({ timeout: runTimeoutMs });
    await expect(
      window.locator('.run-status', { hasText: '已完成' }),
    ).toBeVisible({ timeout: runTimeoutMs });

    transcript = await runLogPanel.innerText();
    expect(transcript).toContain('工具请求：read_file');
    for (const line of readme.lines) {
      expect(
        transcript,
        `the run log must show the real README line: ${line}`,
      ).toContain(line);
    }

    // Two distinct frames: the window with the run controls and terminal
    // status in view, then the run-log panel with the tool exchange.
    const runStatus = window.locator('.run-status');
    await runStatus.scrollIntoViewIfNeeded();
    await expect(runStatus).toBeInViewport();
    await window.screenshot({ path: statusScreenshotPath });
    await runLogPanel.screenshot({ path: eventsScreenshotPath });
    await testInfo.attach('packaged-run-status.png', {
      path: statusScreenshotPath,
      contentType: 'image/png',
    });
    await testInfo.attach('packaged-run-events.png', {
      path: eventsScreenshotPath,
      contentType: 'image/png',
    });

    journal = await waitForJournal(journalPath);
    assertJournalRecords(journal, alphaProject.id, transcript);

    await copyFile(journalPath, path.join(evidencePath, 'journal.jsonl'));
  } catch (error) {
    failure = error;
  } finally {
    const cleanupErrors: string[] = [];
    const logErrors = app?.logErrors ?? [];
    try {
      if (browser !== null) await browser.close();
    } catch (error) {
      cleanupErrors.push(`browser close: ${describeError(error)}`);
    }
    if (app !== null) {
      try {
        await stopChild(app.child);
      } catch (error) {
        cleanupErrors.push(`process stop: ${describeError(error)}`);
      }
      await closeStream(app.logStream);
    }

    const afterHash = await captureFixtureHashAfterClose(fixtureRoot);
    const fixtureUnchanged = afterHash === beforeHash;
    const terminalRecord = journal.find(
      (record): record is RunJournalTerminal => record.kind === 'terminal',
    );
    const logSize = existsSync(logPath) ? statSync(logPath).size : 0;
    const outcome =
      failure === undefined &&
      fixtureUnchanged &&
      cleanupErrors.length === 0 &&
      logErrors.length === 0 &&
      logSize > 0
        ? ('passed' as const)
        : ('failed' as const);

    const summary = {
      kind: 'pioneer-packaged-acceptance' as const,
      outcome,
      startedAt,
      endedAt: new Date().toISOString(),
      source: runState,
      executable: {
        path: packagedExecutablePath,
        sha256: executableSha256,
        mtimeMs: executableMtimeMs,
        appAsar: { path: packagedAsarPath, sha256: appAsarSha256 },
      },
      launch: {
        processId: app?.child.pid ?? null,
        cdpPort: app?.port ?? null,
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
        readme,
      },
      fixture: {
        beforeHash,
        afterHash,
        unchanged: fixtureUnchanged,
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
      log: { path: logPath, bytes: logSize, errors: logErrors },
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
      if (!fixtureUnchanged) {
        failure = new Error(
          'FIXTURE_MUTATED: the acceptance run changed the fixture workspace',
        );
      } else if (cleanupErrors.length > 0) {
        failure = new Error(
          `EVIDENCE_INCOMPLETE: ${cleanupErrors.join(' | ')}`,
        );
      } else if (logErrors.length > 0) {
        failure = new Error(
          `EVIDENCE_INCOMPLETE: the packaged log stream failed: ${logErrors.join(' | ')}`,
        );
      } else if (logSize === 0) {
        failure = new Error(
          'EVIDENCE_INCOMPLETE: the packaged app wrote no log output',
        );
      } else {
        console.log(
          `[acceptance] packaged run passed: ${eventsScreenshotPath}`,
        );
      }
    }
  }

  if (failure !== undefined) {
    throw failure instanceof Error
      ? failure
      : new Error(describeError(failure));
  }
});

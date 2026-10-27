import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  applyPackagedAcceptanceConfig,
  resolvePackagedAcceptanceConfig,
  type PackagedAcceptanceEnvironment,
} from '../../apps/desktop/src/main/acceptance-config';

const temporaryDirectories: string[] = [];

interface AcceptanceFixture {
  container: string;
  workspacePath: string;
  userDataPath: string;
  reportsPath: string;
  reportPath: string;
  scriptPath: string;
}

async function createAcceptanceFixture(): Promise<AcceptanceFixture> {
  const container = await mkdtemp(join(tmpdir(), 'pioneer-acceptance-'));
  temporaryDirectories.push(container);
  const workspacePath = join(container, 'workspace');
  const userDataPath = join(container, 'user-data');
  const reportsPath = join(container, 'reports');
  await Promise.all([
    mkdir(join(workspacePath, 'alpha-app'), { recursive: true }),
    mkdir(userDataPath, { recursive: true }),
    mkdir(reportsPath, { recursive: true }),
  ]);
  const scriptPath = join(reportsPath, 'run-script.json');
  await writeFile(
    scriptPath,
    JSON.stringify({ steps: [{ action: 'complete' }] }),
    'utf-8',
  );
  return {
    container,
    workspacePath,
    userDataPath,
    reportsPath,
    reportPath: join(reportsPath, 'startup.json'),
    scriptPath,
  };
}

function validEnvironment(
  fixture: AcceptanceFixture,
): PackagedAcceptanceEnvironment {
  return {
    PIONEER_ACCEPTANCE: '1',
    PIONEER_ACCEPTANCE_WORKSPACE: fixture.workspacePath,
    PIONEER_ACCEPTANCE_USER_DATA: fixture.userDataPath,
    PIONEER_ACCEPTANCE_REPORT: fixture.reportPath,
    PIONEER_ACCEPTANCE_RUN_SCRIPT: fixture.scriptPath,
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('packaged acceptance launch seam', () => {
  it('never activates for a development build, even with the switch set', async () => {
    const fixture = await createAcceptanceFixture();

    expect(
      resolvePackagedAcceptanceConfig(false, validEnvironment(fixture)),
    ).toBeNull();
  });

  it.each([undefined, '', 'true', '01', '0', 'yes'])(
    'ignores a packaged launch without the exact switch %#',
    (PIONEER_ACCEPTANCE) => {
      const setPath = vi.fn();

      expect(
        applyPackagedAcceptanceConfig(
          { isPackaged: true, setPath },
          {
            PIONEER_ACCEPTANCE,
            PIONEER_ACCEPTANCE_WORKSPACE: 'not-an-absolute-workspace',
            PIONEER_ACCEPTANCE_USER_DATA: 'not-an-absolute-user-data',
          },
        ),
      ).toBeNull();
      expect(setPath).not.toHaveBeenCalled();
    },
  );

  it('does not treat the development E2E variables as a packaged acceptance', () => {
    expect(
      resolvePackagedAcceptanceConfig(true, {
        PIONEER_E2E: '1',
        PIONEER_E2E_ROOT: 'C:\\workspace',
        PIONEER_E2E_USER_DATA: 'C:\\profile',
      } as PackagedAcceptanceEnvironment),
    ).toBeNull();
  });

  it('fails closed when a switched packaged launch lacks its paths', async () => {
    const fixture = await createAcceptanceFixture();

    expect(() =>
      resolvePackagedAcceptanceConfig(true, { PIONEER_ACCEPTANCE: '1' }),
    ).toThrow('PIONEER_ACCEPTANCE_WORKSPACE');
    expect(() =>
      resolvePackagedAcceptanceConfig(true, {
        PIONEER_ACCEPTANCE: '1',
        PIONEER_ACCEPTANCE_WORKSPACE: fixture.workspacePath,
      }),
    ).toThrow('PIONEER_ACCEPTANCE_USER_DATA');
    expect(() =>
      resolvePackagedAcceptanceConfig(true, {
        PIONEER_ACCEPTANCE: '1',
        PIONEER_ACCEPTANCE_WORKSPACE: fixture.workspacePath,
        PIONEER_ACCEPTANCE_USER_DATA: fixture.userDataPath,
      }),
    ).toThrow('PIONEER_ACCEPTANCE_REPORT');
    expect(() =>
      resolvePackagedAcceptanceConfig(true, {
        PIONEER_ACCEPTANCE: '1',
        PIONEER_ACCEPTANCE_WORKSPACE: fixture.workspacePath,
        PIONEER_ACCEPTANCE_USER_DATA: fixture.userDataPath,
        PIONEER_ACCEPTANCE_REPORT: fixture.reportPath,
      }),
    ).toThrow('PIONEER_ACCEPTANCE_RUN_SCRIPT');
  });

  it('rejects relative or missing directories and a report outside an existing directory', async () => {
    const fixture = await createAcceptanceFixture();

    expect(() =>
      resolvePackagedAcceptanceConfig(true, {
        ...validEnvironment(fixture),
        PIONEER_ACCEPTANCE_WORKSPACE: 'relative-workspace',
      }),
    ).toThrow('PIONEER_ACCEPTANCE_WORKSPACE');
    expect(() =>
      resolvePackagedAcceptanceConfig(true, {
        ...validEnvironment(fixture),
        PIONEER_ACCEPTANCE_USER_DATA: join(fixture.userDataPath, 'missing'),
      }),
    ).toThrow('PIONEER_ACCEPTANCE_USER_DATA');
    expect(() =>
      resolvePackagedAcceptanceConfig(true, {
        ...validEnvironment(fixture),
        PIONEER_ACCEPTANCE_REPORT: join(
          fixture.reportsPath,
          'missing',
          'x.json',
        ),
      }),
    ).toThrow('PIONEER_ACCEPTANCE_REPORT');
  });

  it('keeps the workspace disjoint from the profile and the evidence files', async () => {
    const fixture = await createAcceptanceFixture();

    expect(() =>
      resolvePackagedAcceptanceConfig(true, {
        ...validEnvironment(fixture),
        PIONEER_ACCEPTANCE_WORKSPACE: fixture.container,
        PIONEER_ACCEPTANCE_USER_DATA: fixture.workspacePath,
      }),
    ).toThrow('must be disjoint');
    expect(() =>
      resolvePackagedAcceptanceConfig(true, {
        ...validEnvironment(fixture),
        PIONEER_ACCEPTANCE_WORKSPACE: fixture.workspacePath,
        PIONEER_ACCEPTANCE_USER_DATA: fixture.container,
      }),
    ).toThrow('must be disjoint');
    expect(() =>
      resolvePackagedAcceptanceConfig(true, {
        ...validEnvironment(fixture),
        PIONEER_ACCEPTANCE_REPORT: join(fixture.workspacePath, 'startup.json'),
        PIONEER_ACCEPTANCE_RUN_SCRIPT: join(
          fixture.workspacePath,
          'run-script.json',
        ),
      }),
    ).toThrow('must be outside');
  });

  it('accepts a packaged launch and applies the isolated profile once', async () => {
    const fixture = await createAcceptanceFixture();
    const setPath = vi.fn();

    const config = applyPackagedAcceptanceConfig(
      { isPackaged: true, setPath },
      {
        ...validEnvironment(fixture),
        PIONEER_ACCEPTANCE_WORKSPACE: join(fixture.workspacePath, '.'),
        PIONEER_ACCEPTANCE_USER_DATA: join(fixture.userDataPath, '.'),
      },
    );

    expect(config).toEqual({
      workspacePath: fixture.workspacePath,
      userDataPath: fixture.userDataPath,
      reportPath: fixture.reportPath,
      runScriptPath: fixture.scriptPath,
    });
    expect(setPath).toHaveBeenCalledOnce();
    expect(setPath).toHaveBeenCalledWith('userData', fixture.userDataPath);
  });

  it('rejects a run script inside the workspace', async () => {
    const fixture = await createAcceptanceFixture();

    expect(() =>
      resolvePackagedAcceptanceConfig(true, {
        ...validEnvironment(fixture),
        PIONEER_ACCEPTANCE_RUN_SCRIPT: join(
          fixture.workspacePath,
          'run-script.json',
        ),
      }),
    ).toThrow('must be outside');
  });
});

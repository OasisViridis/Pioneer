import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  isPathInsideOrEqual,
  requireAbsoluteOutputFile,
  requireExistingAbsoluteDirectory,
  type LaunchProfileApp,
} from './launch-paths';

/**
 * Packaged acceptance seam. A production build reads these variables only when
 * the build is packaged AND the caller set the exact `PIONEER_ACCEPTANCE=1`
 * switch, so an accidental or inherited variable can never move a real user's
 * workspace or profile. Everything stays launch-time: no renderer request can
 * reach this configuration and no IPC channel exposes it.
 */
export interface PackagedAcceptanceConfig {
  workspacePath: string;
  userDataPath: string;
  reportPath: string;
  runScriptPath: string;
}

export type PackagedAcceptanceApp = Pick<
  LaunchProfileApp,
  'isPackaged' | 'getPath' | 'setPath'
>;

export type PackagedAcceptanceEnvironment = Readonly<
  Partial<
    Record<
      | 'PIONEER_ACCEPTANCE'
      | 'PIONEER_ACCEPTANCE_WORKSPACE'
      | 'PIONEER_ACCEPTANCE_USER_DATA'
      | 'PIONEER_ACCEPTANCE_REPORT'
      | 'PIONEER_ACCEPTANCE_RUN_SCRIPT',
      string
    >
  >
>;

/** Canonicalises a path even when it does not exist yet. */
const canonicalPath = (value: string): string => {
  try {
    return realpathSync(value);
  } catch {
    return resolve(value);
  }
};

/**
 * The packaged acceptance run must name its script explicitly: the controlled
 * adapter's default script never reads a file, so a default would let a run
 * "complete" without exercising a read-only tool at all.
 */
function requireScriptPath(
  workspacePath: string,
  value: string | undefined,
): string {
  const scriptPath = requireAbsoluteOutputFile(
    'PIONEER_ACCEPTANCE_RUN_SCRIPT',
    value,
  );
  if (isPathInsideOrEqual(workspacePath, scriptPath)) {
    throw new Error(
      'PIONEER_ACCEPTANCE_RUN_SCRIPT must be outside PIONEER_ACCEPTANCE_WORKSPACE',
    );
  }
  return scriptPath;
}

/**
 * Resolves the packaged acceptance seam. A launch without the exact switch
 * returns null, so an unrelated or leftover environment variable cannot change
 * a real launch. Once the switch is actually set the configuration is a
 * contract: a missing, relative, overlapping or otherwise unsafe path throws
 * instead of silently falling back to the real profile.
 */
export function resolvePackagedAcceptanceConfig(
  isPackaged: boolean,
  environment: PackagedAcceptanceEnvironment = process.env,
): PackagedAcceptanceConfig | null {
  if (!isPackaged || environment.PIONEER_ACCEPTANCE !== '1') return null;

  const workspacePath = requireExistingAbsoluteDirectory(
    'PIONEER_ACCEPTANCE_WORKSPACE',
    environment.PIONEER_ACCEPTANCE_WORKSPACE,
  );
  const userDataPath = requireExistingAbsoluteDirectory(
    'PIONEER_ACCEPTANCE_USER_DATA',
    environment.PIONEER_ACCEPTANCE_USER_DATA,
  );
  const reportPath = requireAbsoluteOutputFile(
    'PIONEER_ACCEPTANCE_REPORT',
    environment.PIONEER_ACCEPTANCE_REPORT,
  );

  if (
    isPathInsideOrEqual(workspacePath, userDataPath) ||
    isPathInsideOrEqual(userDataPath, workspacePath)
  ) {
    throw new Error(
      'PIONEER_ACCEPTANCE_WORKSPACE and PIONEER_ACCEPTANCE_USER_DATA must be disjoint',
    );
  }
  if (isPathInsideOrEqual(workspacePath, reportPath)) {
    throw new Error(
      'PIONEER_ACCEPTANCE_REPORT must be outside PIONEER_ACCEPTANCE_WORKSPACE',
    );
  }

  const runScriptPath = requireScriptPath(
    workspacePath,
    environment.PIONEER_ACCEPTANCE_RUN_SCRIPT,
  );
  if (runScriptPath === reportPath) {
    throw new Error(
      'PIONEER_ACCEPTANCE_REPORT and PIONEER_ACCEPTANCE_RUN_SCRIPT must differ',
    );
  }

  return { workspacePath, userDataPath, reportPath, runScriptPath };
}

/**
 * Applies the isolated profile only after the whole acceptance config is valid.
 * A configured profile that is, contains or sits inside the application's own
 * profile directory is refused, so the acceptance run can never reuse real user
 * data, even through a junction or a differently spelled path.
 */
export function applyPackagedAcceptanceConfig(
  app: PackagedAcceptanceApp,
  environment: PackagedAcceptanceEnvironment = process.env,
): PackagedAcceptanceConfig | null {
  const config = resolvePackagedAcceptanceConfig(app.isPackaged, environment);
  if (config === null) return null;

  const applicationProfile = canonicalPath(app.getPath('userData'));
  const userDataPath = canonicalPath(config.userDataPath);
  if (
    isPathInsideOrEqual(applicationProfile, userDataPath) ||
    isPathInsideOrEqual(userDataPath, applicationProfile)
  ) {
    throw new Error(
      'PIONEER_ACCEPTANCE_USER_DATA must not overlap the application profile directory',
    );
  }

  app.setPath('userData', config.userDataPath);
  return config;
}

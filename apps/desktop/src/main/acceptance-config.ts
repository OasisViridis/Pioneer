import {
  canonicalizeExistingPath,
  isPathInsideOrEqual,
  pathsOverlap,
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
  evidencePath: string;
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
      | 'PIONEER_ACCEPTANCE_EVIDENCE'
      | 'PIONEER_ACCEPTANCE_REPORT'
      | 'PIONEER_ACCEPTANCE_RUN_SCRIPT',
      string
    >
  >
>;

/**
 * The packaged acceptance run must name its script explicitly: the controlled
 * adapter's default script never reads a file, so a default would let a run
 * "complete" without exercising a read-only tool at all. The script and the
 * report must both live inside the run's own evidence directory, so an
 * accepted launch can never overwrite a file somewhere else on the machine.
 */
function requireEvidenceFile(
  variableName: 'PIONEER_ACCEPTANCE_REPORT' | 'PIONEER_ACCEPTANCE_RUN_SCRIPT',
  evidencePath: string,
  value: string | undefined,
): string {
  const filePath = requireAbsoluteOutputFile(variableName, value);
  if (!isPathInsideOrEqual(evidencePath, filePath)) {
    throw new Error(
      `${variableName} must be inside PIONEER_ACCEPTANCE_EVIDENCE`,
    );
  }
  return filePath;
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
  const evidencePath = requireExistingAbsoluteDirectory(
    'PIONEER_ACCEPTANCE_EVIDENCE',
    environment.PIONEER_ACCEPTANCE_EVIDENCE,
  );

  if (pathsOverlap(workspacePath, userDataPath)) {
    throw new Error(
      'PIONEER_ACCEPTANCE_WORKSPACE and PIONEER_ACCEPTANCE_USER_DATA must be disjoint',
    );
  }
  if (pathsOverlap(workspacePath, evidencePath)) {
    throw new Error(
      'PIONEER_ACCEPTANCE_EVIDENCE must be disjoint from PIONEER_ACCEPTANCE_WORKSPACE',
    );
  }

  const reportPath = requireEvidenceFile(
    'PIONEER_ACCEPTANCE_REPORT',
    evidencePath,
    environment.PIONEER_ACCEPTANCE_REPORT,
  );
  const runScriptPath = requireEvidenceFile(
    'PIONEER_ACCEPTANCE_RUN_SCRIPT',
    evidencePath,
    environment.PIONEER_ACCEPTANCE_RUN_SCRIPT,
  );
  if (
    isPathInsideOrEqual(reportPath, runScriptPath) &&
    isPathInsideOrEqual(runScriptPath, reportPath)
  ) {
    throw new Error(
      'PIONEER_ACCEPTANCE_REPORT and PIONEER_ACCEPTANCE_RUN_SCRIPT must differ',
    );
  }

  return {
    workspacePath,
    userDataPath,
    evidencePath,
    reportPath,
    runScriptPath,
  };
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

  const applicationProfile = canonicalizeExistingPath(app.getPath('userData'));
  const userDataPath = canonicalizeExistingPath(config.userDataPath);
  if (pathsOverlap(applicationProfile, userDataPath)) {
    throw new Error(
      'PIONEER_ACCEPTANCE_USER_DATA must not overlap the application profile directory',
    );
  }

  app.setPath('userData', config.userDataPath);
  return config;
}

import {
  containsPath,
  requireAbsoluteOutputFile,
  requireExistingAbsoluteDirectory,
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

export interface PackagedAcceptanceApp {
  readonly isPackaged: boolean;
  setPath(name: 'userData', path: string): void;
}

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
  if (containsPath(workspacePath, scriptPath)) {
    throw new Error(
      'PIONEER_ACCEPTANCE_RUN_SCRIPT must be outside PIONEER_ACCEPTANCE_WORKSPACE',
    );
  }
  return scriptPath;
}

/**
 * Resolves the packaged acceptance seam. Anything less than the exact switch
 * plus a fully valid configuration returns null rather than throwing, so an
 * unrelated environment variable cannot stop a real launch.
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
    containsPath(workspacePath, userDataPath) ||
    containsPath(userDataPath, workspacePath)
  ) {
    throw new Error(
      'PIONEER_ACCEPTANCE_WORKSPACE and PIONEER_ACCEPTANCE_USER_DATA must be disjoint',
    );
  }
  if (containsPath(workspacePath, reportPath)) {
    throw new Error(
      'PIONEER_ACCEPTANCE_REPORT must be outside PIONEER_ACCEPTANCE_WORKSPACE',
    );
  }

  return {
    workspacePath,
    userDataPath,
    reportPath,
    runScriptPath: requireScriptPath(
      workspacePath,
      environment.PIONEER_ACCEPTANCE_RUN_SCRIPT,
    ),
  };
}

/** Applies the isolated profile only after the whole acceptance config is valid. */
export function applyPackagedAcceptanceConfig(
  app: PackagedAcceptanceApp,
  environment: PackagedAcceptanceEnvironment = process.env,
): PackagedAcceptanceConfig | null {
  const config = resolvePackagedAcceptanceConfig(app.isPackaged, environment);
  if (config !== null) app.setPath('userData', config.userDataPath);
  return config;
}

import {
  pathsOverlap,
  requireExistingAbsoluteDirectory,
  type LaunchProfileApp,
} from './launch-paths';

export interface LaunchRuntimeConfig {
  rootPath: string;
  userDataPath: string;
}

export type LaunchRuntimeApp = Pick<LaunchProfileApp, 'isPackaged' | 'setPath'>;

export type LaunchRuntimeEnvironment = Readonly<
  Partial<
    Record<'PIONEER_E2E' | 'PIONEER_E2E_ROOT' | 'PIONEER_E2E_USER_DATA', string>
  >
>;

/**
 * Resolves the opt-in launch seam. Environment values are intentionally not
 * parsed unless the exact development-only guard is active.
 */
export function resolveLaunchRuntimeConfig(
  isPackaged: boolean,
  environment: LaunchRuntimeEnvironment = process.env,
): LaunchRuntimeConfig | null {
  if (isPackaged || environment.PIONEER_E2E !== '1') return null;

  const rootPath = requireExistingAbsoluteDirectory(
    'PIONEER_E2E_ROOT',
    environment.PIONEER_E2E_ROOT,
  );
  const userDataPath = requireExistingAbsoluteDirectory(
    'PIONEER_E2E_USER_DATA',
    environment.PIONEER_E2E_USER_DATA,
  );

  if (pathsOverlap(rootPath, userDataPath)) {
    throw new Error(
      'PIONEER_E2E_ROOT and PIONEER_E2E_USER_DATA must be disjoint',
    );
  }

  return { rootPath, userDataPath };
}

/** Applies the isolated Chromium state path only after the entire config is valid. */
export function applyLaunchRuntimeConfig(
  app: LaunchRuntimeApp,
  environment: LaunchRuntimeEnvironment = process.env,
): LaunchRuntimeConfig | null {
  const config = resolveLaunchRuntimeConfig(app.isPackaged, environment);
  if (config !== null) app.setPath('userData', config.userDataPath);
  return config;
}

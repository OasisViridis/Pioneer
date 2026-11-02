import { lstatSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';

/** Launch variables whose values must be validated before the app reads them. */
export type LaunchPathVariable =
  | 'PIONEER_E2E_ROOT'
  | 'PIONEER_E2E_USER_DATA'
  | 'PIONEER_ACCEPTANCE_WORKSPACE'
  | 'PIONEER_ACCEPTANCE_USER_DATA'
  | 'PIONEER_ACCEPTANCE_REPORT'
  | 'PIONEER_ACCEPTANCE_RUN_SCRIPT';

/** The subset of Electron's `app` both launch seams need. */
export interface LaunchProfileApp {
  readonly isPackaged: boolean;
  getPath(name: 'userData'): string;
  setPath(name: 'userData', path: string): void;
}

/**
 * Launch-time path validation shared by the development E2E seam and the
 * packaged acceptance seam. Both fail closed: a value is only accepted when it
 * names an existing absolute location, and the canonical path is what callers
 * receive.
 */
export function requireExistingAbsoluteDirectory(
  variableName: LaunchPathVariable,
  value: string | undefined,
): string {
  if (value === undefined || value.length === 0 || !isAbsolute(value)) {
    throw new Error(`${variableName} must be an existing absolute directory`);
  }

  try {
    const canonicalPath = realpathSync(value);
    if (!statSync(canonicalPath).isDirectory()) {
      throw new Error('not a directory');
    }
    return canonicalPath;
  } catch (error) {
    throw new Error(`${variableName} must be an existing absolute directory`, {
      cause: error,
    });
  }
}

/**
 * Resolves an output file path. The parent directory must already exist. When
 * the file itself already exists its real path is returned too, so a symbolic
 * link at the leaf cannot redirect the write somewhere the caller did not
 * validate (for example back into the workspace fixture).
 */
export function requireAbsoluteOutputFile(
  variableName: LaunchPathVariable,
  value: string | undefined,
): string {
  if (value === undefined || value.length === 0 || !isAbsolute(value)) {
    throw new Error(
      `${variableName} must be an absolute file path inside an existing directory`,
    );
  }

  try {
    const canonicalParent = realpathSync(dirname(value));
    if (!statSync(canonicalParent).isDirectory()) {
      throw new Error('not a directory');
    }
    const candidate = join(canonicalParent, basename(value));

    let leafExists = false;
    try {
      lstatSync(candidate);
      leafExists = true;
    } catch {
      leafExists = false;
    }
    if (!leafExists) return candidate;

    const resolved = realpathSync(candidate);
    if (!statSync(resolved).isFile()) {
      throw new Error('an existing output path must be a regular file');
    }
    return resolved;
  } catch (error) {
    throw new Error(
      `${variableName} must be an absolute file path inside an existing directory`,
      { cause: error },
    );
  }
}

export function containsPath(
  parentPath: string,
  candidatePath: string,
): boolean {
  const relativePath = relative(parentPath, candidatePath);
  return (
    relativePath === '' ||
    (!relativePath.startsWith(`..${sep}`) &&
      relativePath !== '..' &&
      !isAbsolute(relativePath))
  );
}

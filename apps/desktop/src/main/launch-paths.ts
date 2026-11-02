import { lstatSync, realpathSync, statSync } from 'node:fs';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';

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
 * Resolves an output file path. The parent directory must already exist.
 *
 * An existing leaf is only accepted when it is a regular file: a symbolic link
 * is refused outright, so a link can neither redirect the write to another file
 * nor be replaced through the link itself. A new path is returned inside the
 * canonical parent.
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

  let canonicalParent: string;
  try {
    canonicalParent = realpathSync(dirname(value));
    if (!statSync(canonicalParent).isDirectory()) {
      throw new Error('the parent path must be a directory');
    }
  } catch (error) {
    throw new Error(`${variableName} must be inside an existing directory`, {
      cause: error,
    });
  }

  const candidate = join(canonicalParent, basename(value));
  let leafInformation: ReturnType<typeof lstatSync> | null = null;
  try {
    leafInformation = lstatSync(candidate);
  } catch {
    leafInformation = null;
  }
  if (leafInformation === null) return candidate;
  if (leafInformation.isSymbolicLink()) {
    throw new Error(
      `${variableName} must not be an existing symbolic link; pass a new or regular path`,
    );
  }
  if (!leafInformation.isFile()) {
    throw new Error(`${variableName} must be a regular file or a new path`);
  }
  return candidate;
}

/**
 * Canonicalises a path that may not exist yet: the nearest existing ancestor is
 * resolved through `realpath`, and the missing tail is appended unchanged. This
 * keeps a junction or an alias in a parent directory from hiding an overlap.
 */
export function canonicalizeExistingPath(value: string): string {
  let current = resolve(value);
  const missing: string[] = [];
  for (;;) {
    try {
      const resolvedAncestor = realpathSync(current);
      return join(resolvedAncestor, ...missing);
    } catch {
      const parent = dirname(current);
      if (parent === current) return resolve(value);
      missing.unshift(basename(current));
      current = parent;
    }
  }
}

/** True when either path is inside or equal to the other. */
export function pathsOverlap(firstPath: string, secondPath: string): boolean {
  return (
    isPathInsideOrEqual(firstPath, secondPath) ||
    isPathInsideOrEqual(secondPath, firstPath)
  );
}

/**
 * True when `candidatePath` is `parentPath` itself or sits below it, after
 * normalising separators. Kept free of filesystem access on purpose: callers
 * pass canonical paths.
 */
export function isPathInsideOrEqual(
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

import { realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';

/**
 * Launch-time path validation shared by the development E2E seam and the
 * packaged acceptance seam. Both fail closed: a value is only accepted when it
 * names an existing absolute location, and the canonical path is what callers
 * receive.
 */
export function requireExistingAbsoluteDirectory(
  variableName: string,
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
  } catch {
    throw new Error(`${variableName} must be an existing absolute directory`);
  }
}

/**
 * Resolves an output file path. The file itself may not exist yet, but its
 * parent directory must already be a real absolute directory.
 */
export function requireAbsoluteOutputFile(
  variableName: string,
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
    return join(canonicalParent, basename(value));
  } catch {
    throw new Error(
      `${variableName} must be an absolute file path inside an existing directory`,
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

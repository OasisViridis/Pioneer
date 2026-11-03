import { lstat, realpath } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { isPathInsideRoot } from '../../catalog/path-policy';

import {
  WRITE_LIMITS,
  WRITE_PROTECTED_PATHS,
  type WriteFileIdentity,
  type WriteFileState,
  type WritePermission,
  type WriteTarget,
  type WriteTargetState,
} from '../../../shared/contracts/write-permission';
import type { ReadOnlyToolRejection } from '../../../shared/contracts/read-only-tools';
import { matchesProtectedPath } from '../../../shared/path-safety';
import { BoundedReadError, readStableFile } from '../bounded-read';
import { checkReadOnlyToolRequest } from '../read-only-tool-policy';
import { sameFileIdentity, sha256OfBytes } from './file-state';

/**
 * Read-only target observation for the P4-D1 decision spec (#18).
 *
 * Main re-observes a target immediately before a permission-controlled write
 * and compares the observed bytes and file identity with the pre-image the run
 * read. This module only reads: it opens a read-only handle through the shared
 * bounded read and never writes, truncates, renames or restores anything.
 */

export interface TargetObservation {
  path: string;
  state: WriteTargetState;
  /** Present only when the target could be read in full. */
  observed: WriteFileState | null;
  /** Platform-reported file identity, or null when the platform has none. */
  identity: WriteFileIdentity | null;
}

export interface ObserveTargetOptions {
  /** Test seam: runs between the read and the closing stability check. */
  afterRead?: () => Promise<void>;
  /**
   * Protected paths the current grant allows through the sensitive-name filter.
   * Only `full_access` passes a non-empty list; every other mode leaves it out,
   * so `.git` stays refused exactly as the spec says.
   */
  allowProtectedPaths?: readonly string[];
}

/**
 * Re-checks a protected-path target before reading it: no component of the
 * path may be a link, and the resolved path must stay inside the resolved
 * project root. Returns the observation state to report, or null when the read
 * may go ahead. `full_access` widens which names are readable, never where a
 * path may point.
 */
async function resolveProtectedTarget(
  projectRoot: string,
  candidate: string,
  components: readonly string[],
): Promise<WriteTargetState | null> {
  let stats;
  try {
    stats = await lstat(candidate);
  } catch {
    return 'missing';
  }
  if (stats.isSymbolicLink()) return 'link_not_allowed';
  if (!stats.isFile()) return 'not_regular_file';
  // Same rule the read-only policy applies to a leaf: a hard-linked file has
  // more than one name, so writing through it may edit a path nobody reviewed.
  if (stats.nlink !== 1) return 'link_not_allowed';
  try {
    // Same walk the read-only policy does: no intermediate component may be a
    // link, and each component's canonical path must be itself and stay inside
    // the project root. A junction that resolves elsewhere fails both.
    let current = projectRoot;
    for (const component of components.slice(0, -1)) {
      current = join(current, component);
      if ((await lstat(current)).isSymbolicLink()) return 'link_not_allowed';
      const canonical = await realpath(current);
      if (!isPathInsideRoot(projectRoot, canonical)) return 'link_not_allowed';
      if (relative(current, canonical) !== '') return 'link_not_allowed';
    }
    const [resolvedRoot, resolved] = await Promise.all([
      realpath(projectRoot),
      realpath(candidate),
    ]);
    if (!isPathInsideRoot(resolvedRoot, resolved)) return 'link_not_allowed';
  } catch {
    return 'unreadable';
  }
  return null;
}

function stateForRejection(
  code: ReadOnlyToolRejection['error']['code'],
): WriteTargetState {
  switch (code) {
    case 'LINK_NOT_ALLOWED':
      return 'link_not_allowed';
    case 'PATH_TYPE_NOT_ALLOWED':
      return 'not_regular_file';
    case 'PATH_UNAVAILABLE':
      return 'missing';
    default:
      // Sensitive names, unavailable projects and malformed requests are all
      // "this read cannot prove anything about the target".
      return 'unreadable';
  }
}

function stateForReadFailure(code: BoundedReadError['code']): WriteTargetState {
  switch (code) {
    case 'NOT_REGULAR_FILE':
      return 'not_regular_file';
    case 'LINK_NOT_ALLOWED':
      return 'link_not_allowed';
    case 'TOO_LARGE':
      return 'too_large';
    case 'UNSTABLE':
      return 'unstable';
  }
}

/**
 * `ino` is 0 on filesystems that do not report a file index; a birth time of 0
 * is likewise indistinguishable from "unknown". Either makes the identity
 * unusable, so the observation reports null instead of a guessed value.
 */
function identityOf(stats: {
  ino: number;
  birthtimeMs: number;
}): WriteFileIdentity | null {
  if (stats.ino === 0 || stats.birthtimeMs === 0) return null;
  return { fileId: String(stats.ino), birthtimeMs: stats.birthtimeMs };
}

/** Observes one target; every failure is a named state, never silent. */
export async function observeWriteTarget(
  projectRoot: string,
  target: WriteTarget,
  options: ObserveTargetOptions = {},
): Promise<TargetObservation> {
  const allowProtectedPaths = options.allowProtectedPaths ?? [];
  const preflight = await checkReadOnlyToolRequest(projectRoot, {
    tool: 'read_file',
    arguments: { path: target.path },
  });
  let absolutePath: string;
  if (preflight.ok) {
    absolutePath = preflight.value.absolutePath;
  } else if (
    preflight.error.code === 'SENSITIVE_PATH' &&
    matchesProtectedPath(target.path, allowProtectedPaths)
  ) {
    // `full_access` may write protected paths, so observation has to read them
    // too. The bypass is limited to the caller's protected list, and the target
    // is re-checked here: no link at the literal path, and the resolved path
    // must stay inside the resolved project root.
    const candidate = join(projectRoot, ...target.path.split('/'));
    const escape = await resolveProtectedTarget(
      projectRoot,
      candidate,
      target.path.split('/'),
    );
    if (escape !== null) {
      return {
        path: target.path,
        state: escape,
        observed: null,
        identity: null,
      };
    }
    absolutePath = candidate;
  } else {
    return {
      path: target.path,
      state: stateForRejection(preflight.error.code),
      observed: null,
      identity: null,
    };
  }

  let read;
  try {
    read = await readStableFile(
      absolutePath,
      WRITE_LIMITS.targetBytes,
      options.afterRead === undefined ? {} : { afterRead: options.afterRead },
    );
  } catch (error) {
    return {
      path: target.path,
      state:
        error instanceof BoundedReadError
          ? stateForReadFailure(error.code)
          : 'unreadable',
      observed: null,
      identity: null,
    };
  }

  const observed: WriteFileState = {
    kind: 'file',
    bytes: read.bytesRead,
    sha256: sha256OfBytes(read.buffer.subarray(0, read.bytesRead)),
  };
  const identity = identityOf(read.before);
  // Content is the primary signal: a different byte stream is `changed` even
  // when the file object also changed. Only identical content with a different
  // file object is `replaced`.
  const unchanged =
    observed.bytes === target.before.bytes &&
    observed.sha256 === target.before.sha256;
  if (!unchanged) {
    return { path: target.path, state: 'changed', observed, identity };
  }
  if (target.identity !== null) {
    // The run recorded an identity but this read could not: neither "same
    // file" nor "replaced" is proven, so refuse instead of guessing.
    if (identity === null) {
      return {
        path: target.path,
        state: 'identity_unavailable',
        observed,
        identity,
      };
    }
    if (!sameFileIdentity(target.identity, identity)) {
      return { path: target.path, state: 'replaced', observed, identity };
    }
  }
  return { path: target.path, state: 'unchanged', observed, identity };
}

/**
 * Protected paths observation may read through the sensitive-name filter.
 * Only `full_access` opens them: the other modes must see `.git` as
 * unreadable, which is what makes their refusal honest instead of a
 * permission check against a target nobody was allowed to inspect.
 */
export function observationAllowance(
  permission: WritePermission,
): readonly string[] {
  if (permission.mode !== 'full_access') return [];
  return [...WRITE_PROTECTED_PATHS, ...permission.protectedPaths];
}

/**
 * Observes a batch under a granted permission. Callers use this instead of
 * passing `allowProtectedPaths` by hand, so the workspace modes cannot
 * accidentally observe a protected path.
 */
export function observeTargetsForPermission(
  projectRoot: string,
  targets: readonly WriteTarget[],
  permission: WritePermission,
  options: Omit<ObserveTargetOptions, 'allowProtectedPaths'> = {},
): Promise<TargetObservation[]> {
  return observeWriteTargets(projectRoot, targets, {
    ...options,
    allowProtectedPaths: observationAllowance(permission),
  });
}

/** Observes the whole target batch in batch order. */
export async function observeWriteTargets(
  projectRoot: string,
  targets: readonly WriteTarget[],
  options: ObserveTargetOptions = {},
): Promise<TargetObservation[]> {
  const observations: TargetObservation[] = [];
  for (const target of targets) {
    observations.push(await observeWriteTarget(projectRoot, target, options));
  }
  return observations;
}

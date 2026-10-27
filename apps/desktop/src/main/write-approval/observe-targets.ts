import { createHash } from 'node:crypto';

import {
  WRITE_APPROVAL_LIMITS,
  type WriteFileIdentity,
  type WriteFileState,
  type WriteTarget,
  type WriteTargetState,
} from '../../shared/contracts/write-approval';
import { BoundedReadError, readStableFile } from '../harness/bounded-read';
import { checkReadOnlyToolRequest } from '../harness/read-only-tool-policy';

/**
 * Read-only target observation for the P4-D1 decision spec (#18).
 *
 * Main re-observes a target immediately before a future write and compares the
 * observed bytes and file identity with the pre-image the user reviewed. This
 * module only reads: it opens a read-only handle through the shared bounded
 * read and never writes, truncates, renames or restores anything.
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
}

function stateForRejection(code: string): WriteTargetState {
  switch (code) {
    case 'LINK_NOT_ALLOWED':
      return 'link_not_allowed';
    case 'PATH_TYPE_NOT_ALLOWED':
      return 'not_regular_file';
    case 'PATH_UNAVAILABLE':
      return 'missing';
    default:
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

function digest(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
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

function sameIdentity(a: WriteFileIdentity, b: WriteFileIdentity): boolean {
  return a.fileId === b.fileId && a.birthtimeMs === b.birthtimeMs;
}

/** Observes one approved target; every failure is a named state, never silent. */
export async function observeWriteTarget(
  projectRoot: string,
  target: WriteTarget,
  options: ObserveTargetOptions = {},
): Promise<TargetObservation> {
  const preflight = await checkReadOnlyToolRequest(projectRoot, {
    tool: 'read_file',
    arguments: { path: target.path },
  });
  if (!preflight.ok) {
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
      preflight.value.absolutePath,
      WRITE_APPROVAL_LIMITS.targetBytes,
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
    sha256: digest(read.buffer.subarray(0, read.bytesRead)),
  };
  const identity = identityOf(read.before);
  if (
    target.identity !== null &&
    identity !== null &&
    !sameIdentity(target.identity, identity)
  ) {
    return { path: target.path, state: 'replaced', observed, identity };
  }
  const unchanged =
    observed.bytes === target.before.bytes &&
    observed.sha256 === target.before.sha256;
  return {
    path: target.path,
    state: unchanged ? 'unchanged' : 'changed',
    observed,
    identity,
  };
}

/** Observes the whole approved target set in approval order. */
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

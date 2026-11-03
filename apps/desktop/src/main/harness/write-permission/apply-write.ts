import { randomBytes } from 'node:crypto';
import { chmod, lstat, open, realpath, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  WRITE_LIMITS,
  WriteTargetsSchema,
  type WriteChangeFailureCode,
  type WriteChangeJournalRecord,
  type WriteFileIdentity,
  type WriteFileState,
  type WritePermissionDenialCode,
  type WriteRejectionCode,
  type WriteStaleTarget,
  type WriteTarget,
  type WriteTargetOutcome,
  type WritePermission,
} from '../../../shared/contracts/write-permission';
import type { WriteAppliedTarget } from '../../../shared/contracts/write-preview';
import { readStableFile } from '../bounded-read';
import {
  authorizeWrite,
  permissionDeniedOutcomes,
  rejectedOutcomes,
} from './decision';
import { sameFileIdentity, sha256OfBytes, sameFileState } from './file-state';
import {
  observeTargetsForPermission,
  platformFileIdentity,
} from './observe-targets';
import { WriteChangeJournal } from './write-journal';

/**
 * P4-A (#19) write executor.
 *
 * Admission is all-or-nothing: permission and every target's bytes/identity
 * are checked again immediately before anything is written. Each target is then
 * replaced through a same-directory temporary file, synced, re-checked and
 * atomically renamed, so a crash never leaves a truncated target. A failed or
 * unverified target stops the batch; already written targets are reported, not
 * rolled back. Recovery belongs to #20.
 */

export interface ApplyBatchReport {
  outcomes: WriteTargetOutcome[];
  applied: WriteAppliedTarget[];
  /** Some targets were written before the failure. */
  partial: boolean;
  failure: {
    path: string;
    /** Shared #18 change-failure vocabulary; only WRITE_FAILED/VERIFY_FAILED
     * are produced by this single-target slice. */
    code: WriteChangeFailureCode;
  } | null;
}

export type ApplyBatchResult =
  | { status: 'applied'; report: ApplyBatchReport }
  | {
      status: 'denied';
      stage: 'permission' | 'targets';
      code: WritePermissionDenialCode | WriteRejectionCode;
      targets?: readonly WriteStaleTarget[];
      report: ApplyBatchReport;
    }
  | { status: 'journal-unavailable'; report: ApplyBatchReport }
  | {
      status: 'failed';
      code: 'WRITE_FAILED' | 'VERIFY_FAILED';
      report: ApplyBatchReport;
    };

export interface ApplyWriteHooks {
  /** Test seam: runs after the stale check and before the atomic rename. */
  beforeReplace?: (absolutePath: string) => Promise<void>;
  /** Test seam: replaces the temp-file write so a failing write can be probed. */
  writeTempFile?: (tempPath: string, bytes: Buffer) => Promise<void>;
}

export interface ApplyWriteInput {
  projectRoot: string;
  runId: string;
  revision: number;
  targets: readonly WriteTarget[];
  contents: ReadonlyMap<string, Buffer>;
  permission: WritePermission;
  journal: WriteChangeJournal;
  now?: () => string;
  hooks?: ApplyWriteHooks;
}

function emptyReport(): ApplyBatchReport {
  return { outcomes: [], applied: [], partial: false, failure: null };
}

async function writeTempFileDefault(
  tempPath: string,
  bytes: Buffer,
): Promise<void> {
  const handle = await open(tempPath, 'wx', 0o600);
  try {
    await handle.writeFile(bytes);
    // The bytes must be durable before the rename replaces the reviewed file.
    await handle.sync();
  } finally {
    await handle.close();
  }
}

interface ReplaceOutcome {
  ok: boolean;
  /** Set when the target itself refused the replacement (raced change). */
  code?: WriteRejectionCode | 'WRITE_FAILED';
}

/** Windows paths differ by case; a canonical check must not reject them. */
function sameCanonicalPath(left: string, right: string): boolean {
  return process.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

/**
 * Replaces one existing regular file through a same-directory temp file. The
 * target is untouched until `rename`; the parent directory, the reviewed bytes
 * and the file identity are all re-checked after the temp file exists, which is
 * the narrow residual race window described in the P4-D1 spec (§3.4).
 */
async function replaceFileAtomically(
  projectRoot: string,
  target: WriteTarget,
  bytes: Buffer,
  hooks: ApplyWriteHooks,
): Promise<ReplaceOutcome> {
  const absolutePath = join(projectRoot, ...target.path.split('/'));
  const directory = dirname(absolutePath);
  const tempPath = join(
    directory,
    `.pioneer-write-${randomBytes(8).toString('hex')}.tmp`,
  );
  let renamed = false;
  try {
    const original = await lstat(absolutePath);
    if (original.isSymbolicLink() || !original.isFile())
      return { ok: false, code: 'TARGET_NOT_REGULAR_FILE' };

    // A parent junction/symlink could route the temp file outside the project
    // even though admission saw the original directory; re-check it here.
    const canonicalDirectory = await realpath(directory).catch(() => null);
    if (
      canonicalDirectory === null ||
      !sameCanonicalPath(canonicalDirectory, directory)
    ) {
      return { ok: false, code: 'TARGET_UNREADABLE' };
    }

    await (hooks.writeTempFile ?? writeTempFileDefault)(tempPath, bytes);
    await chmod(tempPath, original.mode & 0o7777);

    await hooks.beforeReplace?.(absolutePath);

    // The user may have edited the file in place while the temp file was being
    // written. Identity alone would miss that, so compare the reviewed bytes.
    let currentRead;
    try {
      currentRead = await readStableFile(
        absolutePath,
        WRITE_LIMITS.targetBytes,
      );
    } catch {
      return { ok: false, code: 'TARGET_CHANGED' };
    }
    const currentBytes = currentRead.buffer.subarray(0, currentRead.bytesRead);
    if (
      currentRead.bytesRead !== target.before.bytes ||
      sha256OfBytes(currentBytes) !== target.before.sha256
    ) {
      return { ok: false, code: 'TARGET_CHANGED' };
    }
    if (!currentRead.after.isFile() || currentRead.after.isSymbolicLink()) {
      return { ok: false, code: 'TARGET_NOT_REGULAR_FILE' };
    }
    if (target.identity !== null) {
      const identity = platformFileIdentity(currentRead.after);
      if (identity === null)
        return { ok: false, code: 'TARGET_IDENTITY_UNAVAILABLE' };
      // The user may have replaced the file after admission; do not rename
      // over a different file object than the one the bytes were checked on.
      if (!sameFileIdentity(target.identity, identity))
        return { ok: false, code: 'TARGET_REPLACED' };
    }
    await rename(tempPath, absolutePath);
    renamed = true;
    return { ok: true };
  } catch {
    return { ok: false, code: 'WRITE_FAILED' };
  } finally {
    if (!renamed) await rm(tempPath, { force: true }).catch(() => undefined);
  }
}

/** Reads the target back after the rename; null when its state is unprovable. */
async function readBackTarget(absolutePath: string): Promise<{
  state: WriteFileState;
  identity: WriteFileIdentity | null;
} | null> {
  try {
    const read = await readStableFile(absolutePath, WRITE_LIMITS.targetBytes);
    return {
      state: {
        kind: 'file',
        bytes: read.bytesRead,
        sha256: sha256OfBytes(read.buffer.subarray(0, read.bytesRead)),
      },
      identity: platformFileIdentity(read.after),
    };
  } catch {
    // A plain read would bypass the stability proof; the caller must see an
    // unprovable result instead of a weaker "verified" one.
    return null;
  }
}

/**
 * Applies a reviewed batch. Every refusal before the first write returns an
 * all-or-nothing report; a failure after a write returns the targets that did
 * land and stops, so the caller never presents a partial batch as complete.
 */
export async function applyWriteBatch(
  input: ApplyWriteInput,
): Promise<ApplyBatchResult> {
  const targets = WriteTargetsSchema.parse(input.targets);
  for (const target of targets) {
    if (!input.contents.has(target.path)) {
      throw new Error('internal: every target needs its proposed bytes');
    }
  }
  const observations = await observeTargetsForPermission(
    input.projectRoot,
    targets,
    input.permission,
  );
  const admission = authorizeWrite(targets, input.permission, observations);
  if (!admission.ok) {
    if (admission.stage === 'permission') {
      return {
        status: 'denied',
        stage: 'permission',
        code: admission.code,
        report: {
          ...emptyReport(),
          outcomes: permissionDeniedOutcomes(targets),
        },
      };
    }
    const verdict = {
      ok: false as const,
      error: {
        code: admission.code,
        message: '',
        retryable: false as const,
        targets: [...admission.targets],
      },
    };
    return {
      status: 'denied',
      stage: 'targets',
      code: admission.code,
      targets: admission.targets,
      report: {
        ...emptyReport(),
        outcomes: rejectedOutcomes(targets, verdict),
      },
    };
  }

  const at = (): string => input.now?.() ?? new Date().toISOString();
  const report = emptyReport();
  const journal = input.journal;

  /** Stops here, marks untouched targets and reports the failure as partial. */
  const finishFailure = (
    index: number,
    failure: NonNullable<ApplyBatchReport['failure']>,
  ): ApplyBatchResult => {
    report.failure = failure;
    for (const rest of targets.slice(index + 1)) {
      report.outcomes.push({
        path: rest.path,
        status: 'unchanged',
        code: null,
      });
    }
    report.partial = report.partial || report.applied.length > 0;
    return {
      status: 'failed',
      code: failure.code === 'VERIFY_FAILED' ? 'VERIFY_FAILED' : 'WRITE_FAILED',
      report,
    };
  };

  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    if (target === undefined) continue;
    const content = input.contents.get(target.path);
    if (content === undefined) continue;

    const intent: WriteChangeJournalRecord = {
      kind: 'intent',
      runId: input.runId,
      revision: input.revision,
      path: target.path,
      beforeSha256: target.before.sha256,
      at: at(),
    };
    if (!(await journal.append(intent))) {
      // Nothing was written for this target (and maybe none at all). Report the
      // remaining targets as untouched instead of guessing.
      for (const rest of targets.slice(index)) {
        report.outcomes.push({
          path: rest.path,
          status: 'unchanged',
          code: null,
        });
      }
      report.partial = report.applied.length > 0;
      return { status: 'journal-unavailable', report };
    }

    const replaced = await replaceFileAtomically(
      input.projectRoot,
      target,
      content,
      input.hooks ?? {},
    );
    if (!replaced.ok) {
      // The target is untouched: the temp file is removed and the rename never
      // ran. The journal records the failed attempt, not a phantom write.
      await journal.append({
        kind: 'failed',
        runId: input.runId,
        revision: input.revision,
        path: target.path,
        code: 'WRITE_FAILED',
        at: at(),
      });
      report.outcomes.push({
        path: target.path,
        status: 'failed',
        code: replaced.code ?? 'WRITE_FAILED',
      });
      return finishFailure(index, {
        path: target.path,
        code: 'WRITE_FAILED',
      });
    }

    const absolutePath = join(input.projectRoot, ...target.path.split('/'));
    const observed = await readBackTarget(absolutePath);
    if (observed === null) {
      // The rename happened but no stable read can prove the result. Record an
      // unverified `applied` record: recovery sees a real write and treats the
      // unknown state as a conflict instead of "nothing was written".
      await journal.append({
        kind: 'applied',
        runId: input.runId,
        revision: input.revision,
        path: target.path,
        afterSha256: target.after.sha256,
        observedSha256: null,
        observedIdentity: null,
        verification: 'unverified',
        at: at(),
      });
      report.outcomes.push({
        path: target.path,
        status: 'verification_failed',
        code: 'VERIFY_FAILED',
      });
      // A mutation may have landed; do not report the batch as untouched.
      report.partial = true;
      return finishFailure(index, {
        path: target.path,
        code: 'VERIFY_FAILED',
      });
    }

    const verified = sameFileState(observed.state, target.after);
    const recorded = await journal.append({
      kind: 'applied',
      runId: input.runId,
      revision: input.revision,
      path: target.path,
      afterSha256: target.after.sha256,
      observedSha256: observed.state.sha256,
      observedIdentity: observed.identity,
      verification: verified ? 'verified' : 'unverified',
      at: at(),
    });
    if (!recorded || !verified) {
      // The bytes are on disk and were read back, but the durable proof or the
      // hash comparison failed. Never report that target as a success.
      report.applied.push({
        path: target.path,
        afterSha256: target.after.sha256,
        observedSha256: observed.state.sha256,
        verification: 'unverified',
      });
      report.outcomes.push({
        path: target.path,
        status: 'verification_failed',
        code: 'VERIFY_FAILED',
      });
      return finishFailure(index, {
        path: target.path,
        code: 'VERIFY_FAILED',
      });
    }

    report.applied.push({
      path: target.path,
      afterSha256: target.after.sha256,
      observedSha256: observed.state.sha256,
      verification: 'verified',
    });
    report.outcomes.push({ path: target.path, status: 'applied', code: null });
  }
  return { status: 'applied', report };
}

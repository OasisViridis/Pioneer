import { createHash } from 'node:crypto';

import {
  WRITE_PROTECTED_PATHS,
  WriteApprovalRejectionSchema,
  WriteApprovalSchema,
  type WriteApproval,
  type WriteApprovalRejection,
  type WriteApprovalRejectionCode,
  type WriteChangeJournalRecord,
  type WriteFileState,
  type WriteRevocationReason,
  type WriteSandboxPolicy,
  type WriteScopeDenialCode,
  type WriteStaleTarget,
  type WriteTarget,
  type WriteTargetOutcome,
} from '../../../shared/contracts/write-approval';
import { sameFileIdentity, sameFileState, sha256OfBytes } from './file-state';
import type { TargetObservation } from './observe-targets';

/**
 * Pure write-approval decisions for the P4-D1 decision spec (#18).
 *
 * These functions decide only: whether a reviewed approval may be applied to
 * the observed project state, what the per-path outcome is, and what a later
 * recovery may touch. They never write, delete, rename or restore a file.
 */

const messages = {
  APPROVAL_REQUIRED:
    'The reviewed write approval, or its retained content, is not available.',
  APPROVAL_CONSUMED: 'This approval was already used. Review the Diff again.',
  APPROVAL_REVOKED: 'This approval was revoked. Review the Diff again.',
  APPROVAL_EXPIRED: 'This approval expired. Review the Diff again.',
  APPROVAL_BINDING_MISMATCH:
    'This approval belongs to a different run, revision or window.',
  APPROVAL_DIGEST_MISMATCH:
    'The confirmed Diff is not the one that was reviewed.',
  APPROVAL_TARGET_MISMATCH:
    'The observed targets do not match the approved targets.',
  APPROVAL_STALE_TARGET:
    'A reviewed target changed, replaced, moved or disappeared. Review it again.',
} as const;

function reject(
  code: WriteApprovalRejectionCode,
  targets: WriteStaleTarget[] = [],
): WriteApprovalRejection {
  return WriteApprovalRejectionSchema.parse({
    ok: false,
    error: {
      code,
      message: messages[code],
      retryable: false,
      targets,
    },
  });
}

/** Everything main knows about the caller and the moment of application. */
export interface WriteApprovalContext {
  now: number;
  /** Digest of the Diff the user actually confirmed in the review surface. */
  confirmedDiffDigest: string;
  sessionId: string;
  projectId: string;
  runId: string;
  revision: number;
  webContentsId: number;
  windowEpoch: number;
}

export type WriteApprovalDecision =
  { ok: true } | { ok: false; rejection: WriteApprovalRejection };

/**
 * Content main retains for one approved target so it can write the reviewed
 * bytes. The digest is never trusted from the caller: `checkRetainedPostImages`
 * re-hashes `content` on every check.
 */
export interface RetainedPostImage {
  path: string;
  content: Uint8Array;
}

/**
 * Checks the retained post-image before any write: every approved target must
 * have exactly one retained entry whose bytes hash to the reviewed SHA-256 and
 * whose length equals the reviewed length. The content stays in main's
 * approval store and never enters the serializable summary, so the renderer
 * cannot substitute different bytes.
 */
export function checkRetainedPostImages(
  approval: WriteApproval,
  retained: readonly RetainedPostImage[],
): WriteApprovalDecision {
  const approvedPaths = new Set(approval.targets.map((target) => target.path));
  const byPath = new Map<string, Uint8Array>();
  for (const entry of retained) {
    if (!approvedPaths.has(entry.path) || byPath.has(entry.path)) {
      return { ok: false, rejection: reject('APPROVAL_TARGET_MISMATCH') };
    }
    byPath.set(entry.path, entry.content);
  }
  for (const target of approval.targets) {
    const content = byPath.get(target.path);
    if (content === undefined)
      return { ok: false, rejection: reject('APPROVAL_REQUIRED') };
    if (
      content.byteLength !== target.after.bytes ||
      sha256OfBytes(content) !== target.after.sha256
    ) {
      return { ok: false, rejection: reject('APPROVAL_DIGEST_MISMATCH') };
    }
  }
  return { ok: true };
}

/**
 * Canonical `diffDigest` (spec §2.5): SHA-256 over UTF-8 JSON of the version,
 * operation, the approved targets in order and the rendered Diff text. main
 * computes it when it builds the preview; the renderer only echoes the value
 * the user confirmed.
 */
export function computeDiffDigest(input: {
  operation: 'replace_file';
  targets: readonly WriteTarget[];
  diff: string;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        version: 1,
        operation: input.operation,
        targets: input.targets,
        diff: input.diff,
      }),
      'utf-8',
    )
    .digest('hex');
}

/**
 * Decides whether the whole approval may be applied. The review is
 * all-or-nothing: one stale target rejects the entire approval, because the
 * user approved one Diff and no subset of it.
 *
 * Refusal precedence is fixed and matches the main store: binding first (a
 * foreign window learns nothing about the record), then revocation, use,
 * expiry, the confirmed Diff, the target set and finally the observed targets.
 */
export function evaluateWriteApproval(
  approval: WriteApproval,
  context: WriteApprovalContext,
  observations: readonly TargetObservation[],
): WriteApprovalDecision {
  if (
    approval.sessionId !== context.sessionId ||
    approval.projectId !== context.projectId ||
    approval.runId !== context.runId ||
    approval.revision !== context.revision ||
    approval.webContentsId !== context.webContentsId ||
    approval.windowEpoch !== context.windowEpoch
  ) {
    return { ok: false, rejection: reject('APPROVAL_BINDING_MISMATCH') };
  }
  if (approval.revoked) {
    return { ok: false, rejection: reject('APPROVAL_REVOKED') };
  }
  if (approval.consumed) {
    return { ok: false, rejection: reject('APPROVAL_CONSUMED') };
  }
  if (Date.parse(approval.expiresAt) <= context.now) {
    return { ok: false, rejection: reject('APPROVAL_EXPIRED') };
  }
  if (approval.diffDigest !== context.confirmedDiffDigest) {
    return { ok: false, rejection: reject('APPROVAL_DIGEST_MISMATCH') };
  }
  if (
    observations.length !== approval.targets.length ||
    observations.some(
      (observation, index) =>
        observation.path !== approval.targets[index]?.path,
    )
  ) {
    return { ok: false, rejection: reject('APPROVAL_TARGET_MISMATCH') };
  }
  const stale: WriteStaleTarget[] = observations
    .filter((observation) => observation.state !== 'unchanged')
    .map((observation) => ({
      path: observation.path,
      state: observation.state,
    }));
  if (stale.length > 0) {
    return { ok: false, rejection: reject('APPROVAL_STALE_TARGET', stale) };
  }
  return { ok: true };
}

/**
 * Revokes an approval. Main calls this on a user cancel, a closed window, a
 * newer session revision, or after a stale-target refusal; the record keeps
 * the reason so a later review can explain why the old Diff is unusable.
 */
export function revokeWriteApproval(
  approval: WriteApproval,
  reason: WriteRevocationReason,
): WriteApproval {
  return WriteApprovalSchema.parse({
    ...approval,
    revoked: true,
    revocationReason: reason,
  });
}

/**
 * Consumes the approval when the write stage starts, before any target is
 * touched. `appliedAt` stays null until the whole set succeeded, so a partial
 * write or a crash leaves a consumed approval with no completion stamp and can
 * never be applied twice.
 */
export function consumeWriteApproval(approval: WriteApproval): WriteApproval {
  return WriteApprovalSchema.parse({ ...approval, consumed: true });
}

export type WriteScopeDecision =
  { ok: true } | { ok: false; code: WriteScopeDenialCode };

/**
 * Protected paths match by whole path segment, at any depth and in any case:
 * `.git`, `.git/config`, `vendor/x/.git/config` and `.GIT/config` are all
 * refused, while a lookalike such as `.github/workflows` is not protected.
 */
function isProtectedPath(
  path: string,
  protectedPaths: readonly string[],
): boolean {
  const wrapped = `/${path.toLowerCase()}/`;
  return protectedPaths.some((protectedPath) =>
    wrapped.includes(`/${protectedPath.toLowerCase()}/`),
  );
}

/**
 * Applies the sandbox rule before any approval is consumed. `read_only` refuses
 * every write; `workspace_write` keeps protected paths read-only; `full_access`
 * is the explicit opt-out and is expected only after a separate confirmation.
 *
 * Containment (no `..`, no absolute path, no link escape, resolved path inside
 * the project root) is already enforced by the path schema and main's read-only
 * path policy, so this function owns the mode and protected-path rules only.
 */
export function checkWriteScope(
  targets: readonly WriteTarget[],
  policy: WriteSandboxPolicy,
): WriteScopeDecision {
  if (policy.mode === 'read_only')
    return { ok: false, code: 'SCOPE_READ_ONLY' };
  if (policy.mode === 'full_access') return { ok: true };
  // `.git` is an invariant of workspace-write, not a default a policy may drop.
  const protectedPaths = [...WRITE_PROTECTED_PATHS, ...policy.protectedPaths];
  for (const target of targets) {
    if (isProtectedPath(target.path, protectedPaths)) {
      return { ok: false, code: 'SCOPE_PROTECTED_PATH' };
    }
  }
  return { ok: true };
}

/** Every target stays untouched because the sandbox refused the scope. */
export function scopeDeniedOutcomes(
  targets: readonly WriteTarget[],
): WriteTargetOutcome[] {
  return targets.map((target) => ({
    path: target.path,
    status: 'failed' as const,
    code: 'SCOPE_DENIED' as const,
  }));
}

/** Marks the approval as applied once, after the whole set succeeded. */
export function markApprovalApplied(
  approval: WriteApproval,
  at: string,
): WriteApproval {
  return WriteApprovalSchema.parse({
    ...approval,
    consumed: true,
    appliedAt: at,
  });
}

/** Marks every approved target rejected before any write happened. */
export function rejectedOutcomes(
  approval: WriteApproval,
  rejection: WriteApprovalRejection,
): WriteTargetOutcome[] {
  return approval.targets.map((target) => ({
    path: target.path,
    status: 'rejected' as const,
    code: rejection.error.code,
  }));
}

/**
 * Last journal record for one approved target. `kind` narrows the scan when a
 * caller needs one stage of the chain (`intent`, `applied`) rather than the
 * latest record of any kind.
 */
function lastRecordFor(
  records: readonly WriteChangeJournalRecord[],
  approvalId: string,
  path: string,
): WriteChangeJournalRecord | null;
function lastRecordFor<K extends WriteChangeJournalRecord['kind']>(
  records: readonly WriteChangeJournalRecord[],
  approvalId: string,
  path: string,
  kind: K,
): Extract<WriteChangeJournalRecord, { kind: K }> | null;
function lastRecordFor(
  records: readonly WriteChangeJournalRecord[],
  approvalId: string,
  path: string,
  kind?: WriteChangeJournalRecord['kind'],
): WriteChangeJournalRecord | null {
  let found: WriteChangeJournalRecord | null = null;
  for (const record of records) {
    if (record.approvalId !== approvalId || record.path !== path) continue;
    if (kind !== undefined && record.kind !== kind) continue;
    found = record;
  }
  return found;
}

/**
 * A journal record proves the reviewed write only when the run recorded the
 * `intent` before it, the record is verified, its after-image is this
 * approval's after-image and the observation agrees. Both the outcome summary
 * and the recovery plan use this one predicate.
 */
function isProvenApplied(
  record: Extract<WriteChangeJournalRecord, { kind: 'applied' }>,
  target: WriteTarget,
  records: readonly WriteChangeJournalRecord[],
  approvalId: string,
): boolean {
  const intent = lastRecordFor(records, approvalId, target.path, 'intent');
  return (
    intent !== null &&
    intent.at <= record.at &&
    record.verification === 'verified' &&
    record.afterSha256 === target.after.sha256 &&
    record.observedSha256 === record.afterSha256
  );
}

/**
 * A recovery record proves the target is back at its before-image only when
 * the run's own write was proven first and the recorded observation is that
 * before-image; anything else needs a human.
 */
function isProvenRecovery(
  record: Extract<WriteChangeJournalRecord, { kind: 'recovery' }>,
  target: WriteTarget,
  applied: Extract<WriteChangeJournalRecord, { kind: 'applied' }> | null,
  records: readonly WriteChangeJournalRecord[],
  approvalId: string,
): boolean {
  return (
    record.action !== 'preserve' &&
    record.observedSha256 === target.before.sha256 &&
    applied !== null &&
    isProvenApplied(applied, target, records, approvalId)
  );
}

/**
 * Per-path actual file state after an attempt. A target with no journal record
 * was never written, so it reports `unchanged`; an `intent` without `applied`
 * or `failed` means the process stopped mid-write, so it reports `unknown`
 * rather than a guess. A recovery record replaces the earlier outcome: a
 * proven restore reports `restored`, anything else stays `failed`.
 */
export function summarizeWriteOutcomes(
  approval: WriteApproval,
  records: readonly WriteChangeJournalRecord[],
): WriteTargetOutcome[] {
  return approval.targets.map((target) => {
    const record = lastRecordFor(records, approval.approvalId, target.path);
    if (record === null) {
      return { path: target.path, status: 'unchanged' as const, code: null };
    }
    switch (record.kind) {
      case 'applied': {
        const verified = isProvenApplied(
          record,
          target,
          records,
          approval.approvalId,
        );
        return {
          path: target.path,
          status: verified
            ? ('applied' as const)
            : ('verification_failed' as const),
          code: verified ? null : ('VERIFY_FAILED' as const),
        };
      }
      case 'failed':
        return {
          path: target.path,
          status: 'failed' as const,
          code: record.code,
        };
      case 'intent':
        return {
          path: target.path,
          status: 'unknown' as const,
          code: 'UNKNOWN' as const,
        };
      case 'recovery': {
        const applied = lastRecordFor(
          records,
          approval.approvalId,
          target.path,
          'applied',
        );
        const restored = isProvenRecovery(
          record,
          target,
          applied,
          records,
          approval.approvalId,
        );
        return restored
          ? { path: target.path, status: 'restored' as const, code: null }
          : {
              path: target.path,
              status: 'failed' as const,
              code: 'RECOVERY_CONFLICT' as const,
            };
      }
    }
  });
}

export interface RecoveryAction {
  path: string;
  action: 'restore' | 'already_restored' | 'conflict';
  state: TargetObservation['state'];
  observed: WriteFileState | null;
}

export interface RecoveryPlan {
  actions: RecoveryAction[];
  conflicts: RecoveryAction[];
  /** Approved targets this run never applied; recovery must not touch them. */
  outOfScope: string[];
}

/**
 * Plans a recovery that only touches what this run applied. `restore` requires
 * the current bytes to still equal the post-image this run wrote and, when both
 * sides recorded a file identity, the same file object; anything else (a user
 * edit, a deletion, a re-created file, a different type) is preserved as a
 * conflict. Repeating the plan after a successful restore reports
 * `already_restored`, so recovery never re-applies or re-undoes anything.
 */
export function planRecovery(input: {
  approval: WriteApproval;
  records: readonly WriteChangeJournalRecord[];
  observations: readonly TargetObservation[];
}): RecoveryPlan {
  const byPath = new Map(
    input.observations.map((observation) => [observation.path, observation]),
  );
  const actions: RecoveryAction[] = [];
  const outOfScope: string[] = [];
  for (const target of input.approval.targets) {
    const latest = lastRecordFor(
      input.records,
      input.approval.approvalId,
      target.path,
    );
    const observation: TargetObservation = byPath.get(target.path) ?? {
      path: target.path,
      state: 'unreadable',
      observed: null,
      identity: null,
    };
    if (latest === null) {
      outOfScope.push(target.path);
      continue;
    }
    // A later recovery record ends this run's claim on the target, but only a
    // proven restore counts as done; an orphan or unproven one needs a human.
    if (latest.kind === 'recovery') {
      const applied = lastRecordFor(
        input.records,
        input.approval.approvalId,
        target.path,
        'applied',
      );
      // A proven restore only settles the target when the disk still agrees;
      // a file edited after the restore is a new conflict, not "done".
      const restored =
        isProvenRecovery(
          latest,
          target,
          applied,
          input.records,
          input.approval.approvalId,
        ) && observation.state === 'unchanged';
      actions.push({
        path: target.path,
        action: restored ? 'already_restored' : 'conflict',
        state: observation.state,
        observed: observation.observed,
      });
      continue;
    }
    if (latest.kind === 'failed') {
      // A failure after a real write leaves the file in an unknown state, so it
      // is a conflict; only a path with no applied record is safely out of scope.
      if (
        lastRecordFor(
          input.records,
          input.approval.approvalId,
          target.path,
          'applied',
        ) === null
      ) {
        outOfScope.push(target.path);
      } else {
        actions.push({
          path: target.path,
          action: 'conflict',
          state: observation.state,
          observed: observation.observed,
        });
      }
      continue;
    }
    if (latest.kind === 'intent') {
      // The process stopped mid-write; the real state is unknown, so recovery
      // must not guess and overwrite it.
      actions.push({
        path: target.path,
        action: 'conflict',
        state: observation.state,
        observed: observation.observed,
      });
      continue;
    }
    // Only a verified applied record that matches this approval proves the run
    // actually wrote the reviewed bytes.
    if (
      !isProvenApplied(latest, target, input.records, input.approval.approvalId)
    ) {
      actions.push({
        path: target.path,
        action: 'conflict',
        state: observation.state,
        observed: observation.observed,
      });
      continue;
    }
    const applied = latest;
    if (observation.state === 'unchanged') {
      actions.push({
        path: target.path,
        action: 'already_restored',
        state: observation.state,
        observed: observation.observed,
      });
      continue;
    }
    // The file object the run's bytes landed on, not the pre-image object: a
    // temp-file + rename writer replaces the object, so comparing against the
    // pre-image identity would turn every recovery into a conflict. When the
    // run recorded an identity but the current observation cannot report one,
    // identity is unproven and the file stays a conflict; when the run itself
    // had no identity, content is the only evidence and it decides.
    const appliedIdentity = applied.observedIdentity;
    const identityMatches =
      appliedIdentity === null ||
      (observation.identity !== null &&
        sameFileIdentity(appliedIdentity, observation.identity));
    if (
      observation.state === 'changed' &&
      observation.observed !== null &&
      identityMatches &&
      sameFileState(observation.observed, target.after)
    ) {
      actions.push({
        path: target.path,
        action: 'restore',
        state: observation.state,
        observed: observation.observed,
      });
      continue;
    }
    actions.push({
      path: target.path,
      action: 'conflict',
      state: observation.state,
      observed: observation.observed,
    });
  }
  return {
    actions,
    conflicts: actions.filter((action) => action.action === 'conflict'),
    outOfScope,
  };
}

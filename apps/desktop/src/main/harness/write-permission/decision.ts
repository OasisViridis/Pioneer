import {
  WRITE_PROTECTED_PATHS,
  type WriteChangeJournalRecord,
  type WritePermission,
  type WritePermissionDenialCode,
  type WriteRejectionCode,
  type WriteStaleTarget,
  type WriteTarget,
  type WriteTargetOutcome,
  type WriteTargetState,
  type WriteVerdict,
} from '../../../shared/contracts/write-permission';
import { sameFileIdentity, sameFileState } from './file-state';
import type { TargetObservation } from './observe-targets';

/**
 * Pure write-permission decisions for the P4-D1 decision spec (#18).
 *
 * These functions decide only: whether the granted permission mode and scope
 * allow this batch, whether the bytes on disk still match what the run read,
 * what the per-path outcome is, and what a later recovery may touch. They never
 * write, delete, rename or restore a file.
 */

export type WritePermissionDecision =
  | { ok: true; confirmation: 'per_apply' | 'none' }
  | {
      ok: false;
      code: WritePermissionDenialCode;
      /** First target that triggered the denial, for diagnostics. */
      path: string | null;
    };

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
 * Applies the permission selector to a batch. `read_only` refuses everything;
 * `workspace_write` and `auto_review` keep protected paths read-only;
 * `full_access` is the explicit opt-out. A narrowed scope must cover every
 * target, because the batch is applied all-or-nothing.
 *
 * `auto_review` differs from `workspace_write` in exactly one place: the
 * returned `confirmation` is `none`, so a caller that does ask the user before
 * each apply (workspace modes) must skip that prompt. The write-time checks are
 * identical; the mode never weakens them.
 */
export function checkWritePermission(
  targets: readonly WriteTarget[],
  permission: WritePermission,
): WritePermissionDecision {
  if (permission.mode === 'read_only') {
    return {
      ok: false,
      code: 'PERMISSION_READ_ONLY',
      path: targets[0]?.path ?? null,
    };
  }
  if (permission.scope !== 'all_targets') {
    const allowed = new Set(permission.scope.map((path) => path.toLowerCase()));
    const outside = targets.find(
      (target) => !allowed.has(target.path.toLowerCase()),
    );
    if (outside !== undefined) {
      return {
        ok: false,
        code: 'PERMISSION_OUT_OF_SCOPE',
        path: outside.path,
      };
    }
  }
  if (permission.mode !== 'full_access') {
    // `.git` is an invariant of the workspace modes, not a default a policy may
    // drop: the built-in list is always merged in.
    const protectedPaths = [
      ...WRITE_PROTECTED_PATHS,
      ...permission.protectedPaths,
    ];
    const guarded = targets.find((target) =>
      isProtectedPath(target.path, protectedPaths),
    );
    if (guarded !== undefined) {
      return {
        ok: false,
        code: 'PERMISSION_PROTECTED_PATH',
        path: guarded.path,
      };
    }
  }
  return {
    ok: true,
    confirmation: permission.mode === 'auto_review' ? 'none' : 'per_apply',
  };
}

/** Every target stays untouched because the permission refused the batch. */
export function permissionDeniedOutcomes(
  targets: readonly WriteTarget[],
): WriteTargetOutcome[] {
  return targets.map((target) => ({
    path: target.path,
    status: 'rejected' as const,
    code: 'PERMISSION_DENIED' as const,
  }));
}

export type WriteAuthorization =
  | { ok: true; confirmation: 'per_apply' | 'none' }
  | {
      ok: false;
      stage: 'permission';
      code: WritePermissionDenialCode;
      path: string | null;
      targets: readonly WriteStaleTarget[];
      outcomes: readonly WriteTargetOutcome[];
    }
  | {
      ok: false;
      stage: 'targets';
      code: WriteRejectionCode;
      targets: readonly WriteStaleTarget[];
    };

/**
 * The composed entry point every executor should call: permission first,
 * write-time target check second. `#19` gets one decision instead of being
 * trusted to run both checks in the right order.
 */
export function authorizeWrite(
  targets: readonly WriteTarget[],
  permission: WritePermission,
  observations: readonly TargetObservation[],
): WriteAuthorization {
  const gate = checkWritePermission(targets, permission);
  if (!gate.ok) {
    return {
      ok: false,
      stage: 'permission',
      code: gate.code,
      path: gate.path,
      targets: [],
      outcomes: permissionDeniedOutcomes(targets),
    };
  }
  const verdict = evaluateWriteTargets(targets, observations);
  if (!verdict.ok) {
    return {
      ok: false,
      stage: 'targets',
      code: verdict.error.code,
      targets: verdict.error.targets,
    };
  }
  return { ok: true, confirmation: gate.confirmation };
}

/**
 * Whether a grant still belongs to the window and project that issued it.
 * `#19` calls this before trusting a stored permission; the decision layer
 * itself only sees the grant, so the expected binding is passed in.
 */
export function checkPermissionBinding(
  permission: WritePermission,
  expected: {
    sessionId: string;
    projectId: string;
    webContentsId: number;
    windowEpoch: number;
  },
): boolean {
  return (
    permission.sessionId === expected.sessionId &&
    permission.projectId === expected.projectId &&
    permission.webContentsId === expected.webContentsId &&
    permission.windowEpoch === expected.windowEpoch
  );
}

/** Map an observed target state to the rejection code it produces. */
export function rejectionCodeFor(state: WriteTargetState): WriteRejectionCode {
  switch (state) {
    case 'changed':
      return 'TARGET_CHANGED';
    case 'missing':
      return 'TARGET_MISSING';
    case 'replaced':
      return 'TARGET_REPLACED';
    case 'identity_unavailable':
      return 'TARGET_IDENTITY_UNAVAILABLE';
    case 'not_regular_file':
      return 'TARGET_NOT_REGULAR_FILE';
    case 'link_not_allowed':
      return 'TARGET_LINK_NOT_ALLOWED';
    case 'too_large':
      return 'TARGET_TOO_LARGE';
    case 'unstable':
      return 'TARGET_UNSTABLE';
    case 'unreadable':
    case 'unchanged':
      // Callers only ask for a code when the target is refused; `unchanged`
      // never reaches this branch but the switch stays exhaustive.
      return 'TARGET_UNREADABLE';
  }
}

const rejectionMessages = {
  TARGET_CHANGED: 'The file changed since this run read it.',
  TARGET_MISSING: 'The file no longer exists.',
  TARGET_REPLACED: 'The file was deleted and re-created.',
  TARGET_IDENTITY_UNAVAILABLE: 'The file identity could not be verified.',
  TARGET_NOT_REGULAR_FILE: 'The target is not a regular file.',
  TARGET_LINK_NOT_ALLOWED: 'Links are not writable.',
  TARGET_TOO_LARGE: 'The target exceeds the byte budget.',
  TARGET_UNREADABLE: 'The target could not be read.',
  TARGET_UNSTABLE: 'The target changed while it was being read.',
} as const;

/**
 * Write-time check: every target must still hold the pre-image this run read,
 * on the same file object when both sides recorded one. The batch is
 * all-or-nothing, so one stale target refuses the whole batch.
 */
export function evaluateWriteTargets(
  targets: readonly WriteTarget[],
  observations: readonly TargetObservation[],
): WriteVerdict {
  const byPath = new Map(
    observations.map((observation) => [observation.path, observation]),
  );
  const stale: WriteStaleTarget[] = [];
  for (const target of targets) {
    const observation = byPath.get(target.path);
    if (observation?.state !== 'unchanged') {
      const state: WriteTargetState = observation?.state ?? 'unreadable';
      stale.push({ path: target.path, state });
      continue;
    }
    if (
      observation.observed === null ||
      !sameFileState(observation.observed, target.before)
    ) {
      stale.push({ path: target.path, state: 'changed' });
      continue;
    }
    // When the run recorded an identity, the file object must still be the one
    // it read; an unreported identity is unproven rather than "different".
    if (target.identity !== null) {
      if (observation.identity === null) {
        stale.push({ path: target.path, state: 'identity_unavailable' });
        continue;
      }
      if (!sameFileIdentity(target.identity, observation.identity)) {
        stale.push({ path: target.path, state: 'replaced' });
        continue;
      }
    }
  }
  if (stale.length > 0) {
    const first = stale[0];
    if (first === undefined) return { ok: true };
    const code = rejectionCodeFor(first.state);
    return {
      ok: false,
      error: {
        code,
        message: rejectionMessages[code],
        retryable: false,
        targets: stale,
      },
    };
  }
  return { ok: true };
}

/** Outcomes for a batch that the write-time check refused. */
export function rejectedOutcomes(
  targets: readonly WriteTarget[],
  verdict: WriteVerdict,
): WriteTargetOutcome[] {
  if (verdict.ok) {
    throw new Error('internal: rejectedOutcomes needs a refused verdict');
  }
  const code: WriteRejectionCode = verdict.error.code;
  return targets.map((target) => ({
    path: target.path,
    status: 'rejected' as const,
    code,
  }));
}

/**
 * Last journal record for one target. `kind` narrows the scan when a caller
 * needs one stage of the chain (`intent`, `applied`) rather than the latest
 * record of any kind.
 */
function lastRecordFor(
  records: readonly WriteChangeJournalRecord[],
  runId: string,
  path: string,
): WriteChangeJournalRecord | null;
function lastRecordFor<K extends WriteChangeJournalRecord['kind']>(
  records: readonly WriteChangeJournalRecord[],
  runId: string,
  path: string,
  kind: K,
): Extract<WriteChangeJournalRecord, { kind: K }> | null;
function lastRecordFor(
  records: readonly WriteChangeJournalRecord[],
  runId: string,
  path: string,
  kind?: WriteChangeJournalRecord['kind'],
): WriteChangeJournalRecord | null {
  let found: WriteChangeJournalRecord | null = null;
  for (const record of records) {
    if (record.runId !== runId || record.path !== path) continue;
    if (kind !== undefined && record.kind !== kind) continue;
    found = record;
  }
  return found;
}

/**
 * A journal record proves the run's write only when the run recorded the
 * `intent` before it, that intent describes this batch's pre-image, the record
 * is verified and its after-image is this batch's after-image. Both the outcome
 * summary and the recovery plan use this one predicate.
 */
function isProvenApplied(
  record: Extract<WriteChangeJournalRecord, { kind: 'applied' }>,
  target: WriteTarget,
  records: readonly WriteChangeJournalRecord[],
  runId: string,
): boolean {
  const intent = lastRecordFor(records, runId, target.path, 'intent');
  return (
    intent !== null &&
    intent.at <= record.at &&
    intent.beforeSha256 === target.before.sha256 &&
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
  runId: string,
): boolean {
  return (
    record.action !== 'preserve' &&
    record.observedSha256 === target.before.sha256 &&
    applied !== null &&
    isProvenApplied(applied, target, records, runId)
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
  runId: string,
  revision: number,
  targets: readonly WriteTarget[],
  records: readonly WriteChangeJournalRecord[],
): WriteTargetOutcome[] {
  // Only records of this exact revision describe the current outcome: a bump
  // means the session moved on, and an older record would prove a stale write.
  const current = records.filter((record) => record.revision === revision);
  return targets.map((target) => {
    const record = lastRecordFor(current, runId, target.path);
    if (record === null) {
      return { path: target.path, status: 'unchanged' as const, code: null };
    }
    switch (record.kind) {
      case 'applied': {
        const verified = isProvenApplied(record, target, current, runId);
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
        const applied = lastRecordFor(current, runId, target.path, 'applied');
        const restored = isProvenRecovery(
          record,
          target,
          applied,
          current,
          runId,
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
  observed: TargetObservation['observed'];
}

export interface RecoveryPlan {
  actions: RecoveryAction[];
  conflicts: RecoveryAction[];
  /** Targets this run never applied; recovery must not touch them. */
  outOfScope: string[];
  /** Set when the permission refuses recovery for the whole batch. */
  denied: WritePermissionDenialCode | null;
}

/**
 * Plans a recovery under the granted permission. Recovery writes too, so the
 * permission check runs first and a refusal ends the plan: `read_only` denies
 * everything, the workspace modes deny protected paths, and `full_access`
 * allows what the write path allows.
 *
 * When the permission allows it, `restore` requires the current bytes to still
 * equal the post-image this run wrote and, when both sides recorded a file
 * identity, the same file object; anything else (a user edit, a deletion, a
 * re-created file, a different type) is preserved as a conflict. Repeating the
 * plan after a successful restore reports `already_restored`, so recovery never
 * re-applies or re-undoes anything.
 */
export function planRecovery(input: {
  runId: string;
  permission: WritePermission;
  targets: readonly WriteTarget[];
  records: readonly WriteChangeJournalRecord[];
  observations: readonly TargetObservation[];
}): RecoveryPlan {
  const gate = checkWritePermission(input.targets, input.permission);
  if (!gate.ok) {
    return {
      actions: [],
      conflicts: [],
      outOfScope: [],
      denied: gate.code,
    };
  }
  const byPath = new Map(
    input.observations.map((observation) => [observation.path, observation]),
  );
  const actions: RecoveryAction[] = [];
  const outOfScope: string[] = [];
  for (const target of input.targets) {
    const latest = lastRecordFor(input.records, input.runId, target.path);
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
        input.runId,
        target.path,
        'applied',
      );
      // A proven restore only settles the target when the disk still agrees;
      // a file edited after the restore is a new conflict, not "done".
      const restored =
        isProvenRecovery(latest, target, applied, input.records, input.runId) &&
        observation.state === 'unchanged';
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
        lastRecordFor(input.records, input.runId, target.path, 'applied') ===
        null
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
    // Only a verified applied record that matches this batch proves the run
    // actually wrote the reviewed bytes.
    if (!isProvenApplied(latest, target, input.records, input.runId)) {
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
    denied: null,
  };
}

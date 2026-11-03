import { lstat, realpath } from 'node:fs/promises';
import { isAbsolute, join, parse, relative } from 'node:path';

import {
  WRITE_LIMITS,
  WRITE_PROTECTED_PATHS,
  WritePermissionSchema,
  WriteTargetPathSchema,
  type WriteFileIdentity,
  type WriteFileState,
  type WritePermission,
  type WritePermissionDenialCode,
  type WriteRejectionCode,
  type WriteTargetOutcome,
  type WriteTargetPath,
  type WriteTargetState,
} from '../shared/contracts/write-permission';
import {
  WRITE_EXECUTION_PREVIEW_MARKER,
  WRITE_EXECUTION_VERSION,
  WriteExecutionRequestSchema,
  WriteExecutionResultSchema,
  WriteReviewReplySchema,
  type WriteExecutionCode,
  type WriteExecutionRequest,
  type WriteExecutionResult,
  type WriteExecutionTarget,
  type WriteExecutionTargetResult,
  type WriteReviewDenialCode,
  type WriteReviewPrepare,
  type WriteReviewReply,
} from '../shared/contracts/write-execution';
import { matchesProtectedPath } from '../shared/path-safety';
import { isPathInsideRoot, normalizeRootPath } from './catalog/path-policy';
import { writeFileAtomic } from './atomic-file';
import { BoundedReadError, readStableFile } from './harness/bounded-read';
import { isSensitiveEntryName } from './harness/read-only-tool-policy';
import {
  checkPermissionBinding,
  checkWritePermission,
  evaluateWriteTargets,
  permissionDeniedOutcomes,
  rejectedOutcomes,
} from './harness/write-permission/decision';
import {
  sameFileIdentity,
  sameFileState,
  sha256OfBytes,
} from './harness/write-permission/file-state';
import {
  observationAllowance,
  type TargetObservation,
} from './harness/write-permission/observe-targets';

/**
 * P4-A (#19) controlled write executor.
 *
 * One batch replaces the full content of already-existing regular text files
 * inside one selected project. The executor never trusts the request: it binds
 * it to the current window and epoch, re-checks the permission, refuses
 * protected paths, resolves every path from the selected project root, reads
 * the pre-image through the shared bounded/stable reader, compares bytes and
 * file identity, writes only through `writeFileAtomic`, and reads every file
 * back before it reports `applied`.
 *
 * There are no provider, shell, issue, Figma or PR actions in this module. It
 * does not run recovery: a failed or unverified batch stops at the first bad
 * target, preserves the scene, and leaves restoration to #20.
 */

export interface WriteExecutionExpectation {
  /** The trusted IPC sender; the request cannot supply or override it. */
  webContentsId: number;
  /** The current window generation; a reload invalidates a prepared review. */
  windowEpoch: number;
}

export interface WriteExecutionHooks {
  /**
   * Test seam: runs after a target's bytes land and before the read-back. The
   * production dependencies never supply it.
   */
  afterWrite?: (path: WriteTargetPath) => Promise<void>;
}

export interface WriteExecutionDependencies {
  /** Main resolves the project root from its own catalog, never the request. */
  resolveProjectRoot: (projectId: string) => Promise<string | null>;
  now?: () => Date;
  hooks?: WriteExecutionHooks;
}

interface PendingReview {
  request: WriteExecutionRequest;
  webContentsId: number;
  windowEpoch: number;
}

/**
 * Serializes prepare/execute so two invocations cannot interleave their
 * validation and write phases, and keeps the one prepared request per window.
 */
export class WriteExecutionService {
  private readonly dependencies: WriteExecutionDependencies;

  private pending: PendingReview | null = null;

  private queue: Promise<void> = Promise.resolve();

  constructor(dependencies: WriteExecutionDependencies) {
    this.dependencies = dependencies;
  }

  prepare(
    input: WriteReviewPrepare,
    expectation: WriteExecutionExpectation,
  ): Promise<WriteReviewReply> {
    return this.enqueue(async () => {
      const reply = await prepareControlledReview(
        this.dependencies,
        input,
        expectation,
      );
      // Any new prepare attempt replaces or clears the reviewed request; an
      // old request can never be resumed after the user looks at a new one.
      this.pending = reply.ok
        ? {
            request: reply.request,
            webContentsId: expectation.webContentsId,
            windowEpoch: expectation.windowEpoch,
          }
        : null;
      return reply;
    });
  }

  execute(
    request: WriteExecutionRequest,
    expectation: WriteExecutionExpectation,
  ): Promise<WriteExecutionResult> {
    return this.enqueue(async () => {
      const pending = this.pending;
      // Single use: clear before doing anything so a replayed or concurrent
      // call cannot consume the reviewed request twice.
      this.pending = null;
      if (pending === null) {
        return executionRefusal('BINDING_MISMATCH', this.now());
      }
      if (
        pending.webContentsId !== expectation.webContentsId ||
        pending.windowEpoch !== expectation.windowEpoch
      ) {
        return executionRefusal('BINDING_MISMATCH', this.now());
      }
      if (!sameControlledRequest(pending.request, request)) {
        return executionRefusal('BINDING_MISMATCH', this.now());
      }
      return executeControlledWrite(
        this.dependencies,
        pending.request,
        expectation,
      );
    });
  }

  /** Navigation, renderer loss or window close invalidates a prepared review. */
  invalidate(): void {
    this.pending = null;
  }

  private now(): Date {
    return this.dependencies.now?.() ?? new Date();
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.queue.then(operation, operation);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

/**
 * Reads one project-relative target and returns the exact request main is
 * prepared to execute. The renderer receives this request for review; it never
 * authors the pre-image, the post-image hash or the permission binding.
 */
export async function prepareControlledReview(
  dependencies: WriteExecutionDependencies,
  input: WriteReviewPrepare,
  expectation: WriteExecutionExpectation,
): Promise<WriteReviewReply> {
  try {
    const targetPath = WriteTargetPathSchema.safeParse(input.targetPath);
    if (!targetPath.success) return reviewRefusal('INVALID_REQUEST');
    const projectRoot = await dependencies.resolveProjectRoot(input.projectId);
    if (projectRoot === null) return reviewRefusal('PROJECT_UNAVAILABLE');
    const now = dependencies.now?.() ?? new Date();
    const permission = WritePermissionSchema.safeParse({
      version: 1,
      sessionId: input.sessionId,
      projectId: input.projectId,
      mode: 'workspace_write',
      scope: 'all_targets',
      protectedPaths: [...WRITE_PROTECTED_PATHS],
      webContentsId: expectation.webContentsId,
      windowEpoch: expectation.windowEpoch,
      grantedAt: now.toISOString(),
      riskAcknowledged: false,
    });
    if (!permission.success) return reviewRefusal('INVALID_REQUEST');
    const read = await readProjectTarget(
      projectRoot,
      targetPath.data,
      permission.data,
    );
    if (!read.ok) return reviewRefusal(prepareRefusalCode(read.state));
    const afterContent = `${read.value.text}${WRITE_EXECUTION_PREVIEW_MARKER}`;
    const afterBytes = Buffer.from(afterContent, 'utf8');
    if (afterBytes.byteLength > WRITE_LIMITS.targetBytes) {
      return reviewRefusal('TARGET_TOO_LARGE');
    }
    const after: WriteFileState = {
      kind: 'file',
      bytes: afterBytes.byteLength,
      sha256: sha256OfBytes(afterBytes),
    };
    const request = WriteExecutionRequestSchema.safeParse({
      version: WRITE_EXECUTION_VERSION,
      sessionId: input.sessionId,
      projectId: input.projectId,
      windowEpoch: expectation.windowEpoch,
      permission: permission.data,
      targets: [
        {
          path: targetPath.data,
          before: read.value.state,
          identity: read.value.identity,
          after,
          content: afterContent,
        },
      ],
    });
    if (!request.success) return reviewRefusal('INVALID_REQUEST');
    return WriteReviewReplySchema.parse({
      ok: true,
      request: request.data,
      beforePreview: read.value.text,
    });
  } catch {
    return reviewRefusal('TARGET_UNREADABLE');
  }
}

/**
 * The executor proper. It is exported separately from the service so contract
 * probes can exercise the guards without going through the pending-review
 * handshake; the IPC layer only reaches it through the service.
 */
export async function executeControlledWrite(
  dependencies: WriteExecutionDependencies,
  request: WriteExecutionRequest,
  expectation: WriteExecutionExpectation,
): Promise<WriteExecutionResult> {
  const completedAt = (dependencies.now?.() ?? new Date()).toISOString();
  const hooks = dependencies.hooks;
  try {
    const parsed = WriteExecutionRequestSchema.safeParse(request);
    if (!parsed.success) {
      return finalizeResult(
        resultOf([], 'rejected', 'INVALID_REQUEST', completedAt),
      );
    }
    const controlled = parsed.data;

    // 1. Window and permission binding. The sender id and epoch come from main,
    //    not from the request; a reload or another window cannot replay this.
    const bound =
      controlled.windowEpoch === expectation.windowEpoch &&
      controlled.permission.windowEpoch === expectation.windowEpoch &&
      controlled.permission.webContentsId === expectation.webContentsId &&
      checkPermissionBinding(controlled.permission, {
        sessionId: controlled.sessionId,
        projectId: controlled.projectId,
        webContentsId: expectation.webContentsId,
        windowEpoch: expectation.windowEpoch,
      });
    if (!bound) {
      return finalizeResult(
        rejectEveryTarget(controlled.targets, 'BINDING_MISMATCH', completedAt),
      );
    }

    // 2. The declared post-image must be exactly the supplied content. The IPC
    //    schema checks the byte count; the hash is recomputed here because the
    //    renderer and preload must not be able to declare a hash they did not
    //    produce.
    const contentMismatch = controlled.targets.some((target) => {
      const bytes = Buffer.from(target.content, 'utf8');
      return (
        bytes.byteLength !== target.after.bytes ||
        sha256OfBytes(bytes) !== target.after.sha256
      );
    });
    if (contentMismatch) {
      return finalizeResult(
        rejectEveryTarget(controlled.targets, 'CONTENT_MISMATCH', completedAt),
      );
    }

    // 3. Permission first, before any filesystem access. `read_only` refuses
    //    the whole batch here; protected paths are refused for the workspace
    //    modes and the scope subset is a real allow-list.
    const gate = checkWritePermission(
      controlled.targets,
      controlled.permission,
    );
    if (!gate.ok) {
      return finalizeResult(
        permissionRefusal(controlled.targets, gate.code, completedAt),
      );
    }

    // 4. The project root comes from main's catalog, never from the request.
    const projectRoot = await dependencies.resolveProjectRoot(
      controlled.projectId,
    );
    if (projectRoot === null) {
      return finalizeResult(
        rejectEveryTarget(
          controlled.targets,
          'PROJECT_UNAVAILABLE',
          completedAt,
        ),
      );
    }

    // 5. Re-observe every target from the project root. Reading is the only
    //    step here; the captured text is what a compensating restore writes
    //    back if a later stage fails.
    const observations: TargetObservation[] = [];
    const reads: (ReadTarget | null)[] = [];
    for (const target of controlled.targets) {
      const read = await readProjectTarget(
        projectRoot,
        target.path,
        controlled.permission,
      );
      if (!read.ok) {
        observations.push({
          path: target.path,
          state: read.state,
          observed: null,
          identity: null,
        });
        reads.push(null);
        continue;
      }
      observations.push({
        path: target.path,
        state: writeTimeState(target, read.value),
        observed: read.value.state,
        identity: read.value.identity,
      });
      reads.push(read.value);
    }

    // 6. The write-time verdict is the shared decision function, so #19 and the
    //    #18 probes cannot drift on what "unchanged" or "same file" means.
    const verdict = evaluateWriteTargets(controlled.targets, observations);
    if (!verdict.ok) {
      return finalizeResult(
        rejectedTargetsResult(
          verdict.error.code,
          rejectedOutcomes(controlled.targets, verdict),
          completedAt,
        ),
      );
    }
    const confirmedReads: ReadTarget[] = [];
    for (const read of reads) {
      if (read === null) {
        return finalizeResult(
          rejectEveryTarget(
            controlled.targets,
            'TARGET_UNREADABLE',
            completedAt,
          ),
        );
      }
      confirmedReads.push(read);
    }

    return await writeVerifiedBatch({
      dependencies,
      hooks,
      projectRoot,
      permission: controlled.permission,
      targets: controlled.targets,
      reads: confirmedReads,
      completedAt,
    });
  } catch {
    return finalizeResult(resultOf([], 'unknown', 'UNKNOWN', completedAt));
  }
}

interface ReadTarget {
  absolutePath: string;
  state: WriteFileState;
  identity: WriteFileIdentity | null;
  text: string;
}

interface WrittenTarget {
  index: number;
  target: WriteExecutionTarget;
  read: ReadTarget;
}

interface WriteVerifiedBatchOptions {
  dependencies: WriteExecutionDependencies;
  hooks: WriteExecutionHooks | undefined;
  projectRoot: string;
  permission: WritePermission;
  targets: readonly WriteExecutionTarget[];
  reads: ReadTarget[];
  completedAt: string;
}

async function writeVerifiedBatch(
  options: WriteVerifiedBatchOptions,
): Promise<WriteExecutionResult> {
  const { targets, reads, completedAt } = options;
  const results: WriteExecutionTargetResult[] = targets.map((target) => ({
    path: target.path,
    status: 'unchanged',
    code: null,
    observedSha256: null,
    verification: 'not_attempted',
  }));
  const written: WrittenTarget[] = [];

  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    const read = reads[index];
    if (target === undefined || read === undefined) {
      return finalizeResult(
        buildResult(
          results,
          'unknown',
          'UNKNOWN',
          'not_attempted',
          'not_needed',
          completedAt,
        ),
      );
    }

    try {
      await writeFileAtomic(read.absolutePath, target.content);
    } catch {
      // A failed atomic write may still have landed (the rename is the last
      // step). Only a read-back decides which state the file is in.
      const current = await tryReadState(read.absolutePath);
      const landed =
        current !== null &&
        current.bytes === target.after.bytes &&
        current.sha256 === target.after.sha256;
      if (!landed) {
        const unchanged =
          current !== null &&
          current.bytes === target.before.bytes &&
          current.sha256 === target.before.sha256;
        results[index] = {
          path: target.path,
          status: unchanged ? 'failed' : 'unknown',
          code: unchanged ? 'WRITE_FAILED' : 'UNKNOWN',
          observedSha256: current?.sha256 ?? null,
          verification: 'not_attempted',
        };
        return failBatch({
          ...options,
          results,
          written,
          status: unchanged ? 'failed' : 'unknown',
          code: unchanged ? 'WRITE_FAILED' : 'UNKNOWN',
        });
      }
    }

    // From here the bytes have landed (a thrown write may still have renamed
    // its temporary file into place); record the entry before reading it back.
    written.push({ index, target, read });
    await options.hooks?.afterWrite?.(target.path).catch(() => undefined);

    const observed = await tryReadState(read.absolutePath);
    if (
      observed?.bytes !== target.after.bytes ||
      observed.sha256 !== target.after.sha256
    ) {
      results[index] = {
        path: target.path,
        status: 'verification_failed',
        code: 'VERIFY_FAILED',
        observedSha256: observed?.sha256 ?? null,
        verification: 'failed',
      };
      // §2.5/§4.4: stop here, keep the scene, and leave recovery to #20. A
      // compensating write could overwrite a foreign edit made after our write.
      return finalizeResult(
        buildResult(
          results,
          'verification_failed',
          'VERIFY_FAILED',
          'failed',
          'not_needed',
          completedAt,
        ),
      );
    }

    results[index] = {
      path: target.path,
      status: 'applied',
      code: null,
      observedSha256: observed.sha256,
      verification: 'verified_after',
    };
  }

  return finalizeResult(
    buildResult(
      results,
      'applied',
      null,
      'verified',
      'not_needed',
      completedAt,
    ),
  );
}

function failBatch(
  options: WriteVerifiedBatchOptions & {
    results: WriteExecutionTargetResult[];
    written: WrittenTarget[];
    status: 'failed' | 'unknown';
    code: WriteExecutionCode;
  },
): WriteExecutionResult {
  // No automatic rollback: already-written targets stay as they are and the
  // batch reports what actually happened. Recovery is a separate #20 action.
  return finalizeResult(
    buildResult(
      options.results,
      options.status,
      options.code,
      options.written.length === 0 ? 'not_attempted' : 'failed',
      'not_needed',
      options.completedAt,
    ),
  );
}

function writeTimeState(
  target: WriteExecutionTarget,
  read: ReadTarget,
): WriteTargetState {
  if (!sameFileState(read.state, target.before)) return 'changed';
  if (target.identity !== null) {
    if (read.identity === null) return 'identity_unavailable';
    if (!sameFileIdentity(target.identity, read.identity)) return 'replaced';
  }
  return 'unchanged';
}

interface ResolvedProjectPath {
  absolutePath: string;
  exists: boolean;
}

type ResolveProjectPathResult =
  | { ok: true; value: ResolvedProjectPath }
  | { ok: false; state: WriteTargetState };

/**
 * Resolves a plain project-relative path without following any link. The root
 * must be an absolute, non-link directory whose canonical path is itself; every
 * parent component must be a real directory inside that root; the leaf, when
 * present, must be a regular single-link file. Sensitive and hidden names stay
 * refused unless the permission explicitly allows that protected path.
 */
async function resolveProjectPath(
  projectRoot: string,
  targetPath: WriteTargetPath,
  permission: WritePermission,
): Promise<ResolveProjectPathResult> {
  const root = normalizeRootPath(projectRoot);
  if (!isAbsolute(projectRoot) || root === parse(root).root) {
    return { ok: false, state: 'unreadable' };
  }
  try {
    const rootStat = await lstat(root);
    if (
      rootStat.isSymbolicLink() ||
      !rootStat.isDirectory() ||
      relative(root, await realpath(root)) !== ''
    ) {
      return { ok: false, state: 'unreadable' };
    }
  } catch {
    return { ok: false, state: 'unreadable' };
  }

  const parts = targetPath.split('/');
  const allowance = observationAllowance(permission);
  const sensitive = parts.some((part) => isSensitiveEntryName(part));
  if (sensitive && !matchesProtectedPath(targetPath, allowance)) {
    return { ok: false, state: 'unreadable' };
  }

  let current = root;
  for (const part of parts.slice(0, -1)) {
    current = join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink()) {
        return { ok: false, state: 'link_not_allowed' };
      }
      const canonical = await realpath(current);
      if (!isPathInsideRoot(root, canonical)) {
        return { ok: false, state: 'link_not_allowed' };
      }
      if (relative(current, canonical) !== '') {
        return { ok: false, state: 'link_not_allowed' };
      }
    } catch (error) {
      return {
        ok: false,
        state: isNotFound(error) ? 'missing' : 'unreadable',
      };
    }
  }

  const leaf = parts[parts.length - 1];
  if (leaf === undefined) return { ok: false, state: 'unreadable' };
  const absolutePath = join(current, leaf);
  try {
    const leafStat = await lstat(absolutePath);
    if (leafStat.isSymbolicLink()) {
      return { ok: false, state: 'link_not_allowed' };
    }
    if (!leafStat.isFile()) return { ok: false, state: 'not_regular_file' };
    if (leafStat.nlink !== 1) {
      return { ok: false, state: 'link_not_allowed' };
    }
    return { ok: true, value: { absolutePath, exists: true } };
  } catch (error) {
    if (isNotFound(error)) {
      return { ok: true, value: { absolutePath, exists: false } };
    }
    return { ok: false, state: 'unreadable' };
  }
}

type ReadProjectTargetResult =
  { ok: true; value: ReadTarget } | { ok: false; state: WriteTargetState };

/** Reads one target through the shared stable reader and proves exact text. */
async function readProjectTarget(
  projectRoot: string,
  targetPath: WriteTargetPath,
  permission: WritePermission,
): Promise<ReadProjectTargetResult> {
  const resolved = await resolveProjectPath(
    projectRoot,
    targetPath,
    permission,
  );
  if (!resolved.ok) return { ok: false, state: resolved.state };
  if (!resolved.value.exists) return { ok: false, state: 'missing' };
  try {
    const read = await readStableFile(
      resolved.value.absolutePath,
      WRITE_LIMITS.targetBytes,
    );
    const bytes = Buffer.from(read.buffer.subarray(0, read.bytesRead));
    const text = bytes.toString('utf8');
    // Only text that survives decode→encode byte-for-byte is writable; this is
    // what makes the compensating restore exact rather than lossy.
    if (!Buffer.from(text, 'utf8').equals(bytes)) {
      return { ok: false, state: 'unreadable' };
    }
    return {
      ok: true,
      value: {
        absolutePath: resolved.value.absolutePath,
        state: {
          kind: 'file',
          bytes: read.bytesRead,
          sha256: sha256OfBytes(bytes),
        },
        identity: identityOf(read.before),
        text,
      },
    };
  } catch (error) {
    return {
      ok: false,
      state:
        error instanceof BoundedReadError
          ? readFailureState(error.code)
          : isNotFound(error)
            ? 'missing'
            : 'unreadable',
    };
  }
}

async function tryReadState(
  absolutePath: string,
): Promise<WriteFileState | null> {
  try {
    const read = await readStableFile(absolutePath, WRITE_LIMITS.targetBytes);
    return {
      kind: 'file',
      bytes: read.bytesRead,
      sha256: sha256OfBytes(read.buffer.subarray(0, read.bytesRead)),
    };
  } catch {
    return null;
  }
}

function identityOf(stats: {
  ino: number;
  birthtimeMs: number;
}): WriteFileIdentity | null {
  if (stats.ino === 0 || stats.birthtimeMs === 0) return null;
  return { fileId: String(stats.ino), birthtimeMs: stats.birthtimeMs };
}

function readFailureState(code: BoundedReadError['code']): WriteTargetState {
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

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  );
}

function prepareRefusalCode(state: WriteTargetState): WriteReviewDenialCode {
  switch (state) {
    case 'missing':
      return 'TARGET_MISSING';
    case 'not_regular_file':
      return 'TARGET_NOT_REGULAR_FILE';
    case 'link_not_allowed':
      return 'TARGET_LINK_NOT_ALLOWED';
    case 'too_large':
      return 'TARGET_TOO_LARGE';
    case 'unstable':
      return 'TARGET_UNSTABLE';
    default:
      return 'TARGET_UNREADABLE';
  }
}

function reviewRefusal(code: WriteReviewDenialCode): WriteReviewReply {
  return WriteReviewReplySchema.parse({ ok: false, code });
}

function resultOf(
  targets: WriteExecutionTargetResult[],
  status: WriteExecutionResult['status'],
  code: WriteExecutionCode,
  completedAt: string,
): WriteExecutionResult {
  return {
    version: WRITE_EXECUTION_VERSION,
    ok: false,
    status,
    code,
    permissionCode: null,
    targets,
    verification: 'not_attempted',
    restore: 'not_attempted',
    completedAt,
  };
}

function permissionRefusal(
  targets: readonly WriteExecutionTarget[],
  code: WritePermissionDenialCode,
  completedAt: string,
): WriteExecutionResult {
  return {
    version: WRITE_EXECUTION_VERSION,
    ok: false,
    status: 'rejected',
    code: 'PERMISSION_DENIED',
    permissionCode: code,
    targets: rejectedOutcomesFrom(permissionDeniedOutcomes(targets)),
    verification: 'not_attempted',
    restore: 'not_attempted',
    completedAt,
  };
}

function rejectEveryTarget(
  targets: readonly WriteExecutionTarget[],
  code: WriteExecutionCode,
  completedAt: string,
): WriteExecutionResult {
  return {
    version: WRITE_EXECUTION_VERSION,
    ok: false,
    status: 'rejected',
    code,
    permissionCode: null,
    targets: targets.map((target) => ({
      path: target.path,
      status: 'rejected',
      code,
      observedSha256: null,
      verification: 'not_attempted',
    })),
    verification: 'not_attempted',
    restore: 'not_attempted',
    completedAt,
  };
}

function rejectedTargetsResult(
  code: WriteRejectionCode,
  outcomes: readonly WriteTargetOutcome[],
  completedAt: string,
): WriteExecutionResult {
  return {
    version: WRITE_EXECUTION_VERSION,
    ok: false,
    status: 'rejected',
    code,
    permissionCode: null,
    targets: rejectedOutcomesFrom(outcomes),
    verification: 'not_attempted',
    restore: 'not_attempted',
    completedAt,
  };
}

function rejectedOutcomesFrom(
  outcomes: readonly WriteTargetOutcome[],
): WriteExecutionTargetResult[] {
  return outcomes.map((outcome) => ({
    path: outcome.path,
    status: outcome.status,
    code: outcome.code,
    observedSha256: null,
    verification: 'not_attempted',
  }));
}

function buildResult(
  targets: WriteExecutionTargetResult[],
  status: WriteExecutionResult['status'],
  code: WriteExecutionCode | null,
  verification: WriteExecutionResult['verification'],
  restore: WriteExecutionResult['restore'],
  completedAt: string,
): WriteExecutionResult {
  return {
    version: WRITE_EXECUTION_VERSION,
    ok:
      status === 'applied' &&
      verification === 'verified' &&
      targets.length > 0 &&
      targets.every((target) => target.status === 'applied'),
    status,
    code,
    permissionCode: null,
    targets,
    verification,
    restore,
    completedAt,
  };
}

function finalizeResult(result: WriteExecutionResult): WriteExecutionResult {
  const parsed = WriteExecutionResultSchema.safeParse(result);
  if (parsed.success) return parsed.data;
  return {
    version: WRITE_EXECUTION_VERSION,
    ok: false,
    status: 'failed',
    code: 'UNKNOWN',
    permissionCode: null,
    targets: [],
    verification: 'not_attempted',
    restore: 'not_attempted',
    completedAt: result.completedAt,
  };
}

function executionRefusal(
  code: WriteExecutionCode,
  now: Date,
): WriteExecutionResult {
  return finalizeResult(resultOf([], 'rejected', code, now.toISOString()));
}

function sameControlledRequest(
  left: WriteExecutionRequest,
  right: WriteExecutionRequest,
): boolean {
  if (
    left.sessionId !== right.sessionId ||
    left.projectId !== right.projectId ||
    left.windowEpoch !== right.windowEpoch ||
    left.targets.length !== right.targets.length
  ) {
    return false;
  }
  if (!samePermission(left.permission, right.permission)) return false;
  return left.targets.every((target, index) => {
    const other = right.targets[index];
    if (other === undefined) return false;
    return (
      target.path === other.path &&
      target.content === other.content &&
      sameFileState(target.before, other.before) &&
      sameFileState(target.after, other.after) &&
      sameIdentity(target.identity, other.identity)
    );
  });
}

function samePermission(
  left: WriteExecutionRequest['permission'],
  right: WriteExecutionRequest['permission'],
): boolean {
  if (
    left.sessionId !== right.sessionId ||
    left.projectId !== right.projectId ||
    left.mode !== right.mode ||
    left.webContentsId !== right.webContentsId ||
    left.windowEpoch !== right.windowEpoch ||
    left.grantedAt !== right.grantedAt ||
    left.riskAcknowledged !== right.riskAcknowledged
  ) {
    return false;
  }
  const sameProtected =
    left.protectedPaths.length === right.protectedPaths.length &&
    left.protectedPaths.every(
      (path, index) => path === right.protectedPaths[index],
    );
  if (!sameProtected) return false;
  if (left.scope === 'all_targets' || right.scope === 'all_targets') {
    return left.scope === right.scope;
  }
  return (
    left.scope.length === right.scope.length &&
    left.scope.every((path, index) => path === right.scope[index])
  );
}

function sameIdentity(
  left: WriteFileIdentity | null,
  right: WriteFileIdentity | null,
): boolean {
  if (left === null || right === null) return left === right;
  return sameFileIdentity(left, right);
}

/**
 * Exported for the contract probes: a deterministic result body for a request
 * that never reached the executor (untrusted sender, malformed payload).
 */
export function refusedExecution(
  code: WriteExecutionCode,
  now: Date = new Date(),
): WriteExecutionResult {
  return executionRefusal(code, now);
}

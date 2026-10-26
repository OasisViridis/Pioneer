import { createHash, randomBytes } from 'node:crypto';

import {
  RUN_LIMITS,
  type RunEvent,
  type RunEventBody,
  type RunFailureCode,
  type RunIdentity,
  type RunStartRequest,
  type RunStatus,
} from '../../shared/contracts/pioneer-run';
import type { RunEventBatch, RunPage } from '../../shared/contracts/run-ipc';
import type { ReadOnlyToolRequest } from '../../shared/contracts/read-only-tools';
import type { RunJournal } from './run-journal';
import type {
  AdapterMessage,
  AdapterOutcome,
  HarnessAdapterFactory,
  HarnessEmit,
  HarnessHandle,
} from './adapter-seam';
import { executeReadOnlyTool, type ToolOutcome } from './read-only-tools';

/**
 * Main-owned run host for the P2 read-only harness. Implements the run
 * contract v1 (revised §3/§4 stop semantics): serial admission, single-use
 * grants, capacity limits, bounded event buffers with acknowledged push
 * batches, and stopping → stopped/failed only. `unknown` exists exclusively
 * as the host_restarted tombstone restored from the journal.
 */

export type AdmissionCode =
  | 'INVALID_REQUEST'
  | 'BINDING_MISMATCH'
  | 'STALE_REVISION'
  | 'REQUEST_CONFLICT'
  | 'AUTHORIZATION_REQUIRED'
  | 'RUN_ACTIVE'
  | 'CAPACITY_EXCEEDED'
  | 'JOURNAL_UNAVAILABLE'
  | 'START_FAILED';

export interface RunAuthorizationRequest {
  sessionId: string;
  projectId: string;
  revision: number;
  task: string;
  webContentsId: number;
  windowEpoch: number;
}

export interface RunAuthorization {
  grantId: string;
  taskDigest: string;
  projectName: string;
  tools: readonly ('read_file' | 'list_directory' | 'search_in_files')[];
  adapter: 'controlled' | 'pi';
  model: string | null;
  expiresAt: string;
}

export interface ProjectBinding {
  root: string;
  projectName: string;
}

/** RUN_LIMITS with widened numeric fields so tests can override timers. */
export type RunLimits = { readonly [K in keyof typeof RUN_LIMITS]: number };

export interface WindowBindingPort {
  epochFor(webContentsId: number): number | null;
}

export interface RunSenderPort {
  send(webContentsId: number, batch: RunEventBatch): void;
}

interface GrantRecord {
  grantId: string;
  sessionId: string;
  projectId: string;
  revision: number;
  taskDigest: string;
  task: string;
  webContentsId: number;
  windowEpoch: number;
  createdAt: number;
  expiresAt: number;
  consumed: boolean;
  revoked: boolean;
}

interface Subscriber {
  webContentsId: number;
  windowEpoch: number;
  afterSeq: number;
  ackedSeq: number;
  /** Highest seq this subscriber has actually been sent. */
  deliveredSeq: number;
  awaitingBatch: boolean;
  lastActivityAt: number;
}

interface ActiveRun {
  identity: RunIdentity;
  status: RunStatus;
  adapterKind: 'controlled' | 'pi';
  webContentsId: number;
  windowEpoch: number;
  taskDigest: string;
  requestId: string;
  requestPayload: string;
  events: RunEvent[];
  eventBytes: number;
  outputBytes: number;
  toolCalls: number;
  /** Serializes tool execution so at most one call is in flight (contract §5). */
  toolChain: Promise<void>;
  /** callIds published without their matching tool.result yet. */
  pendingToolCalls: Set<string>;
  terminalEmitted: boolean;
  preStartMessages: AdapterMessage[];
  grant: GrantRecord;
  abort: AbortController;
  handle: HarnessHandle | null;
  startedAt: number;
  stopRequestedAt: number | null;
  stopReason:
    | 'user'
    | 'window_closed'
    | 'deadline'
    | 'authorization_revoked'
    | 'host_failure'
    | null;
  pendingFailure: RunFailureCode | null;
  subscribers: Map<number, Subscriber>;
  /** Resolves once the accept record is durable (or definitively failed). */
  admission: Promise<boolean> | null;
  /** Terminal delivery waits for the durable terminal record (contract §4). */
  publishHeld: boolean;
  disposed: boolean;
  deadlineTimer: NodeJS.Timeout | null;
  stopTimer: NodeJS.Timeout | null;
  terminalAt: number | null;
  flushTimer: NodeJS.Timeout | null;
}

interface TombstonedRun {
  identity: RunIdentity;
  taskDigest: string;
  markedAt: string;
}

export interface RunManagerDependencies {
  journal: RunJournal;
  adapterFactory: HarnessAdapterFactory;
  adapterKind: 'controlled' | 'pi';
  adapterAvailable: boolean;
  modelName: string | null;
  resolveProject(projectId: string): Promise<ProjectBinding | null>;
  windowBindings: WindowBindingPort;
  sender: RunSenderPort;
  limits?: RunLimits;
  now?: () => number;
  randomId?: (prefix: string) => string;
}

const encoder = new TextEncoder();
const bytesOf = (value: string): number => encoder.encode(value).byteLength;

function defaultRandomId(prefix: string): string {
  return `${prefix}:${randomBytes(16).toString('hex')}`;
}

function taskDigestOf(task: string): string {
  return createHash('sha256').update(task, 'utf-8').digest('hex');
}

export class RunManager {
  private readonly grants = new Map<string, GrantRecord>();
  private readonly runs = new Map<string, ActiveRun>();
  private readonly runsBySession = new Map<string, Set<string>>();
  private readonly runsByWindow = new Map<string, Set<string>>();
  private readonly requestIndex = new Map<string, string>();
  private readonly tombstones = new Map<string, TombstonedRun>();
  private readonly sessionLastRevision = new Map<string, number>();
  private readonly limits: RunLimits;
  private readonly now: () => number;

  constructor(private readonly dependencies: RunManagerDependencies) {
    this.limits = dependencies.limits ?? RUN_LIMITS;
    // Contract §5 fixes single-tool concurrency at 1; the executor is a serial
    // chain, so refuse an override instead of silently ignoring it.
    if (this.limits.toolConcurrency !== 1)
      throw new Error('toolConcurrency budget is fixed at 1 (contract §5).');
    const injectedNow = dependencies.now;
    this.now = injectedNow ?? ((): number => Date.now());
  }

  /** Marks journal-restored accepted runs without a committed terminal. */
  restoreTombstone(input: {
    runId: string;
    sessionId: string;
    projectId: string;
    revision: number;
    taskDigest: string;
  }): void {
    this.tombstones.set(input.runId, {
      identity: {
        sessionId: input.sessionId,
        projectId: input.projectId,
        runId: input.runId,
        revision: input.revision,
      },
      taskDigest: input.taskDigest,
      markedAt: new Date().toISOString(),
    });
  }

  private randomId(prefix: string): string {
    return this.dependencies.randomId?.(prefix) ?? defaultRandomId(prefix);
  }

  async authorize(
    request: RunAuthorizationRequest,
  ): Promise<
    | { ok: true; authorization: RunAuthorization }
    | { ok: false; code: AdmissionCode }
  > {
    if (!this.dependencies.journal.isAvailable())
      return { ok: false, code: 'JOURNAL_UNAVAILABLE' };
    if (!this.dependencies.adapterAvailable)
      return { ok: false, code: 'AUTHORIZATION_REQUIRED' };
    if (bytesOf(request.task) > this.limits.inputBytes)
      return { ok: false, code: 'INVALID_REQUEST' };
    const project = await this.dependencies.resolveProject(request.projectId);
    if (project === null) return { ok: false, code: 'INVALID_REQUEST' };
    const epoch = this.dependencies.windowBindings.epochFor(
      request.webContentsId,
    );
    if (epoch === null || epoch !== request.windowEpoch)
      return { ok: false, code: 'BINDING_MISMATCH' };
    const lastRevision = this.sessionLastRevision.get(request.sessionId) ?? 0;
    if (request.revision < lastRevision)
      return { ok: false, code: 'STALE_REVISION' };

    const grantId = this.randomId('grant');
    const createdAt = this.now();
    const grant: GrantRecord = {
      grantId,
      sessionId: request.sessionId,
      projectId: request.projectId,
      revision: request.revision,
      taskDigest: taskDigestOf(request.task),
      task: request.task,
      webContentsId: request.webContentsId,
      windowEpoch: request.windowEpoch,
      createdAt,
      expiresAt: createdAt + this.limits.grantMs,
      consumed: false,
      revoked: false,
    };
    this.grants.set(grantId, grant);
    this.pruneGrants();
    this.sessionLastRevision.set(request.sessionId, request.revision);
    return {
      ok: true,
      authorization: {
        grantId,
        taskDigest: grant.taskDigest,
        projectName: project.projectName,
        tools: ['read_file', 'list_directory', 'search_in_files'],
        adapter: this.dependencies.adapterKind,
        model: this.dependencies.modelName,
        expiresAt: new Date(grant.expiresAt).toISOString(),
      },
    };
  }

  /**
   * Contract §1 replay rules: an identical requestId converges on its run, a
   * different payload is a conflict, and an evicted payload means a fresh
   * authorization is required. Never hands back a runId before its accept
   * record settled, so a failed journal write cannot leak a phantom run.
   */
  private async replay(
    requestId: string,
    payload: string,
  ): Promise<
    { ok: true; runId: string } | { ok: false; code: AdmissionCode } | null
  > {
    const previousRunId = this.requestIndex.get(requestId);
    if (previousRunId === undefined) return null;
    const run = this.runs.get(previousRunId);
    const previousPayload =
      run?.requestPayload ?? this.finishedPayloads.get(requestId) ?? null;
    if (previousPayload === null || run === undefined) {
      return { ok: false, code: 'AUTHORIZATION_REQUIRED' };
    }
    if (previousPayload !== payload) {
      return { ok: false, code: 'REQUEST_CONFLICT' };
    }
    if (run.admission !== null) {
      const accepted = await run.admission;
      if (!accepted) return { ok: false, code: 'JOURNAL_UNAVAILABLE' };
    }
    return { ok: true, runId: previousRunId };
  }

  async start(
    request: RunStartRequest,
    context: { webContentsId: number; windowEpoch: number },
  ): Promise<{ ok: true; runId: string } | { ok: false; code: AdmissionCode }> {
    if (!this.dependencies.journal.isAvailable())
      return { ok: false, code: 'JOURNAL_UNAVAILABLE' };
    const payload = JSON.stringify({
      sessionId: request.sessionId,
      projectId: request.projectId,
      expectedRevision: request.expectedRevision,
      requestId: request.requestId,
      grantId: request.grantId,
      webContentsId: context.webContentsId,
      windowEpoch: context.windowEpoch,
    });
    const replayed = await this.replay(request.requestId, payload);
    if (replayed !== null) return replayed;

    // The project lookup awaits main state, so it runs before the admission
    // section. Everything below must stay synchronous: with an await inside the
    // section two concurrent starts can both observe an idle session and an
    // unconsumed grant.
    const project = await this.dependencies.resolveProject(request.projectId);
    if (project === null) return { ok: false, code: 'INVALID_REQUEST' };

    // The reservation section below must not await: everything between the
    // grant check and the run registration stays synchronous. A duplicate
    // requestId yields to the winner here and then returns without reserving,
    // so the synchronous invariant only ever protects reserving paths.
    if (this.requestIndex.has(request.requestId)) {
      const replayed = await this.replay(request.requestId, payload);
      return replayed ?? { ok: false, code: 'AUTHORIZATION_REQUIRED' };
    }

    const grant = this.grants.get(request.grantId);
    if (
      grant === undefined ||
      grant.consumed ||
      grant.revoked ||
      grant.expiresAt <= this.now()
    )
      return { ok: false, code: 'AUTHORIZATION_REQUIRED' };
    if (
      grant.sessionId !== request.sessionId ||
      grant.projectId !== request.projectId ||
      grant.revision !== request.expectedRevision ||
      grant.webContentsId !== context.webContentsId ||
      grant.windowEpoch !== context.windowEpoch
    )
      return { ok: false, code: 'AUTHORIZATION_REQUIRED' };
    if (
      request.expectedRevision <
      (this.sessionLastRevision.get(request.sessionId) ?? 0)
    )
      return { ok: false, code: 'STALE_REVISION' };
    const task = grant.task;

    if (
      this.activeRunCountForSession(request.sessionId) >=
      this.limits.activePerSession
    )
      return { ok: false, code: 'RUN_ACTIVE' };
    if (
      this.activeRunsForWindow(context.webContentsId).length >=
      this.limits.activePerWindow
    )
      return { ok: false, code: 'CAPACITY_EXCEEDED' };
    if (this.activeRunCount() >= this.limits.activePerHost)
      return { ok: false, code: 'CAPACITY_EXCEEDED' };

    const runId = this.randomId('run');

    const run: ActiveRun = {
      identity: {
        sessionId: request.sessionId,
        projectId: request.projectId,
        runId,
        revision: request.expectedRevision,
      },
      status: 'starting',
      adapterKind: this.dependencies.adapterKind,
      webContentsId: context.webContentsId,
      windowEpoch: context.windowEpoch,
      taskDigest: grant.taskDigest,
      requestId: request.requestId,
      requestPayload: payload,
      events: [],
      eventBytes: 0,
      outputBytes: 0,
      toolCalls: 0,
      toolChain: Promise.resolve(),
      pendingToolCalls: new Set<string>(),
      publishHeld: false,
      disposed: false,
      admission: null,
      terminalEmitted: false,
      preStartMessages: [],
      grant,
      abort: new AbortController(),
      handle: null,
      startedAt: this.now(),
      stopRequestedAt: null,
      stopReason: null,
      pendingFailure: null,
      subscribers: new Map(),
      deadlineTimer: null,
      stopTimer: null,
      terminalAt: null,
      flushTimer: null,
    };
    this.runs.set(runId, run);
    this.indexRun(run);
    grant.consumed = true;
    this.requestIndex.set(request.requestId, runId);
    // Bounded idempotency history: the payload map keeps the replay answer,
    // this map only needs to survive long enough to find it.
    while (this.requestIndex.size > 512) {
      const oldest = this.requestIndex.keys().next().value;
      if (oldest === undefined) break;
      this.requestIndex.delete(oldest);
    }
    // The accepted event is buffered before any await so a stop racing the
    // journal write can never precede run.accepted in the sequence.
    this.emit(run, { type: 'run.accepted' }, 'host');

    // A concurrent duplicate replays only once this settles, so it can never
    // hand back a runId whose accept record was never written (contract §1).
    let settleAdmission: (accepted: boolean) => void = () => undefined;
    run.admission = new Promise<boolean>((resolve) => {
      settleAdmission = resolve;
    });
    let accepted = false;
    try {
      accepted = await this.dependencies.journal.appendAccept({
        kind: 'accept',
        runId,
        sessionId: request.sessionId,
        projectId: request.projectId,
        revision: request.expectedRevision,
        taskDigest: grant.taskDigest,
        adapter: run.adapterKind,
        windowEpoch: context.windowEpoch,
        rootRevision: 0,
        requestId: request.requestId,
        at: new Date().toISOString(),
      });
    } catch {
      accepted = false;
    } finally {
      settleAdmission(accepted);
    }
    if (!accepted) {
      this.unindexRun(run);
      this.runs.delete(runId);
      this.requestIndex.delete(request.requestId);
      return { ok: false, code: 'JOURNAL_UNAVAILABLE' };
    }
    if (run.stopRequestedAt !== null) {
      // Stopped during preparation: the late-constructed handle must not start.
      await this.terminateQuiet(run, 'stopped', null);
      return { ok: true, runId };
    }

    let handle: HarnessHandle;
    try {
      handle = this.constructAdapter(run, project, task);
    } catch {
      await this.terminateQuiet(run, 'failed', 'START_FAILED');
      return { ok: true, runId };
    }
    run.handle = handle;

    run.deadlineTimer = setTimeout(() => {
      this.requestStop(run, 'deadline');
    }, this.limits.runMs);

    void this.driveRun(run, handle);
    return { ok: true, runId };
  }

  private constructAdapter(
    run: ActiveRun,
    project: ProjectBinding,
    task: string,
  ): HarnessHandle {
    const emit: HarnessEmit = (message: AdapterMessage) => {
      this.acceptAdapterMessage(run, message);
    };
    const tools = {
      execute: async (request: ReadOnlyToolRequest): Promise<ToolOutcome> => {
        return this.executeTool(run, project, request);
      },
    };
    const context = {
      identity: run.identity,
      task,
      abort: run.abort.signal,
      tools,
    };
    return this.dependencies.adapterFactory(context, emit);
  }

  private async driveRun(run: ActiveRun, handle: HarnessHandle): Promise<void> {
    let startRun: Promise<AdapterOutcome>;
    try {
      startRun = handle.start();
    } catch {
      // Synchronous start failure never produces run.started.
      await this.terminateQuiet(run, 'failed', 'START_FAILED');
      return;
    }
    run.status = 'running';
    this.emit(run, { type: 'run.started' }, 'host');
    // Adapter emissions that raced ahead of run.started are buffered, not lost.
    for (const message of run.preStartMessages.splice(0)) {
      this.acceptAdapterMessage(run, message);
    }

    let outcome: AdapterOutcome;
    try {
      outcome = await startRun;
    } catch {
      outcome =
        run.stopRequestedAt !== null || run.abort.signal.aborted
          ? { status: 'aborted' }
          : { status: 'failure', code: 'MODEL_FAILED' };
    }
    let quiet = false;
    try {
      await handle.quiescent;
      quiet = true;
    } catch {
      quiet = false;
    }
    if (this.isTerminal(run)) return;
    if (!quiet) {
      // Quiescence was never positively confirmed; the stop-grace timer owns
      // the force end. Nothing else may invent a terminal state here.
      if (run.stopRequestedAt === null) this.requestStop(run, 'host_failure');
      return;
    }
    if (run.pendingFailure !== null) {
      await this.terminateQuiet(run, 'failed', run.pendingFailure);
      return;
    }
    if (run.stopRequestedAt !== null) {
      if (outcome.status === 'failure') {
        await this.terminateQuiet(run, 'failed', outcome.code);
      } else {
        await this.terminateQuiet(run, 'stopped', null);
      }
      return;
    }
    if (outcome.status === 'failure') {
      await this.terminateQuiet(run, 'failed', outcome.code);
      return;
    }
    await this.terminateQuiet(run, 'completed', null, {
      inputTokens:
        outcome.status === 'success' ? outcome.usage.inputTokens : null,
      outputTokens:
        outcome.status === 'success' ? outcome.usage.outputTokens : null,
    });
  }

  /** Quiescent path: publish the terminal outcome, then release the adapter. */
  private async terminateQuiet(
    run: ActiveRun,
    status: 'completed' | 'failed' | 'stopped',
    code: RunFailureCode | null,
    usage?: { inputTokens: number | null; outputTokens: number | null },
  ): Promise<void> {
    await this.terminate(run, status, code, usage);
    await this.disposeAdapter(run);
  }

  private acceptAdapterMessage(run: ActiveRun, message: AdapterMessage): void {
    if (this.isTerminal(run)) return;
    if (run.status === 'starting') {
      run.preStartMessages.push(message);
      return;
    }
    switch (message.type) {
      case 'text.delta': {
        if (bytesOf(message.text) > this.limits.textChunkBytes) {
          this.failWith(run, 'OUTPUT_LIMIT');
          return;
        }
        if (run.outputBytes + bytesOf(message.text) > this.limits.outputBytes) {
          this.failWith(run, 'OUTPUT_LIMIT');
          return;
        }
        run.outputBytes += bytesOf(message.text);
        this.emit(run, { type: 'text.delta', text: message.text }, 'model');
        return;
      }
      case 'tool.unknown': {
        // Contract §5 counts rejections against the same per-run budget; this
        // is the one rejection path no executor sits in front of.
        if (run.toolCalls >= this.limits.toolCalls) {
          this.exhaustToolBudget(run);
          return;
        }
        run.toolCalls += 1;
        const callId = `call:${String(run.toolCalls)}`;
        this.emit(run, { type: 'tool.requested', callId, tool: null }, 'tool');
        this.emit(
          run,
          {
            type: 'tool.result',
            callId,
            result: { status: 'rejected', code: 'TOOL_NOT_ALLOWED' },
          },
          'tool',
        );
        return;
      }
      default:
        return;
    }
  }

  private async executeTool(
    run: ActiveRun,
    project: ProjectBinding,
    request: ReadOnlyToolRequest,
  ): Promise<ToolOutcome> {
    // Contract §5: at most one tool call in flight per run. The chain tail is
    // the mutex; it is bounded by the call budget enforced below.
    const previous = run.toolChain;
    let release: () => void = () => undefined;
    run.toolChain = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      if (this.isTerminal(run) || run.stopRequestedAt !== null)
        return { status: 'cancelled', code: 'CANCELLED' };
      if (run.toolCalls >= this.limits.toolCalls) {
        // Contract §5: the budget counts rejected requests too, so the run
        // stops here instead of publishing a 33rd pair.
        this.exhaustToolBudget(run);
        return { status: 'rejected', code: 'BUDGET_EXCEEDED' };
      }
      run.toolCalls += 1;
      const callId = `call:${String(run.toolCalls)}`;
      this.emit(
        run,
        { type: 'tool.requested', callId, tool: request.tool },
        'tool',
      );
      run.pendingToolCalls.add(callId);
      try {
        const outcome = await executeReadOnlyTool(
          project.root,
          request,
          run.abort.signal,
        );
        // terminate() already published the cancelled pair for a run that
        // ended while this call was in flight.
        if (this.isTerminal(run))
          return { status: 'cancelled', code: 'CANCELLED' };
        if (outcome.status === 'succeeded') {
          run.outputBytes += bytesOf(outcome.text);
        }
        this.emit(
          run,
          { type: 'tool.result', callId, result: outcome },
          'tool',
        );
        return outcome;
      } finally {
        run.pendingToolCalls.delete(callId);
      }
    } finally {
      release();
    }
  }

  requestStop(
    run: ActiveRun,
    reason: NonNullable<ActiveRun['stopReason']>,
  ): boolean {
    if (this.isTerminal(run)) return false;
    if (run.stopRequestedAt !== null) return false;
    if (reason === 'deadline') run.pendingFailure = 'RUN_DEADLINE';
    if (reason === 'authorization_revoked')
      run.pendingFailure = 'AUTHORIZATION_REVOKED';
    run.stopRequestedAt = this.now();
    run.stopReason = reason;
    if (run.status !== 'starting') run.status = 'stopping';
    this.emit(run, { type: 'run.stop_requested', reason }, 'host');
    run.abort.abort();
    run.handle?.requestStop();
    if (run.deadlineTimer !== null) clearTimeout(run.deadlineTimer);
    run.stopTimer = setTimeout(() => {
      this.forceEnd(run);
    }, this.limits.stopGraceMs);
    return true;
  }

  /** Stop-grace expiry: the stopping path must converge to a fixed code. */
  private forceEnd(run: ActiveRun): void {
    if (this.isTerminal(run)) return;
    const code = run.pendingFailure ?? 'STOP_TIMEOUT';
    run.stopTimer = null;
    // Contract §2: dispose is the normal release after quiescence; the forced
    // end is not quiescent, but §4 still asks for a best-effort release.
    void this.terminate(run, 'failed', code).finally(() => {
      void this.disposeAdapter(run);
    });
  }

  /**
   * First confirmed failure wins (contract §4): a later budget or protocol
   * overflow must not rewrite the reason the run is already stopping for.
   */
  private failWith(run: ActiveRun, code: RunFailureCode): void {
    run.pendingFailure ??= code;
    this.requestStop(run, 'host_failure');
  }

  /** Shared budget stop so both tool paths converge identically (contract §5). */
  private exhaustToolBudget(run: ActiveRun): void {
    run.pendingFailure ??= 'TOOL_FAILED';
    this.requestStop(run, 'host_failure');
  }

  stop(input: {
    sessionId: string;
    projectId: string;
    runId: string;
    revision: number;
    webContentsId: number;
    windowEpoch: number;
  }):
    | { ok: true; status: RunStatus }
    | { ok: false; code: 'RUN_NOT_FOUND' | 'BINDING_MISMATCH' } {
    const run = this.runs.get(input.runId);
    if (run === undefined) {
      const tomb = this.tombstones.get(input.runId);
      if (tomb === undefined) return { ok: false, code: 'RUN_NOT_FOUND' };
      if (
        tomb.identity.sessionId !== input.sessionId ||
        tomb.identity.projectId !== input.projectId ||
        tomb.identity.revision !== input.revision
      )
        return { ok: false, code: 'BINDING_MISMATCH' };
      return { ok: true, status: 'unknown' };
    }
    if (
      run.webContentsId !== input.webContentsId ||
      run.windowEpoch !== input.windowEpoch ||
      run.identity.sessionId !== input.sessionId ||
      run.identity.projectId !== input.projectId ||
      run.identity.revision !== input.revision
    )
      return { ok: false, code: 'BINDING_MISMATCH' };
    if (this.isTerminal(run)) return { ok: true, status: run.status };
    this.requestStop(run, 'user');
    return { ok: true, status: run.status };
  }

  getRun(input: {
    sessionId: string;
    projectId: string;
    runId: string;
    revision: number;
    afterSeq: number;
    webContentsId: number;
    windowEpoch: number;
  }): RunPage | null {
    const run = this.runs.get(input.runId);
    if (run === undefined) {
      const tomb = this.tombstones.get(input.runId);
      if (tomb === undefined) return null;
      if (
        tomb.identity.sessionId !== input.sessionId ||
        tomb.identity.projectId !== input.projectId ||
        tomb.identity.revision !== input.revision
      )
        return null;
      return {
        identity: tomb.identity,
        status: 'unknown',
        lastSeq: 0,
        oldestSeq: 0,
        gap: false,
        events: [],
        nextAfterSeq: 0,
        hasMore: false,
      };
    }
    if (
      run.webContentsId !== input.webContentsId ||
      run.windowEpoch !== input.windowEpoch ||
      run.identity.sessionId !== input.sessionId ||
      run.identity.projectId !== input.projectId ||
      run.identity.revision !== input.revision
    )
      return null;
    return this.buildPage(run, input.afterSeq);
  }

  private buildPage(run: ActiveRun, afterSeq: number): RunPage {
    const lastSeq = run.events.at(-1)?.seq ?? 0;
    const oldestSeq = run.events[0]?.seq ?? lastSeq + 1;
    const gap = afterSeq < oldestSeq - 1 || afterSeq > lastSeq;
    const pending = run.events.filter((event) => event.seq > afterSeq);
    const page = pending.slice(0, this.limits.subscriberBatch);
    const nextAfterSeq = page.at(-1)?.seq ?? afterSeq;
    return {
      identity: run.identity,
      status: run.status,
      lastSeq,
      oldestSeq,
      gap,
      events: structuredClone(page),
      nextAfterSeq,
      hasMore: pending.length > page.length,
    };
  }

  subscribe(input: {
    sessionId: string;
    projectId: string;
    runId: string;
    revision: number;
    afterSeq: number;
    webContentsId: number;
    windowEpoch: number;
  }): boolean {
    const run = this.runs.get(input.runId);
    if (run === undefined) return false;
    if (
      run.webContentsId !== input.webContentsId ||
      run.windowEpoch !== input.windowEpoch ||
      run.identity.sessionId !== input.sessionId ||
      run.identity.projectId !== input.projectId ||
      run.identity.revision !== input.revision
    )
      return false;
    run.subscribers.set(input.webContentsId, {
      webContentsId: input.webContentsId,
      windowEpoch: input.windowEpoch,
      afterSeq: input.afterSeq,
      ackedSeq: input.afterSeq,
      deliveredSeq: input.afterSeq,
      awaitingBatch: false,
      lastActivityAt: this.now(),
    });
    this.flushSubscribers(run);
    return true;
  }

  acknowledge(input: {
    runId: string;
    webContentsId: number;
    afterSeq: number;
  }): void {
    const run = this.runs.get(input.runId);
    if (run === undefined) return;
    const subscriber = run.subscribers.get(input.webContentsId);
    if (subscriber === undefined) return;
    subscriber.lastActivityAt = this.now();
    subscriber.awaitingBatch = false;
    // ACKs are a cursor, never a promise: clamp to the last seq actually sent
    // to this subscriber. Clamping to the newest published seq would let an
    // over-claiming ACK skip the pages still queued for delivery.
    subscriber.ackedSeq = Math.min(
      Math.max(subscriber.ackedSeq, input.afterSeq),
      subscriber.deliveredSeq,
    );
    this.flushSubscribers(run);
  }

  unsubscribe(input: { runId: string; webContentsId: number }): void {
    this.runs.get(input.runId)?.subscribers.delete(input.webContentsId);
  }

  private flushSubscribers(run: ActiveRun): void {
    if (run.flushTimer !== null) return;
    run.flushTimer = setTimeout(() => {
      run.flushTimer = null;
      this.deliverBatches(run);
    }, 0);
  }

  private deliverBatches(run: ActiveRun): void {
    // Terminal events are held until the journal owns the terminal record, so
    // a durable-write failure cannot be reported as a converged run.
    if (run.publishHeld) return;
    const now = this.now();
    for (const subscriber of [...run.subscribers.values()]) {
      if (now - subscriber.lastActivityAt > this.limits.subscriberAckMs) {
        if (subscriber.awaitingBatch) {
          run.subscribers.delete(subscriber.webContentsId);
          continue;
        }
        subscriber.lastActivityAt = now;
      }
      if (subscriber.awaitingBatch) continue;
      const page = this.buildPage(run, subscriber.ackedSeq);
      if (page.events.length === 0) continue;
      subscriber.awaitingBatch = true;
      subscriber.deliveredSeq = page.nextAfterSeq;
      this.dependencies.sender.send(subscriber.webContentsId, { page });
    }
  }

  private emit(
    run: ActiveRun,
    body: RunEventBody,
    source: 'host' | 'model' | 'tool',
  ): void {
    if (run.terminalEmitted) return;
    const seq = (run.events.at(-1)?.seq ?? 0) + 1;
    const event: RunEvent = {
      ...run.identity,
      version: 1,
      seq,
      at: new Date().toISOString(),
      source,
      adapter: run.adapterKind,
      body,
    };
    const size = bytesOf(JSON.stringify(event));
    if (size > this.limits.eventBytes) {
      // Contract §5: the wire-event ceiling converges to OUTPUT_LIMIT, the same
      // budget family as the 4 KiB chunk rule.
      this.failWith(run, 'OUTPUT_LIMIT');
      return;
    }
    run.events.push(event);
    run.eventBytes += size;
    while (
      run.events.length > this.limits.retainedEvents ||
      run.eventBytes > this.limits.retainedBytes
    ) {
      const removed = run.events.shift();
      if (removed) run.eventBytes -= bytesOf(JSON.stringify(removed));
    }
    this.flushSubscribers(run);
  }

  private async terminate(
    run: ActiveRun,
    status: 'completed' | 'failed' | 'stopped',
    code: RunFailureCode | null,
    usage?: { inputTokens: number | null; outputTokens: number | null },
  ): Promise<void> {
    if (this.isTerminal(run)) return;
    if (run.deadlineTimer !== null) clearTimeout(run.deadlineTimer);
    if (run.stopTimer !== null) clearTimeout(run.stopTimer);
    // Hold delivery until the terminal record is durable (contract §4): a
    // write failure must not look like a converged run to the renderer.
    run.publishHeld = true;
    // Contract §4: a stop can land while a tool is in flight. Every published
    // tool.requested gets exactly one result before the terminal event; the
    // late real result is dropped instead of rewriting history.
    for (const callId of run.pendingToolCalls) {
      this.emit(
        run,
        {
          type: 'tool.result',
          callId,
          result: { status: 'cancelled', code: 'CANCELLED' },
        },
        'tool',
      );
    }
    run.pendingToolCalls.clear();
    run.status = status;
    run.terminalAt = this.now();
    if (status === 'completed') {
      this.emit(
        run,
        {
          type: 'run.completed',
          usage: usage ?? { inputTokens: null, outputTokens: null },
        },
        'host',
      );
    } else if (status === 'failed' && code !== null) {
      this.emit(run, { type: 'run.failed', code }, 'host');
    } else {
      this.emit(run, { type: 'run.stopped' }, 'host');
    }
    run.terminalEmitted = true;
    for (const subscriber of run.subscribers.values()) {
      subscriber.awaitingBatch = false;
    }
    // A throwing append must never strand the hold: the renderer has to see a
    // terminal state even when the journal write itself failed.
    try {
      await this.dependencies.journal.appendTerminal({
        kind: 'terminal',
        runId: run.identity.runId,
        status,
        code,
        at: new Date().toISOString(),
        lastSeq: run.events.at(-1)?.seq ?? 0,
      });
    } finally {
      run.publishHeld = false;
      this.deliverBatches(run);
    }
    this.finishedPayloads.set(run.requestId, run.requestPayload);
    while (this.finishedPayloads.size > 128) {
      const oldest = this.finishedPayloads.keys().next().value;
      if (oldest === undefined) break;
      this.finishedPayloads.delete(oldest);
    }
    this.releaseSlot(run);
  }

  private readonly finishedPayloads = new Map<string, string>();

  private releaseSlot(run: ActiveRun): void {
    // Terminal runs stay readable for the retention window, then are dropped.
    const retention = setTimeout(() => {
      this.runs.delete(run.identity.runId);
      this.grants.delete(run.grant.grantId);
      this.unindexRun(run);
    }, this.limits.terminalRetentionMs);
    retention.unref();
    // Bounded terminal history: at most `terminalRuns` finished runs retained.
    const terminalRuns = [...this.runs.values()].filter((candidate) =>
      this.isTerminal(candidate),
    );
    if (terminalRuns.length > this.limits.terminalRuns) {
      terminalRuns
        .sort((a, b) => (a.terminalAt ?? 0) - (b.terminalAt ?? 0))
        .slice(0, terminalRuns.length - this.limits.terminalRuns)
        .forEach((evicted) => {
          this.runs.delete(evicted.identity.runId);
          this.unindexRun(evicted);
        });
    }
  }

  private indexRun(run: ActiveRun): void {
    let bySession = this.runsBySession.get(run.identity.sessionId);
    if (bySession === undefined) {
      bySession = new Set();
      this.runsBySession.set(run.identity.sessionId, bySession);
    }
    bySession.add(run.identity.runId);
    const windowKey = String(run.webContentsId);
    let byWindow = this.runsByWindow.get(windowKey);
    if (byWindow === undefined) {
      byWindow = new Set();
      this.runsByWindow.set(windowKey, byWindow);
    }
    byWindow.add(run.identity.runId);
  }

  private unindexRun(run: ActiveRun): void {
    this.runsBySession.get(run.identity.sessionId)?.delete(run.identity.runId);
    this.runsByWindow
      .get(String(run.webContentsId))
      ?.delete(run.identity.runId);
  }

  private isTerminal(run: ActiveRun): boolean {
    return (
      run.status === 'completed' ||
      run.status === 'failed' ||
      run.status === 'stopped'
    );
  }

  private activeRunCountForSession(sessionId: string): number {
    let count = 0;
    for (const runId of this.runsBySession.get(sessionId) ?? []) {
      const run = this.runs.get(runId);
      if (run && !this.isTerminal(run)) count += 1;
    }
    return count;
  }

  /** Window closed, navigated away, or its renderer died (contract §4). */
  abandonWindow(webContentsId: number): void {
    for (const runId of [
      ...(this.runsByWindow.get(String(webContentsId)) ?? []),
    ]) {
      const run = this.runs.get(runId);
      if (run === undefined || this.isTerminal(run)) continue;
      this.requestStop(run, 'window_closed');
    }
  }

  /** Keeps the grant table bounded; a consumed/expired grant is never reusable. */
  private pruneGrants(): void {
    if (this.grants.size <= 64) return;
    const now = this.now();
    for (const [grantId, record] of this.grants) {
      if (this.grants.size <= 64) break;
      if (record.consumed || record.revoked || record.expiresAt <= now)
        this.grants.delete(grantId);
    }
  }

  private activeRunsForWindow(webContentsId: number): ActiveRun[] {
    return [...(this.runsByWindow.get(String(webContentsId)) ?? [])]
      .map((runId) => this.runs.get(runId))
      .filter(
        (run): run is ActiveRun => run !== undefined && !this.isTerminal(run),
      );
  }

  private activeRunCount(): number {
    let count = 0;
    for (const run of this.runs.values()) {
      if (!this.isTerminal(run)) count++;
    }
    return count;
  }

  /** App shutdown: bounded stop wait, then force end (contract §4). */
  async shutdown(): Promise<void> {
    for (const run of this.runs.values()) {
      if (!this.isTerminal(run)) this.requestStop(run, 'window_closed');
    }
    const deadline = this.now() + this.limits.stopGraceMs;
    while (this.now() < deadline) {
      if (![...this.runs.values()].some((run) => !this.isTerminal(run))) break;
      await new Promise((resolve) => {
        setTimeout(resolve, 25);
      });
    }
    for (const run of this.runs.values()) {
      if (!this.isTerminal(run))
        await this.terminate(run, 'failed', 'STOP_TIMEOUT');
      await this.disposeAdapter(run);
    }
  }

  /** Contract §2: dispose is the normal release path after quiescence. */
  private async disposeAdapter(run: ActiveRun): Promise<void> {
    if (run.disposed) return;
    run.disposed = true;
    await run.handle?.dispose().catch(() => undefined);
  }
}

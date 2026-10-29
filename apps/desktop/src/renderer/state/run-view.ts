import {
  classifyRunEvent,
  type RunEvent,
  type RunStatus,
} from '../../shared/contracts/pioneer-run';
import type {
  RunAuthorizeReply,
  RunAuthorizationSummary,
  RunEventBatch,
  RunPage,
} from '../../shared/contracts/run-ipc';
import type {
  RunContext,
  RunContextReply,
  RunSnapshot,
} from '../../shared/contracts/run-context';
import {
  MAX_SESSION_RUN_RESULT,
  type SessionRunRecord,
  type SessionRunStatus,
} from '../../shared/contracts/session-run-history';
import type { EgressCandidate } from '../../shared/contracts/egress';

/**
 * Per-session run view state for the workbench. The five user-visible
 * outcomes (运行中/正在停止/已停止/已完成/失败) come from the run layer's
 * status; the stop button's "停止中…" feedback is local to the view. Events stay
 * as validated raw `RunEvent`s so the Context / Capabilities / RunLog panels
 * can read callIds and statuses without a lossy display projection. Every
 * applied event is re-checked against the bound session and run identity, so a
 * foreign run can never leak into this session's panels.
 */

export type RunPhase =
  | 'idle'
  | 'authorizing'
  | 'starting'
  | 'active'
  | 'stopping'
  | 'terminal'
  | 'error';

export interface RunDisplayEvent {
  seq: number;
  kind: 'text' | 'tool-requested' | 'tool-result' | 'marker';
  text: string;
  tone: 'model' | 'tool' | 'host' | 'error';
}

export type RunContextState = 'idle' | 'loading' | 'ready' | 'unavailable';

export interface RunViewState {
  phase: RunPhase;
  runId: string | null;
  projectId: string | null;
  revision: number | null;
  status: RunStatus | null;
  failureCode: string | null;
  rejectionCode: string | null;
  summaryText: string | null;
  /** Main-generated authorization summary: approved materials and tools. */
  authorization: RunAuthorizationSummary | null;
  /** Main-generated context projection for the current run. */
  context: RunContext | null;
  contextState: RunContextState;
  /** The last context query failed (IPC or main error), not merely unavailable. */
  contextError: boolean;
  events: RunEvent[];
  omittedHistory: boolean;
  /** Events rejected by identity/schema checks; shown so nothing is silent. */
  ignoredEvents: number;
  /** Pages rejected by page-level identity checks; counted separately. */
  ignoredPages: number;
}

export interface RunPort {
  authorizeRun(request: {
    sessionId: string;
    projectId: string;
    expectedRevision: number;
    task: string;
    materials: string[];
  }): Promise<RunAuthorizeReply>;
  listRunMaterials(request: {
    projectId: string;
  }): Promise<
    | { ok: true; materials: EgressCandidate[] }
    | { ok: false; code: 'INVALID_REQUEST' }
  >;
  startRun(request: {
    sessionId: string;
    projectId: string;
    expectedRevision: number;
    requestId: string;
    grantId: string;
  }): Promise<{ ok: true; runId: string } | { ok: false; code: string }>;
  stopRun(request: {
    sessionId: string;
    projectId: string;
    runId: string;
    revision: number;
    requestId: string;
  }): Promise<{ ok: true; status: RunStatus } | { ok: false; code: string }>;
  getRun(request: {
    sessionId: string;
    projectId: string;
    runId: string;
    revision: number;
    afterSeq: number;
  }): Promise<{
    identity: {
      sessionId: string;
      projectId: string;
      runId: string;
      revision: number;
    };
    status: RunStatus;
    lastSeq: number;
    oldestSeq: number;
    gap: boolean;
    events: RunEvent[];
    nextAfterSeq: number;
    hasMore: boolean;
  } | null>;
  getRunContext(request: {
    sessionId: string;
    projectId: string;
    runId: string;
    revision: number;
  }): Promise<RunContextReply>;
  subscribeRun(request: {
    sessionId: string;
    projectId: string;
    runId: string;
    revision: number;
    afterSeq: number;
  }): Promise<boolean>;
  acknowledgeRunPage(request: {
    sessionId: string;
    projectId: string;
    runId: string;
    revision: number;
    afterSeq: number;
  }): Promise<void>;
  onRunEventBatch(callback: (batch: RunEventBatch) => void): () => void;
}

const failureCopy: Record<string, string> = {
  START_FAILED: '启动失败',
  MODEL_FAILED: '模型调用失败',
  TOOL_FAILED: '工具执行失败',
  PROTOCOL_ERROR: '协议错误',
  OUTPUT_LIMIT: '输出超出预算',
  RUN_DEADLINE: '运行超时',
  AUTHORIZATION_REVOKED: '授权已撤销',
  STOP_TIMEOUT: '停止超时（已强制结束）',
  ADAPTER_DISCONNECTED: '运行器连接断开',
};

export const failureText = (code: string): string =>
  failureCopy[code] ?? `失败（${code}）`;

const rejectionCopy: Record<string, string> = {
  INVALID_REQUEST: '请求无效',
  UNTRUSTED_SENDER: '来源不受信任',
  BINDING_MISMATCH: '窗口绑定不一致，请重试',
  STALE_REVISION: '任务修订已过期，请重新整理任务',
  REQUEST_CONFLICT: '请求冲突，请重试',
  AUTHORIZATION_REQUIRED: '缺少授权（真实模型未配置或未获准）',
  RUN_ACTIVE: '该会话已有运行中的任务',
  CAPACITY_EXCEEDED: '运行容量已满，请稍后再试',
  JOURNAL_UNAVAILABLE: '运行日志不可用，无法接受新任务',
  RUN_NOT_FOUND: '找不到该运行',
};

export const rejectionText = (code: string): string =>
  rejectionCopy[code] ?? `请求被拒绝（${code}）`;

const MAX_DISPLAY_EVENTS = 500;

export function describe(event: RunEvent): RunDisplayEvent | null {
  const body = event.body;
  switch (body.type) {
    case 'run.accepted':
      return {
        seq: event.seq,
        kind: 'marker',
        text: '已受理',
        tone: 'host',
      };
    case 'run.started':
      return {
        seq: event.seq,
        kind: 'marker',
        text: '开始运行',
        tone: 'host',
      };
    case 'text.delta':
      return { seq: event.seq, kind: 'text', text: body.text, tone: 'model' };
    case 'tool.requested':
      return {
        seq: event.seq,
        kind: 'tool-requested',
        text: body.tool ?? '未知工具',
        tone: 'tool',
      };
    case 'tool.result':
      if (body.result.status === 'succeeded') {
        return {
          seq: event.seq,
          kind: 'tool-result',
          text: body.result.truncated
            ? `${body.result.text}\n…（已截断）`
            : body.result.text,
          tone: 'tool',
        };
      }
      return {
        seq: event.seq,
        kind: 'tool-result',
        text: `${body.result.status} · ${body.result.code}`,
        tone: 'error',
      };
    case 'run.stop_requested':
      return {
        seq: event.seq,
        kind: 'marker',
        text: `停止请求（${body.reason}）`,
        tone: 'host',
      };
    case 'run.completed':
      return { seq: event.seq, kind: 'marker', text: '已完成', tone: 'host' };
    case 'run.failed':
      return {
        seq: event.seq,
        kind: 'marker',
        text: failureText(body.code),
        tone: 'error',
      };
    case 'run.stopped':
      return { seq: event.seq, kind: 'marker', text: '已停止', tone: 'host' };
    case 'run.unknown':
      return {
        seq: event.seq,
        kind: 'marker',
        text: '上次运行结果未确认（重启标注）',
        tone: 'host',
      };
    default:
      return null;
  }
}

/** Stable idle snapshot: useSyncExternalStore requires a cached default. */
const IDLE_STATE: RunViewState = {
  phase: 'idle',
  runId: null,
  projectId: null,
  revision: null,
  status: null,
  failureCode: null,
  rejectionCode: null,
  summaryText: null,
  authorization: null,
  context: null,
  contextState: 'idle',
  contextError: false,
  events: [],
  omittedHistory: false,
  ignoredEvents: 0,
  ignoredPages: 0,
};

/** Tiny per-session store; the workbench reads it via useSyncExternalStore. */
interface RunMeta {
  task: string;
  startedAt: string;
  stopRequestedAt: string | null;
  endedAt: string | null;
  status: SessionRunStatus | null;
  failureCode: string | null;
  resultText: string;
  truncated: boolean;
  recorded: boolean;
}

export class RunViewStore {
  private readonly states = new Map<string, RunViewState>();
  private readonly listeners = new Set<() => void>();
  private readonly lastSeqByRun = new Map<string, number>();
  private readonly runMeta = new Map<string, RunMeta>();
  private readonly terminalRecorders = new Map<
    string,
    (record: SessionRunRecord) => void
  >();
  private readonly snapshotRecorders = new Map<
    string,
    (snapshot: RunSnapshot) => void
  >();
  private port: RunPort;
  private batchUnsubscribe: (() => void) | null = null;
  private readonly boundSessions = new Set<string>();
  /** Serialized per-session context refreshes: the last queued read wins. */
  private readonly contextChains = new Map<string, Promise<void>>();

  constructor(port: RunPort) {
    this.port = port;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  get = (sessionId: string): RunViewState =>
    this.states.get(sessionId) ?? IDLE_STATE;

  private update(
    sessionId: string,
    patch:
      Partial<RunViewState> | ((state: RunViewState) => Partial<RunViewState>),
  ): void {
    const current = this.get(sessionId);
    const delta = typeof patch === 'function' ? patch(current) : patch;
    this.states.set(sessionId, { ...current, ...delta });
    for (const listener of this.listeners) listener();
  }

  /** Single global batch listener; multiplexed by runId. */
  private ensureBatchListener(): void {
    if (this.batchUnsubscribe !== null) return;
    this.batchUnsubscribe = this.port.onRunEventBatch((batch) => {
      void this.ingestBatch(batch);
    });
  }

  private sessionForRun(runId: string): string | undefined {
    return [...this.states.entries()]
      .filter(([, value]) => value.runId === runId)
      .map(([key]) => key)[0];
  }

  /**
   * The first page of a run is as untrusted as a pushed batch: check its page
   * identity and every event before anything reaches this session's panels.
   * Returns null when the page names another session, project, run or revision.
   */
  private acceptPage(input: {
    sessionId: string;
    projectId: string;
    runId: string;
    revision: number;
    page: RunPage;
  }): RunEvent[] | null {
    const identity = {
      sessionId: input.sessionId,
      projectId: input.projectId,
      runId: input.runId,
      revision: input.revision,
    };
    const pageIdentity = input.page.identity;
    if (
      pageIdentity.sessionId !== identity.sessionId ||
      pageIdentity.projectId !== identity.projectId ||
      pageIdentity.runId !== identity.runId ||
      pageIdentity.revision !== identity.revision
    ) {
      this.update(input.sessionId, (current) => ({
        ignoredPages: current.ignoredPages + 1,
      }));
      return null;
    }
    const fresh: RunEvent[] = [];
    let cursor = 0;
    let ignored = 0;
    for (const event of input.page.events) {
      const verdict = classifyRunEvent(identity, cursor, event);
      if (verdict === 'duplicate') continue;
      if (verdict === 'foreign' || verdict === 'invalid') {
        ignored += 1;
        continue;
      }
      if (verdict === 'gap')
        this.update(input.sessionId, { omittedHistory: true });
      fresh.push(event);
      cursor = event.seq;
    }
    if (ignored > 0)
      this.update(input.sessionId, (current) => ({
        ignoredEvents: current.ignoredEvents + ignored,
      }));
    return fresh;
  }

  private async ingestBatch(batch: RunEventBatch): Promise<void> {
    const received = batch.page.identity;
    const sessionId = this.sessionForRun(received.runId);
    if (sessionId === undefined) return;
    const state = this.get(sessionId);
    // Compare against the locally bound identity, not the page's own claim:
    // a page reusing the runId/revision but naming another session or project
    // must not reach this session's panels.
    if (
      state.runId !== received.runId ||
      state.revision !== received.revision ||
      state.projectId === null ||
      received.sessionId !== sessionId ||
      received.projectId !== state.projectId
    ) {
      // The page names another identity: count it so the panel can say that
      // something was dropped instead of silently showing a shorter stream.
      this.update(sessionId, (current) => ({
        ignoredPages: current.ignoredPages + 1,
      }));
      return;
    }
    const identity = {
      sessionId,
      projectId: state.projectId,
      runId: received.runId,
      revision: received.revision,
    };
    let cursor = this.lastSeqByRun.get(identity.runId) ?? 0;
    let ignored = 0;
    const fresh: RunEvent[] = [];
    for (const event of batch.page.events) {
      const verdict = classifyRunEvent(identity, cursor, event);
      if (verdict === 'duplicate') continue;
      if (verdict === 'foreign' || verdict === 'invalid') {
        ignored += 1;
        continue;
      }
      if (verdict === 'gap') this.update(sessionId, { omittedHistory: true });
      fresh.push(event);
      cursor = event.seq;
    }
    if (batch.page.gap) {
      this.update(sessionId, { omittedHistory: true });
    }
    if (ignored > 0) {
      this.update(sessionId, (current) => ({
        ignoredEvents: current.ignoredEvents + ignored,
      }));
    }
    this.captureRunMeta(identity.runId, fresh);
    this.applyEvents(sessionId, fresh);
    const status = batch.page.status;
    const terminal =
      status === 'completed' || status === 'failed' || status === 'stopped';
    this.update(sessionId, {
      status,
      phase: terminal ? 'terminal' : this.get(sessionId).phase,
    });
    if (terminal) {
      this.recordTerminal(sessionId, identity.runId);
      void this.refreshContext(sessionId).then(() => {
        // Only a main-verified projection may become the restart summary; a
        // failed or missing query leaves the previous snapshot untouched.
        this.captureSnapshot(sessionId);
      });
    } else if (fresh.some((event) => event.body.type.startsWith('tool.'))) {
      void this.refreshContext(sessionId);
    }
    this.advanceCursor(identity.runId, batch.page.nextAfterSeq);
    await this.port.acknowledgeRunPage({
      sessionId: identity.sessionId,
      projectId: identity.projectId,
      runId: identity.runId,
      revision: identity.revision,
      afterSeq: batch.page.nextAfterSeq,
    });
  }

  /** Captures the durable task/result summary while wire events are fresh. */
  private captureRunMeta(runId: string, events: RunEvent[]): void {
    const meta = this.runMeta.get(runId);
    if (meta === undefined) return;
    for (const event of events) {
      const body = event.body;
      switch (body.type) {
        case 'run.accepted':
        case 'run.started':
          if (meta.startedAt.length === 0) meta.startedAt = event.at;
          break;
        case 'text.delta': {
          if (meta.resultText.length >= MAX_SESSION_RUN_RESULT) {
            meta.truncated = true;
            break;
          }
          const remaining = MAX_SESSION_RUN_RESULT - meta.resultText.length;
          const text = body.text.slice(0, remaining);
          if (text.length < body.text.length) meta.truncated = true;
          meta.resultText += text;
          break;
        }
        case 'run.stop_requested':
          meta.stopRequestedAt ??= event.at;
          break;
        case 'run.completed':
          meta.status = 'completed';
          meta.endedAt = event.at;
          break;
        case 'run.stopped':
          meta.status = 'stopped';
          meta.endedAt = event.at;
          break;
        case 'run.failed':
          meta.status = 'failed';
          meta.failureCode = body.code;
          meta.endedAt = event.at;
          break;
        default:
          break;
      }
    }
  }

  private recordTerminal(sessionId: string, runId: string): void {
    const meta = this.runMeta.get(runId);
    if (meta === undefined || meta.recorded || meta.status === null) return;
    meta.recorded = true;
    const record: SessionRunRecord = {
      runId,
      task: meta.task,
      status: meta.status,
      failureCode: meta.failureCode,
      startedAt: meta.startedAt || new Date().toISOString(),
      endedAt: meta.endedAt ?? new Date().toISOString(),
      stopRequestedAt: meta.stopRequestedAt,
      resultText: meta.resultText,
      truncated: meta.truncated,
    };
    this.terminalRecorders.get(sessionId)?.(record);
    this.runMeta.delete(runId);
  }

  /**
   * Persists a bounded summary of the terminal run with the session, so the
   * panels can still name the right Session/Run after a restart. Only a
   * main-confirmed context becomes a summary: a failed or missing query leaves
   * the previous summary untouched instead of inventing one.
   */
  private captureSnapshot(sessionId: string): void {
    const record = this.snapshotRecorders.get(sessionId);
    if (record === undefined) return;
    const state = this.get(sessionId);
    if (
      state.runId === null ||
      state.projectId === null ||
      state.revision === null ||
      state.status === null ||
      state.context === null ||
      state.contextState !== 'ready'
    )
      return;
    const status = state.status;
    if (status !== 'completed' && status !== 'failed' && status !== 'stopped')
      return;
    const context = state.context;
    record({
      identity: {
        sessionId,
        projectId: state.projectId,
        runId: state.runId,
        revision: state.revision,
      },
      status,
      tools: state.authorization?.tools ?? [],
      materials: context.materials,
      calls: context.calls,
      recordedAt: new Date().toISOString(),
    });
  }

  /**
   * Track what main actually delivered, not its newest seq: a partly filled
   * page (hasMore) must leave the cursor at `nextAfterSeq`, otherwise the
   * follow-up page is filtered out as already seen.
   */
  private advanceCursor(runId: string, nextAfterSeq: number): void {
    const current = this.lastSeqByRun.get(runId) ?? 0;
    this.lastSeqByRun.set(runId, Math.max(current, nextAfterSeq));
  }

  private applyEvents(sessionId: string, events: RunEvent[]): void {
    if (events.length === 0) return;
    this.update(sessionId, (state) => {
      const existing = new Set(state.events.map((event) => event.seq));
      const incoming = events.filter((event) => !existing.has(event.seq));
      // The display cap drops the oldest events; say so instead of silently
      // serving a short list as if it were complete.
      const overflow =
        state.events.length + incoming.length > MAX_DISPLAY_EVENTS;
      const merged = [...state.events, ...incoming]
        .sort((a, b) => a.seq - b.seq)
        .slice(-MAX_DISPLAY_EVENTS);
      const failure = events.find((event) => event.body.type === 'run.failed');
      return {
        events: merged,
        omittedHistory: state.omittedHistory || overflow,
        failureCode:
          failure?.body.type === 'run.failed'
            ? failure.body.code
            : state.failureCode,
      };
    });
  }

  async materials(projectId: string): Promise<EgressCandidate[]> {
    const reply = await this.port.listRunMaterials({ projectId });
    return reply.ok ? reply.materials : [];
  }

  /**
   * Fetches main's context projection for the current run, if one is bound.
   * Refreshes are serialized per session so two overlapping tool-result batches
   * cannot drop the later read; every caller's promise resolves after its own
   * fetch, which keeps the terminal snapshot from capturing an older context.
   */
  refreshContext(sessionId: string): Promise<void> {
    const prior = this.contextChains.get(sessionId) ?? Promise.resolve();
    const next = prior
      .catch(() => undefined)
      .then(() => this.doRefreshContext(sessionId));
    this.contextChains.set(sessionId, next);
    return next.finally(() => {
      if (this.contextChains.get(sessionId) === next)
        this.contextChains.delete(sessionId);
    });
  }

  private async doRefreshContext(sessionId: string): Promise<void> {
    const state = this.get(sessionId);
    const runId = state.runId;
    const revision = state.revision;
    const projectId = state.projectId;
    if (runId === null || revision === null || projectId === null) return;
    // Keep the last successful projection visible while refreshing; only the
    // very first read shows the loading copy.
    if (state.contextState !== 'ready')
      this.update(sessionId, { contextState: 'loading' });
    try {
      const reply = await this.port.getRunContext({
        sessionId,
        projectId,
        runId,
        revision,
      });
      const current = this.get(sessionId);
      if (current.runId !== runId) return;
      if (reply.ok) {
        this.update(sessionId, {
          context: reply.context,
          contextState: 'ready',
          contextError: false,
        });
      } else {
        this.update(sessionId, {
          context: null,
          contextState: 'unavailable',
          contextError: false,
        });
      }
    } catch {
      const current = this.get(sessionId);
      if (current.runId !== runId) return;
      this.update(sessionId, {
        context: null,
        contextState: 'unavailable',
        contextError: true,
      });
    }
  }

  async launch(input: {
    sessionId: string;
    projectId: string;
    revision: number;
    task: string;
    materials: string[];
    summaryText?: string;
    onTerminal?: (record: SessionRunRecord) => void;
    onSnapshot?: (snapshot: RunSnapshot) => void;
    onStarted?: (revision: number) => void;
  }): Promise<void> {
    this.ensureBatchListener();
    if (this.boundSessions.has(input.sessionId)) return;
    const active = this.get(input.sessionId);
    if (active.phase === 'active' || active.phase === 'stopping') return;
    this.boundSessions.add(input.sessionId);
    try {
      this.update(input.sessionId, {
        phase: 'authorizing',
        rejectionCode: null,
        failureCode: null,
        summaryText: input.summaryText ?? null,
        omittedHistory: false,
        ignoredEvents: 0,
        ignoredPages: 0,
      });
      const authorization = await this.port.authorizeRun({
        sessionId: input.sessionId,
        projectId: input.projectId,
        expectedRevision: input.revision,
        task: input.task,
        materials: input.materials,
      });
      if (!authorization.ok) {
        this.update(input.sessionId, {
          phase: 'error',
          rejectionCode: authorization.code,
        });
        return;
      }
      const requestId = `req:${crypto.randomUUID()}`;
      const started = await this.port.startRun({
        sessionId: input.sessionId,
        projectId: input.projectId,
        expectedRevision: input.revision,
        requestId,
        grantId: authorization.summary.grantId,
      });
      if (!started.ok) {
        // A rejected start creates no run: keep the previous run's identity,
        // context and summary; only the rejection is new.
        this.update(input.sessionId, {
          phase: 'error',
          rejectionCode: started.code,
        });
        return;
      }
      this.lastSeqByRun.delete(started.runId);
      input.onStarted?.(input.revision);
      this.runMeta.set(started.runId, {
        task: input.task,
        startedAt: '',
        stopRequestedAt: null,
        endedAt: null,
        status: null,
        failureCode: null,
        resultText: '',
        truncated: false,
        recorded: false,
      });
      if (input.onTerminal !== undefined) {
        this.terminalRecorders.set(input.sessionId, input.onTerminal);
      } else {
        this.terminalRecorders.delete(input.sessionId);
      }
      if (input.onSnapshot !== undefined) {
        this.snapshotRecorders.set(input.sessionId, input.onSnapshot);
      } else {
        this.snapshotRecorders.delete(input.sessionId);
      }
      this.update(input.sessionId, {
        phase: 'active',
        projectId: input.projectId,
        runId: started.runId,
        revision: input.revision,
        status: 'starting',
        events: [],
        failureCode: null,
        authorization: authorization.summary,
        context: null,
        contextState: 'loading',
        contextError: false,
      });
      await this.port.subscribeRun({
        sessionId: input.sessionId,
        projectId: input.projectId,
        runId: started.runId,
        revision: input.revision,
        afterSeq: 0,
      });
      const page = await this.port.getRun({
        sessionId: input.sessionId,
        projectId: input.projectId,
        runId: started.runId,
        revision: input.revision,
        afterSeq: 0,
      });
      if (page !== null) {
        // The first page travels the same identity gate as a pushed batch, so
        // a forged page cannot seed another session's panels.
        const accepted = this.acceptPage({
          sessionId: input.sessionId,
          projectId: input.projectId,
          runId: started.runId,
          revision: input.revision,
          page,
        });
        if (accepted !== null) {
          this.captureRunMeta(started.runId, accepted);
          this.applyEvents(input.sessionId, accepted);
          this.advanceCursor(started.runId, page.nextAfterSeq);
          this.update(input.sessionId, { status: page.status });
          if (
            page.status === 'completed' ||
            page.status === 'failed' ||
            page.status === 'stopped'
          ) {
            // A run that already converged before the first read is terminal
            // here too; leaving the phase active would keep the stop button.
            this.update(input.sessionId, { phase: 'terminal' });
            this.recordTerminal(input.sessionId, started.runId);
          }
        }
      }
      // One final read after all queued refreshes; captureSnapshot is a no-op
      // for a run that is still live and for a context that is not ready.
      await this.refreshContext(input.sessionId);
      this.captureSnapshot(input.sessionId);
    } finally {
      this.boundSessions.delete(input.sessionId);
    }
  }

  async stop(input: {
    sessionId: string;
    projectId: string;
    revision: number;
  }): Promise<void> {
    const state = this.get(input.sessionId);
    if (state.runId === null) return;
    if (state.phase !== 'active') return;
    const priorPhase = state.phase;
    this.update(input.sessionId, { phase: 'stopping', rejectionCode: null });
    const reply = await this.port.stopRun({
      sessionId: input.sessionId,
      projectId: state.projectId ?? input.projectId,
      runId: state.runId,
      revision: state.revision ?? input.revision,
      requestId: `stop:${state.runId}`,
    });
    if (reply.ok) {
      // Terminal status arrives via the event stream; stopping is local truth
      // only until main confirms convergence.
      if (
        reply.status === 'completed' ||
        reply.status === 'failed' ||
        reply.status === 'stopped'
      ) {
        this.update(input.sessionId, {
          phase: 'terminal',
          status: reply.status,
        });
      } else {
        this.update(input.sessionId, { status: reply.status });
      }
    } else {
      // Main rejected the stop, so the run is still live: leaving the view on
      // 'stopping' would latch the stop button disabled forever.
      this.update(input.sessionId, {
        phase: priorPhase,
        rejectionCode: reply.code,
      });
    }
  }
}

export function visibleStatus(state: RunViewState): string | null {
  switch (state.status) {
    case 'starting':
    case 'running':
      // The stop button's local feedback stays until main confirms the
      // terminal state; the run layer's status is the authority afterwards.
      return state.phase === 'stopping' ? '正在停止' : '运行中';
    case 'stopping':
      return '正在停止';
    case 'stopped':
      return '已停止';
    case 'completed':
      return '已完成';
    case 'failed':
      return state.failureCode ? failureText(state.failureCode) : '失败';
    case 'unknown':
      return '结果未确认（历史标注）';
    default:
      return state.phase === 'stopping' ? '正在停止' : null;
  }
}

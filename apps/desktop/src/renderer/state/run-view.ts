import type { RunEvent, RunStatus } from '../../shared/contracts/pioneer-run';
import type {
  RunAuthorizeReply,
  RunEventBatch,
} from '../../shared/contracts/run-ipc';

/**
 * Per-session run view state for the workbench. The five user-visible
 * outcomes (运行中/正在停止/已停止/已完成/失败) come from the run layer's
 * status; the stop button's "停止中…" feedback is local to the view. This
 * module keeps no transcript persistence — durable history lives in main's
 * bounded run journal.
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

export interface RunViewState {
  phase: RunPhase;
  runId: string | null;
  status: RunStatus | null;
  failureCode: string | null;
  rejectionCode: string | null;
  summaryText: string | null;
  events: RunDisplayEvent[];
  omittedHistory: boolean;
}

export interface RunPort {
  authorizeRun(request: {
    sessionId: string;
    projectId: string;
    expectedRevision: number;
    task: string;
  }): Promise<RunAuthorizeReply>;
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
  STALE_REVISION: '任务版本已过期，请重新保存任务并启动',
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

function describe(event: RunEvent): RunDisplayEvent | null {
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
  status: null,
  failureCode: null,
  rejectionCode: null,
  summaryText: null,
  events: [],
  omittedHistory: false,
};

/** Tiny per-session store; the workbench reads it via useSyncExternalStore. */
export class RunViewStore {
  private readonly states = new Map<string, RunViewState>();
  private readonly listeners = new Set<() => void>();
  private readonly lastSeqByRun = new Map<string, number>();
  private port: RunPort;
  private batchUnsubscribe: (() => void) | null = null;
  private readonly boundSessions = new Set<string>();

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

  private async ingestBatch(batch: RunEventBatch): Promise<void> {
    const identity = batch.page.identity;
    const sessionId = [...this.states.entries()]
      .filter(([, value]) => value.runId === identity.runId)
      .map(([key]) => key)[0];
    if (sessionId === undefined) return;
    const lastSeq = this.lastSeqByRun.get(identity.runId) ?? 0;
    const fresh = batch.page.events.filter((event) => event.seq > lastSeq);
    if (batch.page.gap) {
      this.update(sessionId, { omittedHistory: true });
    }
    this.applyEvents(sessionId, fresh);
    const status = batch.page.status;
    const terminal =
      status === 'completed' || status === 'failed' || status === 'stopped';
    this.update(sessionId, {
      status,
      phase: terminal ? 'terminal' : this.get(sessionId).phase,
    });
    this.advanceCursor(identity.runId, batch.page.nextAfterSeq);
    await this.port.acknowledgeRunPage({
      sessionId: identity.sessionId,
      projectId: identity.projectId,
      runId: identity.runId,
      revision: identity.revision,
      afterSeq: batch.page.nextAfterSeq,
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
      const described = events
        .map((event) => describe(event))
        .filter((item): item is RunDisplayEvent => item !== null)
        .filter((item) => !existing.has(item.seq));
      const merged = [...state.events, ...described]
        .sort((a, b) => a.seq - b.seq)
        .slice(-MAX_DISPLAY_EVENTS);
      const failure = events.find((event) => event.body.type === 'run.failed');
      return {
        events: merged,
        failureCode:
          failure?.body.type === 'run.failed'
            ? failure.body.code
            : state.failureCode,
      };
    });
  }

  async launch(input: {
    sessionId: string;
    projectId: string;
    revision: number;
    task: string;
    summaryText?: string;
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
      });
      const authorization = await this.port.authorizeRun({
        sessionId: input.sessionId,
        projectId: input.projectId,
        expectedRevision: input.revision,
        task: input.task,
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
        this.update(input.sessionId, {
          phase: 'error',
          rejectionCode: started.code,
        });
        return;
      }
      this.lastSeqByRun.delete(started.runId);
      this.update(input.sessionId, {
        phase: 'active',
        runId: started.runId,
        status: 'starting',
        events: [],
        failureCode: null,
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
        this.applyEvents(input.sessionId, page.events);
        this.advanceCursor(started.runId, page.nextAfterSeq);
        this.update(input.sessionId, { status: page.status });
      }
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
      projectId: input.projectId,
      runId: state.runId,
      revision: input.revision,
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

  /** Called by React when the workbench unmounts a session view. */
  reset(sessionId: string): void {
    this.update(sessionId, { phase: 'idle', events: [] });
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

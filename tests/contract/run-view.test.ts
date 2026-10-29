import { describe, expect, it } from 'vitest';

import type {
  RunEvent,
  RunStatus,
} from '../../apps/desktop/src/shared/contracts/pioneer-run';
import type {
  RunEventBatch,
  RunPage,
  RunStopReply,
} from '../../apps/desktop/src/shared/contracts/run-ipc';
import type {
  RunContext,
  RunContextReply,
  RunSnapshot,
} from '../../apps/desktop/src/shared/contracts/run-context';
import {
  RunViewStore,
  rejectionText,
  visibleStatus,
} from '../../apps/desktop/src/renderer/state/run-view';
import type { RunPort } from '../../apps/desktop/src/renderer/state/run-view';

const SESSION_ID = 'session:alpha';
const PROJECT_ID = 'project:alpha';
const RUN_ID = 'run:alpha';
const REVISION = 4;

const IDENTITY = {
  sessionId: SESSION_ID,
  projectId: PROJECT_ID,
  runId: RUN_ID,
  revision: REVISION,
} as const;

function textEvent(seq: number): RunEvent {
  return {
    ...IDENTITY,
    version: 1,
    seq,
    at: '2026-10-25T00:00:00.000Z',
    source: 'model',
    adapter: 'controlled',
    body: { type: 'text.delta', text: `事件 ${String(seq)}` },
  };
}

function pageOf(input: {
  status: RunStatus;
  events: RunEvent[];
  lastSeq: number;
  nextAfterSeq: number;
  hasMore: boolean;
}): RunPage {
  return {
    identity: { ...IDENTITY },
    status: input.status,
    lastSeq: input.lastSeq,
    oldestSeq: 1,
    gap: false,
    events: input.events,
    nextAfterSeq: input.nextAfterSeq,
    hasMore: input.hasMore,
  };
}

function sequence(from: number, to: number): RunEvent[] {
  return Array.from({ length: to - from + 1 }, (_, index) =>
    textEvent(from + index),
  );
}

interface FakeRunPort extends RunPort {
  readonly ackedPages: number[];
  emit(batch: RunEventBatch): void;
}

function createFakeRunPort(options: {
  getRunPage: RunPage | null;
  stopReply: RunStopReply;
  getRunContext?: () => Promise<RunContextReply>;
  startReply?: { ok: true; runId: string } | { ok: false; code: string };
}): FakeRunPort {
  const ackedPages: number[] = [];
  let batchCallback: ((batch: RunEventBatch) => void) | null = null;
  return {
    ackedPages,
    emit: (batch) => {
      batchCallback?.(batch);
    },
    authorizeRun: () =>
      Promise.resolve({
        ok: true,
        summary: {
          grantId: 'grant:alpha',
          taskDigest: 'digest',
          projectName: 'Pioneer',
          tools: ['read_file'],
          adapter: 'controlled',
          model: null,
          expiresAt: '2026-10-25T00:00:00.000Z',
          materials: [],
        },
      }),
    listRunMaterials: () => Promise.resolve({ ok: true, materials: [] }),
    startRun: () =>
      Promise.resolve(options.startReply ?? { ok: true, runId: RUN_ID }),
    stopRun: () => Promise.resolve(options.stopReply),
    getRun: () => Promise.resolve(options.getRunPage),
    getRunContext:
      options.getRunContext ??
      (() =>
        Promise.resolve({
          ok: true,
          context: {
            identity: { ...IDENTITY },
            status: 'running',
            materials: [],
            calls: [],
          } satisfies RunContext,
        })),
    subscribeRun: () => Promise.resolve(true),
    acknowledgeRunPage: (request) => {
      ackedPages.push(request.afterSeq);
      return Promise.resolve();
    },
    onRunEventBatch: (callback) => {
      batchCallback = callback;
      return () => {
        batchCallback = null;
      };
    },
  };
}

/** Let the store's `void ingestBatch(...)` microtask chain settle. */
async function flushBatches(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

function launch(store: RunViewStore): Promise<void> {
  return store.launch({
    sessionId: SESSION_ID,
    projectId: PROJECT_ID,
    revision: REVISION,
    task: '读取 fixture 并回答。',
    materials: [],
  });
}

describe('run view delivery cursor', () => {
  it('keeps every pushed page when main paginates more than one batch', async () => {
    const firstPage = pageOf({
      status: 'running',
      events: sequence(1, 32),
      lastSeq: 40,
      nextAfterSeq: 32,
      hasMore: true,
    });
    const port = createFakeRunPort({
      getRunPage: firstPage,
      stopReply: { ok: true, status: 'running' },
    });
    const store = new RunViewStore(port);
    await launch(store);

    port.emit({ page: firstPage });
    await flushBatches();
    port.emit({
      page: pageOf({
        status: 'running',
        events: sequence(33, 40),
        lastSeq: 40,
        nextAfterSeq: 40,
        hasMore: false,
      }),
    });
    await flushBatches();

    expect(port.ackedPages).toEqual([32, 40]);
    expect(store.get(SESSION_ID).events.map((event) => event.seq)).toEqual(
      sequence(1, 40).map((event) => event.seq),
    );
  });
});

describe('run view stop rejection', () => {
  it('returns to the active phase when main rejects the stop request', async () => {
    const port = createFakeRunPort({
      getRunPage: pageOf({
        status: 'running',
        events: sequence(1, 1),
        lastSeq: 1,
        nextAfterSeq: 1,
        hasMore: false,
      }),
      stopReply: { ok: false, code: 'BINDING_MISMATCH' },
    });
    const store = new RunViewStore(port);
    await launch(store);
    expect(store.get(SESSION_ID).phase).toBe('active');

    await store.stop({
      sessionId: SESSION_ID,
      projectId: PROJECT_ID,
      revision: REVISION,
    });

    const state = store.get(SESSION_ID);
    expect(state.phase).not.toBe('stopping');
    expect(state.phase).toBe('active');
    expect(state.status).toBe('running');
    expect(state.rejectionCode).not.toBeNull();
    expect(rejectionText(state.rejectionCode ?? '')).toBe(
      '窗口绑定不一致，请重试',
    );
    expect(visibleStatus(state)).toBe('运行中');
  });
});

describe('run view identity isolation', () => {
  it('drops a page for another run or revision instead of mixing sessions', async () => {
    const page = pageOf({
      status: 'running',
      events: sequence(1, 1),
      lastSeq: 1,
      nextAfterSeq: 1,
      hasMore: false,
    });
    const port = createFakeRunPort({
      getRunPage: page,
      stopReply: { ok: true, status: 'running' },
    });
    const store = new RunViewStore(port);
    await launch(store);
    expect(store.get(SESSION_ID).events).toHaveLength(1);

    port.emit({
      page: { ...page, identity: { ...IDENTITY, revision: REVISION + 1 } },
    });
    await flushBatches();
    expect(store.get(SESSION_ID).events).toHaveLength(1);

    port.emit({
      page: { ...page, identity: { ...IDENTITY, runId: 'run:other' } },
    });
    await flushBatches();
    expect(store.get(SESSION_ID).events).toHaveLength(1);
    expect(store.get(SESSION_ID).runId).toBe(RUN_ID);
  });

  it('drops a page whose identity names another session or project', async () => {
    const page = pageOf({
      status: 'running',
      events: sequence(1, 1),
      lastSeq: 1,
      nextAfterSeq: 1,
      hasMore: false,
    });
    const port = createFakeRunPort({
      getRunPage: page,
      stopReply: { ok: true, status: 'running' },
    });
    const store = new RunViewStore(port);
    await launch(store);
    expect(store.get(SESSION_ID).events).toHaveLength(1);

    port.emit({
      page: { ...page, identity: { ...IDENTITY, sessionId: 'session:beta' } },
    });
    await flushBatches();
    expect(store.get(SESSION_ID).events).toHaveLength(1);

    port.emit({
      page: { ...page, identity: { ...IDENTITY, projectId: 'project:beta' } },
    });
    await flushBatches();
    expect(store.get(SESSION_ID).events).toHaveLength(1);
    expect(store.get(SESSION_ID).runId).toBe(RUN_ID);
    // Both foreign pages are counted; their events never reach this session.
    expect(store.get(SESSION_ID).ignoredPages).toBe(2);
  });

  it('marks omitted history when a page skips sequence numbers', async () => {
    const page = pageOf({
      status: 'running',
      events: sequence(1, 1),
      lastSeq: 1,
      nextAfterSeq: 1,
      hasMore: false,
    });
    const port = createFakeRunPort({
      getRunPage: page,
      stopReply: { ok: true, status: 'running' },
    });
    const store = new RunViewStore(port);
    await launch(store);

    port.emit({
      page: {
        ...page,
        events: sequence(3, 3),
        lastSeq: 3,
        nextAfterSeq: 3,
      },
    });
    await flushBatches();

    const state = store.get(SESSION_ID);
    expect(state.events.map((event) => event.seq)).toEqual([1, 3]);
    expect(state.omittedHistory).toBe(true);
  });

  it('reports omitted history when the display cap drops the oldest event', async () => {
    const page = pageOf({
      status: 'running',
      events: sequence(1, 500),
      lastSeq: 500,
      nextAfterSeq: 500,
      hasMore: false,
    });
    const port = createFakeRunPort({
      getRunPage: page,
      stopReply: { ok: true, status: 'running' },
    });
    const store = new RunViewStore(port);
    await launch(store);
    expect(store.get(SESSION_ID).events).toHaveLength(500);

    port.emit({
      page: {
        ...page,
        events: sequence(501, 501),
        lastSeq: 501,
        nextAfterSeq: 501,
      },
    });
    await flushBatches();

    const state = store.get(SESSION_ID);
    expect(state.events).toHaveLength(500);
    expect(state.events[0]?.seq).toBe(2);
    expect(state.omittedHistory).toBe(true);
  });

  it('counts foreign events as ignored and never applies their text', async () => {
    const page = pageOf({
      status: 'running',
      events: sequence(1, 1),
      lastSeq: 1,
      nextAfterSeq: 1,
      hasMore: false,
    });
    const port = createFakeRunPort({
      getRunPage: page,
      stopReply: { ok: true, status: 'running' },
    });
    const store = new RunViewStore(port);
    await launch(store);

    const foreign = {
      ...textEvent(2),
      sessionId: 'session:beta',
    } as RunEvent;
    port.emit({
      page: pageOf({
        status: 'running',
        events: [foreign],
        lastSeq: 2,
        nextAfterSeq: 2,
        hasMore: false,
      }),
    });
    await flushBatches();

    const state = store.get(SESSION_ID);
    expect(state.events.map((event) => event.seq)).toEqual([1]);
    expect(state.ignoredEvents).toBe(1);
  });

  it('keeps panel context bound to the launched run revision', async () => {
    const page = pageOf({
      status: 'running',
      events: sequence(1, 2),
      lastSeq: 2,
      nextAfterSeq: 2,
      hasMore: false,
    });
    const port = createFakeRunPort({
      getRunPage: page,
      stopReply: { ok: true, status: 'running' },
    });
    const store = new RunViewStore(port);
    await launch(store);
    const state = store.get(SESSION_ID);
    expect(state.revision).toBe(REVISION);
    expect(state.authorization?.grantId).toBe('grant:alpha');
    expect(state.contextState).toBe('ready');
    expect(state.context?.identity.revision).toBe(REVISION);
  });
});

describe('run view first page identity', () => {
  it('marks the phase terminal when the first page already converged', async () => {
    const completed: RunEvent = {
      ...IDENTITY,
      version: 1,
      seq: 1,
      at: '2026-10-25T00:00:00.000Z',
      source: 'host',
      adapter: 'controlled',
      body: {
        type: 'run.completed',
        usage: { inputTokens: null, outputTokens: null },
      },
    };
    const page = pageOf({
      status: 'completed',
      events: [completed],
      lastSeq: 1,
      nextAfterSeq: 1,
      hasMore: false,
    });
    const port = createFakeRunPort({
      getRunPage: page,
      stopReply: { ok: true, status: 'completed' },
    });
    const store = new RunViewStore(port);
    await launch(store);
    const state = store.get(SESSION_ID);
    expect(state.status).toBe('completed');
    expect(state.phase).toBe('terminal');
  });

  it('ignores a first page that names another session', async () => {
    const page = pageOf({
      status: 'running',
      events: sequence(1, 2),
      lastSeq: 2,
      nextAfterSeq: 2,
      hasMore: false,
    });
    const foreignPage: RunPage = {
      ...page,
      identity: { ...IDENTITY, sessionId: 'session:beta' },
    };
    const port = createFakeRunPort({
      getRunPage: foreignPage,
      stopReply: { ok: true, status: 'running' },
    });
    const store = new RunViewStore(port);
    await launch(store);
    const state = store.get(SESSION_ID);
    expect(state.events).toHaveLength(0);
    expect(state.status).toBe('starting');
    expect(state.ignoredPages).toBe(1);
  });

  it('leaves the previous summary untouched when the context read fails', async () => {
    const stopped: RunEvent = {
      ...IDENTITY,
      version: 1,
      seq: 1,
      at: '2026-10-25T00:00:00.000Z',
      source: 'host',
      adapter: 'controlled',
      body: { type: 'run.stopped' },
    };
    const page = pageOf({
      status: 'stopped',
      events: [stopped],
      lastSeq: 1,
      nextAfterSeq: 1,
      hasMore: false,
    });
    const port = createFakeRunPort({
      getRunPage: page,
      stopReply: { ok: true, status: 'stopped' },
      getRunContext: () => Promise.reject(new Error('context unavailable')),
    });
    const snapshots: RunSnapshot[] = [];
    const store = new RunViewStore(port);
    await store.launch({
      sessionId: SESSION_ID,
      projectId: PROJECT_ID,
      revision: REVISION,
      task: '读取 fixture 并回答。',
      materials: [],
      onSnapshot: (snapshot) => snapshots.push(snapshot),
    });
    port.emit({ page });
    await flushBatches();
    await flushBatches();
    expect(snapshots).toHaveLength(0);
    expect(store.get(SESSION_ID).contextState).toBe('unavailable');
  });
});

describe('run view terminal record', () => {
  it('builds one bounded task/result record for the session recorder', async () => {
    const accepted: RunEvent = {
      ...IDENTITY,
      version: 1,
      seq: 1,
      at: '2026-10-25T00:00:00.000Z',
      source: 'host',
      adapter: 'controlled',
      body: { type: 'run.accepted' },
    };
    const stopRequested: RunEvent = {
      ...IDENTITY,
      version: 1,
      seq: 2,
      at: '2026-10-25T00:00:01.000Z',
      source: 'host',
      adapter: 'controlled',
      body: { type: 'run.stop_requested', reason: 'user' },
    };
    const stopped: RunEvent = {
      ...IDENTITY,
      version: 1,
      seq: 4,
      at: '2026-10-25T00:00:02.000Z',
      source: 'host',
      adapter: 'controlled',
      body: { type: 'run.stopped' },
    };
    const page = pageOf({
      status: 'stopped',
      events: [accepted, stopRequested, textEvent(3), stopped],
      lastSeq: 4,
      nextAfterSeq: 4,
      hasMore: false,
    });
    const port = createFakeRunPort({
      getRunPage: page,
      stopReply: { ok: true, status: 'stopped' },
    });
    const records: unknown[] = [];
    const store = new RunViewStore(port);
    await store.launch({
      sessionId: SESSION_ID,
      projectId: PROJECT_ID,
      revision: REVISION,
      task: '读取 fixture 并回答。',
      materials: [],
      onTerminal: (record) => records.push(record),
    });
    port.emit({ page });
    await flushBatches();

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      runId: RUN_ID,
      task: '读取 fixture 并回答。',
      status: 'stopped',
      startedAt: '2026-10-25T00:00:00.000Z',
      endedAt: '2026-10-25T00:00:02.000Z',
      stopRequestedAt: '2026-10-25T00:00:01.000Z',
      resultText: '事件 3',
      truncated: false,
    });
  });
});

function contextReply(state: 'approved' | 'read' | 'scanned'): RunContextReply {
  return {
    ok: true,
    context: {
      identity: { ...IDENTITY },
      status: 'completed',
      materials: [
        {
          path: 'README.md',
          bytes: 12,
          sha256: 'e'.repeat(64),
          state,
          reason: null,
          readAt: state === 'approved' ? null : '2026-10-25T00:00:00.000Z',
        },
      ],
      calls: [],
    },
  };
}

describe('run view context refresh', () => {
  it('serializes overlapping refreshes so a late read wins over an early one', async () => {
    const resolvers: ((reply: RunContextReply) => void)[] = [];
    let calls = 0;
    const port = createFakeRunPort({
      getRunPage: pageOf({
        status: 'completed',
        events: sequence(1, 1),
        lastSeq: 1,
        nextAfterSeq: 1,
        hasMore: false,
      }),
      stopReply: { ok: true, status: 'completed' },
      getRunContext: () => {
        calls += 1;
        if (calls === 1) return Promise.resolve(contextReply('approved'));
        return new Promise((resolve) => {
          resolvers.push(resolve);
        });
      },
    });
    const store = new RunViewStore(port);
    await launch(store);
    expect(store.get(SESSION_ID).context?.materials[0]?.state).toBe('approved');

    const first = store.refreshContext(SESSION_ID);
    const second = store.refreshContext(SESSION_ID);
    await flushBatches();
    expect(calls).toBe(2);
    resolvers[0]?.(contextReply('scanned'));
    await first;
    await flushBatches();
    expect(calls).toBe(3);
    resolvers[1]?.(contextReply('read'));
    await second;

    expect(store.get(SESSION_ID).contextState).toBe('ready');
    expect(store.get(SESSION_ID).context?.materials[0]?.state).toBe('read');
  });

  it('marks the context unavailable when the query throws instead of rejecting', async () => {
    const port = createFakeRunPort({
      getRunPage: pageOf({
        status: 'completed',
        events: sequence(1, 1),
        lastSeq: 1,
        nextAfterSeq: 1,
        hasMore: false,
      }),
      stopReply: { ok: true, status: 'completed' },
      getRunContext: () => Promise.reject(new Error('ipc failed')),
    });
    const store = new RunViewStore(port);
    await expect(launch(store)).resolves.toBeUndefined();
    const state = store.get(SESSION_ID);
    expect(state.contextState).toBe('unavailable');
    expect(state.contextError).toBe(true);
    expect(state.context).toBeNull();
  });

  it('marks the context unavailable when main no longer has the run', async () => {
    const port = createFakeRunPort({
      getRunPage: pageOf({
        status: 'completed',
        events: sequence(1, 1),
        lastSeq: 1,
        nextAfterSeq: 1,
        hasMore: false,
      }),
      stopReply: { ok: true, status: 'completed' },
      getRunContext: () =>
        Promise.resolve({ ok: false, code: 'RUN_NOT_FOUND' }),
    });
    const store = new RunViewStore(port);
    await launch(store);
    const state = store.get(SESSION_ID);
    expect(state.contextState).toBe('unavailable');
    expect(state.contextError).toBe(false);
    expect(state.context).toBeNull();
  });

  it('captures the terminal snapshot from the last ready context read', async () => {
    const port = createFakeRunPort({
      getRunPage: pageOf({
        status: 'completed',
        events: sequence(1, 1),
        lastSeq: 1,
        nextAfterSeq: 1,
        hasMore: false,
      }),
      stopReply: { ok: true, status: 'completed' },
      getRunContext: () => Promise.resolve(contextReply('read')),
    });
    const snapshots: unknown[] = [];
    const store = new RunViewStore(port);
    await store.launch({
      sessionId: SESSION_ID,
      projectId: PROJECT_ID,
      revision: REVISION,
      task: '读取 fixture 并回答。',
      materials: ['README.md'],
      onSnapshot: (snapshot) => snapshots.push(snapshot),
    });
    await flushBatches();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      identity: { runId: RUN_ID, revision: REVISION },
      status: 'completed',
      materials: [{ path: 'README.md', state: 'read' }],
    });
  });

  it('does not attach an unused authorization when start is refused', async () => {
    const port = createFakeRunPort({
      getRunPage: null,
      stopReply: { ok: true, status: 'running' },
      startReply: { ok: false, code: 'RUN_ACTIVE' },
    });
    const store = new RunViewStore(port);
    await launch(store);
    const state = store.get(SESSION_ID);
    expect(state.phase).toBe('error');
    expect(state.rejectionCode).toBe('RUN_ACTIVE');
    expect(state.authorization).toBeNull();
    expect(state.runId).toBeNull();
    // A refused start must not adopt the attempted project either.
    expect(state.projectId).toBeNull();
  });
});

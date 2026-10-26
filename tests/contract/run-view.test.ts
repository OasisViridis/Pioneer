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
        },
      }),
    startRun: () => Promise.resolve({ ok: true, runId: RUN_ID }),
    stopRun: () => Promise.resolve(options.stopReply),
    getRun: () => Promise.resolve(options.getRunPage),
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

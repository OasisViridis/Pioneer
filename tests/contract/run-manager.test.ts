import { mkdtemp, writeFile, mkdir, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  RUN_LIMITS,
  type RunEvent,
} from '../../apps/desktop/src/shared/contracts/pioneer-run';
import type { RunEventBatch } from '../../apps/desktop/src/shared/contracts/run-ipc';
import {
  RunJournal,
  type RunJournalStore,
} from '../../apps/desktop/src/main/harness/run-journal';
import {
  RunManager,
  type RunSenderPort,
} from '../../apps/desktop/src/main/harness/run-manager';
import type {
  AdapterOutcome,
  HarnessAdapterFactory,
} from '../../apps/desktop/src/main/harness/adapter-seam';
import { createControlledAdapterFactory } from '../../apps/desktop/src/main/harness/controlled-adapter';

const webContentsId = 7;
const windowEpoch = 3;
const binding = { webContentsId, windowEpoch };

function memoryStore(initial: string | null = null): RunJournalStore & {
  content(): string | null;
  failNextSave(): void;
} {
  let content: string | null = initial;
  let fail = false;
  return {
    content: () => content,
    failNextSave: () => {
      fail = true;
    },
    load: () => Promise.resolve(content),
    save: (value) => {
      if (fail) {
        fail = false;
        return Promise.reject(new Error('journal unavailable'));
      }
      content = value;
      return Promise.resolve();
    },
  };
}

function collectSender(): RunSenderPort & { batches: RunEventBatch[] } {
  const batches: RunEventBatch[] = [];
  return {
    batches,
    send: (_id, batch) => {
      batches.push(structuredClone(batch));
    },
  };
}

const fastLimits = Object.freeze({
  ...RUN_LIMITS,
  runMs: 400,
  stopGraceMs: 120,
  subscriberAckMs: 1_000,
});

async function waitFor(probe: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!probe()) {
    if (Date.now() > deadline) throw new Error('waitFor timed out');
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }
}

async function createManager(
  script: Parameters<typeof createControlledAdapterFactory>[0],
  overrides: Partial<ConstructorParameters<typeof RunManager>[0]> = {},
  store?: ReturnType<typeof memoryStore>,
) {
  const journalStore = store ?? memoryStore();
  const { journal } = await RunJournal.open(journalStore);
  const sender = collectSender();
  // Normalize the CI temp root (8.3 short names) so the #11 preflight's
  // canonical-root check passes.
  const projectRoot = await realpath(
    await mkdtemp(join(tmpdir(), 'pioneer-run-')),
  );
  const manager = new RunManager({
    journal,
    adapterFactory: createControlledAdapterFactory(script),
    adapterKind: 'controlled',
    adapterAvailable: true,
    modelName: null,
    resolveProject: () =>
      Promise.resolve({
        root: projectRoot,
        projectName: 'fixture',
      }),
    windowBindings: {
      epochFor: (id) => (id === webContentsId ? windowEpoch : null),
    },
    sender,
    limits: fastLimits,
    ...overrides,
  });
  return { manager, journal, sender, journalStore, projectRoot };
}

async function launchRun(
  manager: RunManager,
  options: {
    sessionId?: string;
    requestId?: string;
    task?: string;
    revision?: number;
  } = {},
) {
  const sessionId = options.sessionId ?? 'session:test';
  const revision = options.revision ?? 1;
  const authorization = await manager.authorize({
    sessionId,
    projectId: 'project:test',
    revision,
    task: options.task ?? '读取 fixture 并回答。',
    ...binding,
  });
  if (!authorization.ok)
    throw new Error(`authorize failed: ${authorization.code}`);
  const request = {
    sessionId,
    projectId: 'project:test',
    expectedRevision: revision,
    requestId: options.requestId ?? 'request:1',
    grantId: authorization.authorization.grantId,
  };
  const started = await manager.start(request, binding);
  if (!started.ok) throw new Error(`start failed: ${started.code}`);
  return { request, runId: started.runId };
}

const pageOf = (manager: RunManager, runId: string, afterSeq = 0) =>
  manager.getRun({
    sessionId: 'session:test',
    projectId: 'project:test',
    runId,
    revision: 1,
    afterSeq,
    ...binding,
  });

describe('P2 run manager admission and lifecycle (contract §1/§3/§4)', () => {
  it('runs an authorized read-only task to completion with a full event sequence', async () => {
    const { manager, journalStore } = await createManager({
      steps: [{ action: 'text', text: '开始检查。' }, { action: 'complete' }],
    });
    const { runId } = await launchRun(manager);
    await waitFor(() => pageOf(manager, runId)?.status === 'completed');
    const page = pageOf(manager, runId);
    expect(page?.events.map((event) => event.body.type)).toEqual([
      'run.accepted',
      'run.started',
      'text.delta',
      'run.completed',
    ]);
    expect(page?.events[0]?.seq).toBe(1);
    expect(journalStore.content()).toContain('"kind":"accept"');
    expect(journalStore.content()).toContain('"kind":"terminal"');
  });

  it('consumes the grant once and replays an identical requestId to the same run', async () => {
    const { manager } = await createManager({
      steps: [{ action: 'complete' }],
    });
    const first = await launchRun(manager, { requestId: 'request:same' });
    const authorization = await manager.authorize({
      sessionId: 'session:test',
      projectId: 'project:test',
      revision: 1,
      task: '读取 fixture 并回答。',
      ...binding,
    });
    expect(authorization.ok).toBe(true);
    if (!authorization.ok) return;
    const replay = await manager.start(
      {
        sessionId: 'session:test',
        projectId: 'project:test',
        expectedRevision: 1,
        requestId: 'request:same',
        grantId: first.request.grantId,
      },
      binding,
    );
    expect(replay).toEqual({ ok: true, runId: first.runId });
    const conflict = await manager.start(
      {
        sessionId: 'session:test',
        projectId: 'project:test',
        expectedRevision: 1,
        requestId: 'request:same',
        grantId: authorization.authorization.grantId,
      },
      binding,
    );
    expect(conflict).toEqual({ ok: false, code: 'REQUEST_CONFLICT' });
  });

  it('rejects a reused or stale grant and enforces one active run per session', async () => {
    const { manager } = await createManager({
      steps: [{ action: 'wait', ms: 10_000 }, { action: 'complete' }],
    });
    const first = await launchRun(manager, { requestId: 'request:a' });
    const regrant = await manager.authorize({
      sessionId: 'session:test',
      projectId: 'project:test',
      revision: 2,
      task: '第二轮任务。',
      ...binding,
    });
    expect(regrant.ok).toBe(true);
    if (!regrant.ok) return;
    const active = await manager.start(
      {
        sessionId: 'session:test',
        projectId: 'project:test',
        expectedRevision: 2,
        requestId: 'request:b',
        grantId: regrant.authorization.grantId,
      },
      binding,
    );
    expect(active).toEqual({ ok: false, code: 'RUN_ACTIVE' });
    const replay = await manager.start(
      {
        sessionId: 'session:test',
        projectId: 'project:test',
        expectedRevision: 2,
        requestId: 'request:c',
        grantId: regrant.authorization.grantId,
      },
      binding,
    );
    // A rejected attempt consumes nothing, so the still-valid grant keeps
    // hitting the capacity gate until the active run converges.
    expect(replay).toEqual({ ok: false, code: 'RUN_ACTIVE' });
    const stale = await manager.authorize({
      sessionId: 'session:test',
      projectId: 'project:test',
      revision: 1,
      task: '过期修订。',
      ...binding,
    });
    expect(stale).toEqual({ ok: false, code: 'STALE_REVISION' });
    await waitFor(() => pageOf(manager, first.runId)?.status === 'failed');
    const consumedGrant = await manager.start(
      {
        sessionId: 'session:test',
        projectId: 'project:test',
        expectedRevision: 1,
        requestId: 'request:d',
        grantId: first.request.grantId,
      },
      binding,
    );
    expect(consumedGrant).toEqual({
      ok: false,
      code: 'AUTHORIZATION_REQUIRED',
    });
  });

  it('refuses admission when the adapter is unavailable and records the gate', async () => {
    const { manager } = await createManager(
      { steps: [{ action: 'complete' }] },
      { adapterAvailable: false },
    );
    const reply = await manager.authorize({
      sessionId: 'session:test',
      projectId: 'project:test',
      revision: 1,
      task: '未授权的真实模型任务。',
      ...binding,
    });
    expect(reply).toEqual({ ok: false, code: 'AUTHORIZATION_REQUIRED' });
  });

  it('returns JOURNAL_UNAVAILABLE and leaves no run when the accept write fails', async () => {
    const store = memoryStore();
    const { manager } = await createManager(
      { steps: [{ action: 'complete' }] },
      undefined,
      store,
    );
    store.failNextSave();
    const authorization = await manager.authorize({
      sessionId: 'session:test',
      projectId: 'project:test',
      revision: 1,
      task: '日志不可用。',
      ...binding,
    });
    expect(authorization.ok).toBe(true);
    if (!authorization.ok) return;
    const started = await manager.start(
      {
        sessionId: 'session:test',
        projectId: 'project:test',
        expectedRevision: 1,
        requestId: 'request:j',
        grantId: authorization.authorization.grantId,
      },
      binding,
    );
    expect(started).toEqual({ ok: false, code: 'JOURNAL_UNAVAILABLE' });
  });

  it('executes a read-only tool through the #11 policy and publishes its result', async () => {
    const { manager, projectRoot } = await createManager({
      steps: [
        {
          action: 'tool',
          request: {
            tool: 'read_file',
            arguments: { path: 'notes/readme.txt' },
          },
        },
        { action: 'complete' },
      ],
    });
    await mkdir(join(projectRoot, 'notes'), { recursive: true });
    await writeFile(
      join(projectRoot, 'notes', 'readme.txt'),
      'fixture-answer',
      'utf-8',
    );
    const { runId } = await launchRun(manager);
    await waitFor(() => pageOf(manager, runId)?.status === 'completed');
    const events = pageOf(manager, runId)?.events ?? [];
    const requested = events.find(
      (event) => event.body.type === 'tool.requested',
    );
    const result = events.find((event) => event.body.type === 'tool.result');
    expect(requested?.body).toEqual({
      type: 'tool.requested',
      callId: 'call:1',
      tool: 'read_file',
    });
    expect(result?.body).toEqual({
      type: 'tool.result',
      callId: 'call:1',
      result: { status: 'succeeded', text: 'fixture-answer', truncated: false },
    });
  });

  it('stop converges to stopped only after local resources settle', async () => {
    const { manager } = await createManager({
      steps: [
        { action: 'text', text: '工作中。' },
        { action: 'wait', ms: 240 },
        { action: 'complete' },
      ],
    });
    const { runId } = await launchRun(manager);
    await waitFor(() => pageOf(manager, runId)?.status === 'running');
    const stop = manager.stop({
      sessionId: 'session:test',
      projectId: 'project:test',
      runId,
      revision: 1,
      ...binding,
    });
    expect(stop).toEqual({ ok: true, status: 'stopping' });
    await waitFor(() => pageOf(manager, runId)?.status === 'stopped');
    const events = pageOf(manager, runId)?.events ?? [];
    expect(events.map((event) => event.body.type)).toContain(
      'run.stop_requested',
    );
    expect(events.at(-1)?.body.type).toBe('run.stopped');
  });

  it('a stuck teardown never lingers as unknown: stop grace force-ends with STOP_TIMEOUT', async () => {
    const stuckFactory: HarnessAdapterFactory = () => ({
      start: () => new Promise(() => undefined),
      requestStop: () => undefined,
      quiescent: new Promise<void>(() => undefined),
      dispose: () => Promise.resolve(),
    });
    const journalStore = memoryStore();
    const { journal } = await RunJournal.open(journalStore);
    const sender = collectSender();
    const manager = new RunManager({
      journal,
      adapterFactory: stuckFactory,
      adapterKind: 'controlled',
      adapterAvailable: true,
      modelName: null,
      resolveProject: () =>
        Promise.resolve({ root: 'D:\\unused', projectName: 'x' }),
      windowBindings: { epochFor: () => windowEpoch },
      sender,
      limits: fastLimits,
    });
    const { runId } = await launchRun(manager);
    manager.stop({
      sessionId: 'session:test',
      projectId: 'project:test',
      runId,
      revision: 1,
      ...binding,
    });
    await waitFor(() => pageOf(manager, runId)?.status === 'failed');
    const events = pageOf(manager, runId)?.events ?? [];
    expect(events.at(-1)?.body).toEqual({
      type: 'run.failed',
      code: 'STOP_TIMEOUT',
    });
    expect(events.some((event) => event.body.type === 'run.unknown')).toBe(
      false,
    );
    expect(journalStore.content()).toContain('"code":"STOP_TIMEOUT"');
  });

  it('the run deadline fails the run with RUN_DEADLINE', async () => {
    const { manager } = await createManager({
      steps: [{ action: 'wait', ms: 10_000 }, { action: 'complete' }],
    });
    const { runId } = await launchRun(manager);
    await waitFor(() => pageOf(manager, runId)?.status === 'failed');
    const events = pageOf(manager, runId)?.events ?? [];
    expect(events.at(-1)?.body).toEqual({
      type: 'run.failed',
      code: 'RUN_DEADLINE',
    });
  });

  it('converges oversize model text to OUTPUT_LIMIT (contract §5)', async () => {
    const oversizeFactory: HarnessAdapterFactory = (_context, emit) => ({
      start: () => {
        // Main must still guard against an adapter that publishes one chunk
        // above the wire budget, even though adapters chunk defensively.
        emit({ type: 'text.delta', text: 'x'.repeat(4_097) });
        return new Promise<AdapterOutcome>((resolve) => {
          setTimeout(() => {
            resolve({ status: 'aborted' });
          }, 50);
        });
      },
      requestStop: () => undefined,
      quiescent: Promise.resolve(),
      dispose: () => Promise.resolve(),
    });
    const { manager } = await createManager(
      { steps: [{ action: 'complete' }] },
      { adapterFactory: oversizeFactory },
    );
    const { runId } = await launchRun(manager);
    await waitFor(() => pageOf(manager, runId)?.status === 'failed');
    const events = pageOf(manager, runId)?.events ?? [];
    expect(events.at(-1)?.body).toEqual({
      type: 'run.failed',
      code: 'OUTPUT_LIMIT',
    });
  });

  it('restores accepted-but-unconverged runs as host_restarted tombstones', async () => {
    const acceptLine = JSON.stringify({
      kind: 'accept',
      runId: 'run:old',
      sessionId: 'session:test',
      projectId: 'project:test',
      revision: 1,
      taskDigest: 'deadbeef',
      adapter: 'controlled',
      windowEpoch: 1,
      rootRevision: 0,
      requestId: 'request:old',
      at: new Date().toISOString(),
    });
    const store = memoryStore(`${acceptLine}\n`);
    const { manager, journal } = await createManager(
      { steps: [{ action: 'complete' }] },
      undefined,
      store,
    );
    const restored = journal.restorePending();
    for (const accept of restored.restarted) {
      manager.restoreTombstone(accept);
    }
    const page = manager.getRun({
      sessionId: 'session:test',
      projectId: 'project:test',
      runId: 'run:old',
      revision: 1,
      afterSeq: 0,
      ...binding,
    });
    expect(page?.status).toBe('unknown');
    expect(page?.events).toEqual([]);
    const stop = manager.stop({
      sessionId: 'session:test',
      projectId: 'project:test',
      runId: 'run:old',
      revision: 1,
      ...binding,
    });
    expect(stop).toEqual({ ok: true, status: 'unknown' });
  });
});

describe('P2 run event paging and acknowledged subscriptions (contract §5)', () => {
  it('pages history in bounded batches and resumes after ACK', async () => {
    const script = {
      steps: Array.from({ length: 40 }, (_, index) => ({
        action: 'text',
        text: `chunk-${String(index)}`,
      })) as never,
    };
    const { manager, sender } = await createManager(script);
    const { runId } = await launchRun(manager);
    await waitFor(() => pageOf(manager, runId)?.status === 'completed');
    const full = pageOf(manager, runId);
    expect(full?.lastSeq).toBe(43); // accepted, started, 40 deltas, completed
    expect(full?.events.length).toBe(RUN_LIMITS.subscriberBatch);
    expect(full?.hasMore).toBe(true);

    const subscribed = manager.subscribe({
      sessionId: 'session:test',
      projectId: 'project:test',
      runId,
      revision: 1,
      afterSeq: 0,
      ...binding,
    });
    expect(subscribed).toBe(true);
    await waitFor(() => sender.batches.length > 0);
    const firstBatch = sender.batches[0]?.page;
    expect(firstBatch?.events.length).toBe(RUN_LIMITS.subscriberBatch);
    expect(firstBatch?.hasMore).toBe(true);
    manager.acknowledge({
      runId,
      webContentsId,
      afterSeq: firstBatch?.nextAfterSeq ?? 0,
    });
    await waitFor(() => sender.batches.length > 1);
    expect(sender.batches[1]?.page.events[0]?.seq).toBe(
      (firstBatch?.nextAfterSeq ?? 0) + 1,
    );
    manager.unsubscribe({ runId, webContentsId });
  });

  it('reports a gap instead of fabricating evicted history', async () => {
    const { manager } = await createManager({
      steps: [{ action: 'complete' }],
    });
    const { runId } = await launchRun(manager);
    await waitFor(() => pageOf(manager, runId)?.status === 'completed');
    const gapped = manager.getRun({
      sessionId: 'session:test',
      projectId: 'project:test',
      runId,
      revision: 1,
      afterSeq: 99,
      ...binding,
    });
    expect(gapped?.gap).toBe(true);
    expect(gapped?.events).toEqual([]);
  });
});

async function authorizeGrant(
  manager: RunManager,
  revision = 1,
): Promise<string> {
  const reply = await manager.authorize({
    sessionId: 'session:test',
    projectId: 'project:test',
    revision,
    task: '读取 fixture 并回答。',
    ...binding,
  });
  if (!reply.ok) throw new Error(`authorize failed: ${reply.code}`);
  return reply.authorization.grantId;
}

function readAllEvents(manager: RunManager, runId: string): RunEvent[] {
  const collected: RunEvent[] = [];
  let afterSeq = 0;
  for (;;) {
    const page = pageOf(manager, runId, afterSeq);
    if (page === null) break;
    collected.push(...page.events);
    if (!page.hasMore) break;
    afterSeq = page.nextAfterSeq;
  }
  return collected;
}

describe('P2 run manager review hardening', () => {
  it('admits exactly one run when two starts race on the same grant', async () => {
    const { manager } = await createManager({
      steps: [{ action: 'wait', ms: 150 }, { action: 'complete' }],
    });
    const grantId = await authorizeGrant(manager);
    const base = {
      sessionId: 'session:test',
      projectId: 'project:test',
      expectedRevision: 1,
      grantId,
    };
    const [first, second] = await Promise.all([
      manager.start({ ...base, requestId: 'request:race-a' }, binding),
      manager.start({ ...base, requestId: 'request:race-b' }, binding),
    ]);
    const codes = [first, second]
      .map((reply) => (reply.ok ? 'OK' : reply.code))
      .sort();
    expect(codes).toEqual(['AUTHORIZATION_REQUIRED', 'OK']);

    const winner = first.ok ? first : second;
    const runId = winner.ok ? winner.runId : '';
    // While that run is active no second session-level run can be admitted.
    const spareGrant = await authorizeGrant(manager);
    const third = await manager.start(
      { ...base, grantId: spareGrant, requestId: 'request:race-c' },
      binding,
    );
    expect(third).toEqual({ ok: false, code: 'RUN_ACTIVE' });
    await waitFor(() => pageOf(manager, runId)?.status === 'completed');
  });

  it('refuses a grant older than the session revision (contract §1)', async () => {
    const { manager } = await createManager({
      steps: [{ action: 'complete' }],
    });
    const staleGrant = await authorizeGrant(manager, 1);
    await authorizeGrant(manager, 2);
    const started = await manager.start(
      {
        sessionId: 'session:test',
        projectId: 'project:test',
        expectedRevision: 1,
        requestId: 'request:stale-grant',
        grantId: staleGrant,
      },
      binding,
    );
    expect(started).toEqual({ ok: false, code: 'STALE_REVISION' });
  });

  it('stops the run when the tool call budget is exhausted (contract §5)', async () => {
    const steps = Array.from({ length: RUN_LIMITS.toolCalls + 1 }, () => ({
      action: 'tool',
      request: { tool: 'list_directory', arguments: { path: '.' } },
    }));
    const { manager } = await createManager({ steps } as never);
    const { runId } = await launchRun(manager);
    await waitFor(() => pageOf(manager, runId)?.status === 'failed');
    const events = readAllEvents(manager, runId);
    expect(events.at(-1)?.body).toEqual({
      type: 'run.failed',
      code: 'TOOL_FAILED',
    });
    const requested = events
      .filter((event) => event.body.type === 'tool.requested')
      .map((event) =>
        event.body.type === 'tool.requested' ? event.body.callId : '',
      );
    const results = events
      .filter((event) => event.body.type === 'tool.result')
      .map((event) =>
        event.body.type === 'tool.result' ? event.body.callId : '',
      );
    expect(requested).toHaveLength(RUN_LIMITS.toolCalls);
    expect(results).toEqual(requested);
  });

  it('counts unknown-tool rejections against the same budget (contract §5)', async () => {
    const unknownFactory: HarnessAdapterFactory = (_context, emit) => ({
      start: () => {
        for (let index = 0; index < RUN_LIMITS.toolCalls + 8; index += 1) {
          emit({ type: 'tool.unknown', name: `bogus-${String(index)}` });
        }
        return Promise.resolve({
          status: 'success',
          usage: { inputTokens: null, outputTokens: null },
        });
      },
      requestStop: () => undefined,
      quiescent: Promise.resolve(),
      dispose: () => Promise.resolve(),
    });
    const { manager } = await createManager(
      { steps: [{ action: 'complete' }] },
      { adapterFactory: unknownFactory },
    );
    const { runId } = await launchRun(manager);
    await waitFor(() => pageOf(manager, runId)?.status === 'failed');
    const events = readAllEvents(manager, runId);
    expect(events.at(-1)?.body).toEqual({
      type: 'run.failed',
      code: 'TOOL_FAILED',
    });
    const requested = events.filter(
      (event) => event.body.type === 'tool.requested',
    );
    expect(requested).toHaveLength(RUN_LIMITS.toolCalls);
  });

  it('replays a concurrently duplicated requestId to the same run', async () => {
    const { manager } = await createManager({
      steps: [{ action: 'wait', ms: 120 }, { action: 'complete' }],
    });
    const grantId = await authorizeGrant(manager);
    const request = {
      sessionId: 'session:test',
      projectId: 'project:test',
      expectedRevision: 1,
      requestId: 'request:duplicate',
      grantId,
    };
    const [first, second] = await Promise.all([
      manager.start(request, binding),
      manager.start(request, binding),
    ]);
    expect(second).toEqual(first);
    expect(second.ok).toBe(true);
    await waitFor(
      () =>
        pageOf(manager, first.ok ? first.runId : '')?.status === 'completed',
    );
  });

  it('rejects reads and stops from a foreign identity (contract §3)', async () => {
    const { manager } = await createManager({
      steps: [{ action: 'complete' }],
    });
    const { runId } = await launchRun(manager);
    await waitFor(() => pageOf(manager, runId)?.status === 'completed');
    const identity = {
      sessionId: 'session:test',
      projectId: 'project:test',
      runId,
      revision: 1,
      afterSeq: 0,
      ...binding,
    };
    expect(
      manager.getRun({ ...identity, sessionId: 'session:other' }),
    ).toBeNull();
    expect(
      manager.getRun({ ...identity, projectId: 'project:other' }),
    ).toBeNull();
    expect(manager.getRun({ ...identity, revision: 2 })).toBeNull();
    expect(manager.subscribe({ ...identity, sessionId: 'session:other' })).toBe(
      false,
    );
    expect(manager.stop({ ...identity, sessionId: 'session:other' })).toEqual({
      ok: false,
      code: 'BINDING_MISMATCH',
    });
  });

  it('clamps an over-claiming ACK to what was actually delivered', async () => {
    const script = {
      steps: Array.from({ length: 40 }, (_, index) => ({
        action: 'text',
        text: `chunk-${String(index)}`,
      })) as never,
    };
    const { manager, sender } = await createManager(script);
    const { runId } = await launchRun(manager);
    await waitFor(() => pageOf(manager, runId)?.status === 'completed');
    const subscribed = manager.subscribe({
      sessionId: 'session:test',
      projectId: 'project:test',
      runId,
      revision: 1,
      afterSeq: 0,
      ...binding,
    });
    expect(subscribed).toBe(true);
    await waitFor(() => sender.batches.length > 0);
    const delivered = sender.batches[0]?.page.nextAfterSeq ?? 0;
    expect(delivered).toBe(RUN_LIMITS.subscriberBatch);
    // A renderer that claims everything must still receive the unseen tail;
    // clamping to the run's newest seq (the previous behaviour) would starve it.
    manager.acknowledge({ runId, webContentsId, afterSeq: 9_999 });
    await waitFor(() =>
      sender.batches.some((batch) =>
        batch.page.events.some((event) => event.seq > delivered),
      ),
    );
    manager.unsubscribe({ runId, webContentsId });
  });

  it('keeps the host_restarted tombstone reachable after a second boot', async () => {
    const acceptLine = JSON.stringify({
      kind: 'accept',
      runId: 'run:second',
      sessionId: 'session:test',
      projectId: 'project:test',
      revision: 1,
      taskDigest: 'deadbeef',
      adapter: 'controlled',
      windowEpoch: 1,
      rootRevision: 0,
      requestId: 'request:second',
      at: new Date().toISOString(),
    });
    const store = memoryStore(`${acceptLine}\n`);
    const boot = async (): Promise<RunManager> => {
      const created = await createManager(
        { steps: [{ action: 'complete' }] },
        undefined,
        store,
      );
      const restored = created.journal.restorePending();
      for (const accept of restored.restarted) {
        created.manager.restoreTombstone(accept);
      }
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
      return created.manager;
    };
    const firstBoot = await boot();
    expect(pageOfRun(firstBoot, 'run:second')?.status).toBe('unknown');
    const secondBoot = await boot();
    expect(pageOfRun(secondBoot, 'run:second')?.status).toBe('unknown');
  });
});

function pageOfRun(manager: RunManager, runId: string) {
  return manager.getRun({
    sessionId: 'session:test',
    projectId: 'project:test',
    runId,
    revision: 1,
    afterSeq: 0,
    ...binding,
  });
}

describe('P2 run manager edge hardening', () => {
  it('keeps the first failure reason when a later budget breach arrives', async () => {
    const oversizeAfterDeadline: HarnessAdapterFactory = (_context, emit) => ({
      start: () =>
        new Promise<AdapterOutcome>((resolve) => {
          // Fires after the 400ms deadline already decided RUN_DEADLINE.
          setTimeout(() => {
            emit({ type: 'text.delta', text: 'x'.repeat(4_097) });
            resolve({ status: 'aborted' });
          }, 450);
        }),
      requestStop: () => undefined,
      quiescent: Promise.resolve(),
      dispose: () => Promise.resolve(),
    });
    const { manager } = await createManager(
      { steps: [{ action: 'complete' }] },
      { adapterFactory: oversizeAfterDeadline },
    );
    const { runId } = await launchRun(manager);
    await waitFor(() => pageOf(manager, runId)?.status === 'failed', 3_000);
    expect(readAllEvents(manager, runId).at(-1)?.body).toEqual({
      type: 'run.failed',
      code: 'RUN_DEADLINE',
    });
  });

  it('best-effort disposes an adapter that the force end had to cut off', async () => {
    let disposed = 0;
    const stuckFactory: HarnessAdapterFactory = () => ({
      start: () => new Promise<AdapterOutcome>(() => undefined),
      requestStop: () => undefined,
      quiescent: new Promise<void>(() => undefined),
      dispose: () => {
        disposed += 1;
        return Promise.resolve();
      },
    });
    const { manager } = await createManager(
      { steps: [{ action: 'complete' }] },
      { adapterFactory: stuckFactory },
    );
    const { runId } = await launchRun(manager);
    // A user stop leaves pendingFailure empty, so grace expiry owns the code.
    manager.stop({
      sessionId: 'session:test',
      projectId: 'project:test',
      runId,
      revision: 1,
      ...binding,
    });
    await waitFor(() => pageOf(manager, runId)?.status === 'failed', 3_000);
    expect(readAllEvents(manager, runId).at(-1)?.body).toEqual({
      type: 'run.failed',
      code: 'STOP_TIMEOUT',
    });
    await waitFor(() => disposed === 1);
  });

  it('publishes the terminal event only after the terminal record is durable', async () => {
    const order: string[] = [];
    const base = memoryStore();
    const store = {
      ...base,
      save: (value: string) => {
        order.push(
          value.includes('"kind":"terminal"')
            ? 'journal:terminal'
            : 'journal:accept',
        );
        return base.save(value);
      },
    };
    const { manager } = await createManager(
      { steps: [{ action: 'complete' }] },
      {
        sender: {
          send: (_id, batch) => {
            order.push(
              batch.page.events.some(
                (event) => event.body.type === 'run.completed',
              )
                ? 'send:terminal'
                : 'send:other',
            );
          },
        },
      },
      store,
    );
    const { runId } = await launchRun(manager);
    manager.subscribe({
      sessionId: 'session:test',
      projectId: 'project:test',
      runId,
      revision: 1,
      afterSeq: 0,
      ...binding,
    });
    await waitFor(() => pageOf(manager, runId)?.status === 'completed');
    await waitFor(() => order.includes('send:terminal'));
    expect(order.indexOf('journal:terminal')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('journal:terminal')).toBeLessThan(
      order.indexOf('send:terminal'),
    );
  });

  it('never hands back a runId whose accept record failed to persist', async () => {
    const store = memoryStore();
    store.failNextSave();
    const { manager } = await createManager(
      { steps: [{ action: 'complete' }] },
      undefined,
      store,
    );
    const grantId = await authorizeGrant(manager);
    const request = {
      sessionId: 'session:test',
      projectId: 'project:test',
      expectedRevision: 1,
      requestId: 'request:phantom',
      grantId,
    };
    const [first, second] = await Promise.all([
      manager.start(request, binding),
      manager.start(request, binding),
    ]);
    expect(first.ok || second.ok).toBe(false);
    expect(
      manager.getRun({
        sessionId: 'session:test',
        projectId: 'project:test',
        runId: first.ok ? first.runId : second.ok ? second.runId : 'run:none',
        revision: 1,
        afterSeq: 0,
        ...binding,
      }),
    ).toBeNull();
  });

  it('reports a conflict when a requestId is reused with a different grant', async () => {
    const { manager } = await createManager({
      steps: [{ action: 'wait', ms: 80 }, { action: 'complete' }],
    });
    const first = await launchRun(manager, { requestId: 'request:conflict' });
    const otherGrant = await authorizeGrant(manager);
    const conflict = await manager.start(
      {
        sessionId: 'session:test',
        projectId: 'project:test',
        expectedRevision: 1,
        requestId: 'request:conflict',
        grantId: otherGrant,
      },
      binding,
    );
    expect(conflict).toEqual({ ok: false, code: 'REQUEST_CONFLICT' });
    await waitFor(() => pageOf(manager, first.runId)?.status === 'completed');
  });
});

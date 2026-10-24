import { describe, expect, it } from 'vitest';

import {
  RUN_LIMITS,
  RunEventSchema,
  RunStartRequestSchema,
  classifyRunEvent,
  type RunIdentity,
} from '../../apps/desktop/src/shared/contracts/pioneer-run';
import { restoreRun, RunProtocolProbe } from '../helpers/run-protocol-probe';

const identity: RunIdentity = {
  sessionId: 'session:one',
  projectId: 'project:one',
  runId: 'run:one',
  revision: 1,
};
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
const types = (run: RunProtocolProbe) =>
  run.events().map((event) => event.body.type);

describe('P2 protocol contract and isolated asynchronous probe (no Pi or Electron)', () => {
  it('buffers the start before a subscriber attaches, then completes after resources settle', async () => {
    const run = new RunProtocolProbe(identity);
    const model = deferred();
    expect(run.start(model.promise)).toBe(true);
    expect(run.text('synthetic answer')).toBe(true);
    run.complete();
    expect(run.status).toBe('running');
    model.resolve();
    await run.waitForTerminal();
    expect(types(run)).toEqual([
      'run.accepted',
      'run.started',
      'text.delta',
      'run.completed',
    ]);
    expect(run.read(0).gap).toBe(false);
    expect(run.events().map((event) => event.seq)).toEqual([1, 2, 3, 4]);
    expect(
      run.events().every((event) => RunEventSchema.safeParse(event).success),
    ).toBe(true);
  });

  it('Abort is observed immediately but cannot confirm stop until model AND tool settle', async () => {
    const run = new RunProtocolProbe(identity);
    const model = deferred();
    const tool = deferred();
    run.start(model.promise);
    run.tool(tool.promise);
    let observedAbort = false;
    run.abort.signal.addEventListener('abort', () => {
      observedAbort = true;
    });
    run.requestStop();
    expect(observedAbort).toBe(true);
    expect(run.status).toBe('stopping');
    model.resolve();
    await flush();
    expect(run.status).toBe('stopping');
    expect(types(run)).not.toContain('run.stopped');
    tool.resolve();
    await run.waitForTerminal();
    expect(run.status).toBe('stopped');
    expect(run.events().at(-2)?.body).toMatchObject({
      type: 'tool.result',
      result: { status: 'cancelled' },
    });
    expect(types(run).at(-1)).toBe('run.stopped');
  });

  it('also waits for the model when the tool settles first', async () => {
    const run = new RunProtocolProbe(identity);
    const model = deferred();
    const tool = deferred();
    run.start(model.promise);
    run.tool(tool.promise);
    run.requestStop();
    tool.resolve();
    await flush();
    expect(run.status).toBe('stopping');
    model.resolve();
    await run.waitForTerminal();
    expect(run.status).toBe('stopped');
  });

  it('stop committed before completion wins, including a resource rejection caused by Abort', async () => {
    const run = new RunProtocolProbe(identity);
    const model = deferred();
    run.start(model.promise);
    run.requestStop();
    run.complete();
    model.reject(new Error('private provider detail'));
    await run.waitForTerminal();
    expect(run.status).toBe('stopped');
    expect(types(run)).not.toContain('run.completed');
    expect(JSON.stringify(run.events())).not.toContain('private');
  });

  it('completion committed before stop remains completed and emits no extra terminal', async () => {
    const run = new RunProtocolProbe(identity);
    const model = deferred();
    run.start(model.promise);
    run.complete();
    model.resolve();
    await run.waitForTerminal();
    const before = run.events();
    expect(run.requestStop()).toBe(false);
    expect(run.text('late')).toBe(false);
    run.complete({ status: 'failed', code: 'MODEL_FAILED' });
    expect(run.events()).toEqual(before);
  });

  it.each(['stop_timeout', 'adapter_disconnected'] as const)(
    '%s remains unknown until actual convergence',
    async (reason) => {
      const run = new RunProtocolProbe(identity);
      const model = deferred();
      run.start(model.promise);
      run.requestStop();
      run.unknown(reason);
      expect(run.status).toBe('unknown');
      expect(run.terminal()).toBe(false);
      expect(run.start(Promise.resolve())).toBe(false);
      expect(run.text('late')).toBe(false);
      expect(run.requestStop()).toBe(false);
      expect(run.confirmQuiescence()).toBe(false);
      model.resolve();
      await flush();
      expect(run.status).toBe('unknown');
      expect(run.confirmQuiescence()).toBe(true);
      await run.waitForTerminal();
      expect(run.status).toBe('stopped');
      expect(types(run).slice(-2)).toEqual(['run.unknown', 'run.stopped']);
    },
  );

  it.each(['stop_timeout', 'adapter_disconnected'] as const)(
    'does not confuse an empty resource list with proof of convergence after %s',
    async (reason) => {
      const run = new RunProtocolProbe(identity);
      run.start(Promise.resolve());
      await flush();
      run.unknown(reason);
      expect(run.status).toBe('unknown');
      expect(types(run)).not.toContain('run.stopped');
      run.confirmQuiescence();
      await run.waitForTerminal();
      expect(run.status).toBe('stopped');
    },
  );

  it('tool failure aborts a still pending model and preserves failure until convergence', async () => {
    const run = new RunProtocolProbe(identity);
    const model = deferred();
    const tool = deferred();
    run.start(model.promise);
    run.tool(tool.promise);
    tool.reject(new Error('private IO detail'));
    await flush();
    expect(run.abort.signal.aborted).toBe(true);
    expect(run.status).toBe('stopping');
    expect(run.text('late')).toBe(false);
    run.complete();
    model.resolve();
    await run.waitForTerminal();
    expect(run.events().at(-1)?.body).toEqual({
      type: 'run.failed',
      code: 'TOOL_FAILED',
    });
  });

  it.each(['deadline', 'authorization_revoked'] as const)(
    'keeps %s as failure while waiting for resource shutdown',
    async (reason) => {
      const run = new RunProtocolProbe(identity);
      const model = deferred();
      run.start(model.promise);
      run.requestStop(reason);
      expect(run.status).toBe('stopping');
      model.resolve();
      await run.waitForTerminal();
      expect(run.events().at(-1)?.body).toEqual({
        type: 'run.failed',
        code: reason === 'deadline' ? 'RUN_DEADLINE' : 'AUTHORIZATION_REVOKED',
      });
    },
  );

  it('restores uncertain history with no reusable grants or automatic replay', () => {
    expect(restoreRun(identity)).toEqual({
      identity,
      status: 'unknown',
      canResume: false,
      grants: [],
    });
  });

  it('stopping during preparation prevents the adapter from starting', () => {
    const run = new RunProtocolProbe(identity);
    run.requestStop();
    expect(run.start(Promise.resolve())).toBe(false);
    expect(run.status).toBe('stopped');
    expect(types(run)).toEqual([
      'run.accepted',
      'run.stop_requested',
      'run.stopped',
    ]);
  });

  it('reports synchronous construction failure without a started event', () => {
    const run = new RunProtocolProbe(identity);
    run.complete({ status: 'failed', code: 'START_FAILED' });
    expect(types(run)).toEqual(['run.accepted', 'run.failed']);
  });

  it('rejects duplicate start and stop without scheduling another model or event', async () => {
    const run = new RunProtocolProbe(identity);
    const model = deferred();
    run.start(model.promise);
    expect(run.start(Promise.resolve())).toBe(false);
    expect(run.requestStop()).toBe(true);
    expect(run.requestStop()).toBe(false);
    model.resolve();
    await run.waitForTerminal();
    expect(types(run).filter((type) => type === 'run.started')).toHaveLength(1);
    expect(
      types(run).filter((type) => type === 'run.stop_requested'),
    ).toHaveLength(1);
  });

  it('a refused tool is a failed tool result; the model can continue with no shell fallback', async () => {
    const run = new RunProtocolProbe(identity);
    const model = deferred();
    run.start(model.promise);
    run.rejectTool();
    expect(run.events().at(-1)?.body).toEqual({
      type: 'tool.result',
      callId: 'call:1',
      result: { status: 'rejected', code: 'TOOL_NOT_ALLOWED' },
    });
    expect(run.status).toBe('running');
    run.complete();
    model.resolve();
    await run.waitForTerminal();
    expect(run.status).toBe('completed');
  });

  it.each(['model', 'tool'] as const)(
    'records %s failure without exposing raw exceptions',
    async (resource) => {
      const run = new RunProtocolProbe(identity);
      const model = deferred();
      const tool = deferred();
      run.start(model.promise);
      if (resource === 'tool') run.tool(tool.promise);
      run.complete();
      if (resource === 'model')
        model.reject(new Error('secret filesystem path'));
      else {
        tool.reject(new Error('secret filesystem path'));
        model.resolve();
      }
      await run.waitForTerminal();
      expect(run.events().at(-1)?.body).toEqual({
        type: 'run.failed',
        code: resource === 'model' ? 'MODEL_FAILED' : 'TOOL_FAILED',
      });
      expect(JSON.stringify(run.events())).not.toContain('secret');
    },
  );

  it('bounds text by UTF-8 bytes and stops on aggregate output overflow', async () => {
    const run = new RunProtocolProbe(identity);
    const model = deferred();
    run.start(model.promise);
    const text = 'x'.repeat(RUN_LIMITS.textChunkBytes);
    for (let i = 0; i < RUN_LIMITS.outputBytes / RUN_LIMITS.textChunkBytes; i++)
      expect(run.text(text)).toBe(true);
    expect(run.text('界')).toBe(false);
    expect(run.status).toBe('stopping');
    model.resolve();
    await run.waitForTerminal();
    expect(run.events().at(-1)?.body).toEqual({
      type: 'run.failed',
      code: 'OUTPUT_LIMIT',
    });
  });

  it('retains a bounded suffix with an explicit cursor gap and terminal snapshot', async () => {
    const run = new RunProtocolProbe(identity);
    const model = deferred();
    run.start(model.promise);
    for (let i = 0; i < RUN_LIMITS.retainedEvents + 20; i++) run.text('x');
    run.complete();
    model.resolve();
    await run.waitForTerminal();
    expect(run.events()).toHaveLength(RUN_LIMITS.retainedEvents);
    expect(run.read(0)).toMatchObject({ gap: true, status: 'completed' });
    const last = run.read(0).lastSeq;
    expect(run.read(last)).toMatchObject({ gap: false, events: [] });
    expect(run.read(last + 1).gap).toBe(true);
    expect(types(run).at(-1)).toBe('run.completed');
  });

  it('separates duplicate, future, foreign and invalid envelopes', () => {
    const event = new RunProtocolProbe(identity).events()[0];
    if (!event) throw new Error('Expected the accepted event');
    expect(classifyRunEvent(identity, 0, event)).toBe('next');
    expect(classifyRunEvent(identity, 1, event)).toBe('duplicate');
    expect(classifyRunEvent(identity, 0, { ...event, seq: 3 })).toBe('gap');
    for (const field of ['sessionId', 'projectId', 'runId'] as const) {
      expect(
        classifyRunEvent(identity, 0, { ...event, [field]: 'other' }),
      ).toBe('foreign');
    }
    expect(classifyRunEvent(identity, 0, { ...event, revision: 2 })).toBe(
      'foreign',
    );
    expect(classifyRunEvent(identity, 0, { ...event, source: 'model' })).toBe(
      'invalid',
    );
    expect(classifyRunEvent(identity, 0, { ...event, at: 'yesterday' })).toBe(
      'invalid',
    );
    expect(classifyRunEvent(identity, 0, { ...event, key: 'secret' })).toBe(
      'invalid',
    );
  });

  it('does not accept paths, secrets or capabilities in launch requests', () => {
    const request = {
      sessionId: identity.sessionId,
      projectId: identity.projectId,
      expectedRevision: 1,
      requestId: 'request:one',
      grantId: 'grant:one',
    };
    expect(RunStartRequestSchema.safeParse(request).success).toBe(true);
    for (const field of [
      'projectRoot',
      'apiKey',
      'ready',
      'capabilities',
      'endpoint',
    ]) {
      expect(
        RunStartRequestSchema.safeParse({ ...request, [field]: 'untrusted' })
          .success,
      ).toBe(false);
    }
  });

  it('validates UTF-8 event payload budget and prevents event history mutation', () => {
    const run = new RunProtocolProbe(identity);
    const event = run.events()[0];
    if (!event) throw new Error('Expected the accepted event');
    expect(
      RunEventSchema.safeParse({
        ...event,
        source: 'model',
        body: { type: 'text.delta', text: '界'.repeat(1400) },
      }).success,
    ).toBe(false);
    event.body = { type: 'run.stopped' };
    expect(types(run)).toEqual(['run.accepted']);
  });
});

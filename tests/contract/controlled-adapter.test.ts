import { describe, expect, it } from 'vitest';

import {
  createControlledAdapterFactory,
  ControlledScriptSchema,
} from '../../apps/desktop/src/main/harness/controlled-adapter';
import type {
  AdapterMessage,
  HarnessContext,
} from '../../apps/desktop/src/main/harness/adapter-seam';

function context(): HarnessContext {
  return {
    identity: {
      sessionId: 'session:s',
      projectId: 'project:p',
      runId: 'run:r',
      revision: 1,
    },
    task: '回答问题。',
    abort: new AbortController().signal,
    tools: {
      execute: () =>
        Promise.resolve({
          status: 'succeeded',
          text: 'tool-output',
          truncated: false,
        }),
    },
  };
}

describe('P2 controlled adapter (test-only model stand-in)', () => {
  it('validates the script grammar strictly', () => {
    expect(
      ControlledScriptSchema.safeParse({
        steps: [{ action: 'text', text: 'hi' }],
      }).success,
    ).toBe(true);
    expect(
      ControlledScriptSchema.safeParse({
        steps: [{ action: 'text', text: '' }],
      }).success,
    ).toBe(false);
    expect(
      ControlledScriptSchema.safeParse({
        steps: [{ action: 'wait', ms: -1 }],
      }).success,
    ).toBe(false);
  });

  it('streams text, executes tools through the port, and completes', async () => {
    const messages: AdapterMessage[] = [];
    const handle = createControlledAdapterFactory({
      steps: [
        { action: 'text', text: '先看一下文件。' },
        {
          action: 'tool',
          request: { tool: 'list_directory', arguments: { path: '.' } },
        },
        { action: 'text', text: '结论。' },
        { action: 'complete' },
      ],
    })(context(), (message) => {
      messages.push(message);
    });
    const outcome = await handle.start();
    await handle.quiescent;
    await handle.dispose();
    expect(outcome).toEqual({
      status: 'success',
      usage: { inputTokens: null, outputTokens: null },
    });
    expect(messages.map((message) => message.type)).toEqual([
      'text.delta',
      'tool.request',
      'text.delta',
    ]);
  });

  it('reports unknown tools without executing anything', async () => {
    const messages: AdapterMessage[] = [];
    const handle = createControlledAdapterFactory({
      steps: [
        { action: 'unknown_tool', name: 'run_shell' },
        { action: 'complete' },
      ],
    })(context(), (message) => {
      messages.push(message);
    });
    await handle.start();
    expect(messages).toEqual([{ type: 'tool.unknown', name: 'run_shell' }]);
  });

  it('fails with the scripted failure code', async () => {
    const handle = createControlledAdapterFactory({
      steps: [{ action: 'fail', code: 'MODEL_FAILED' }],
    })(context(), () => undefined);
    await expect(handle.start()).resolves.toEqual({
      status: 'failure',
      code: 'MODEL_FAILED',
    });
  });

  it('aborts a pending wait and settles the run as aborted', async () => {
    const abort = new AbortController();
    const hostContext: HarnessContext = { ...context(), abort: abort.signal };
    const handle = createControlledAdapterFactory({
      steps: [{ action: 'wait', ms: 60_000 }, { action: 'complete' }],
    })(hostContext, () => undefined);
    const started = handle.start();
    handle.requestStop();
    abort.abort();
    await expect(started).resolves.toEqual({ status: 'aborted' });
    await handle.quiescent;
  });

  it('rejects a second start on the same handle', async () => {
    const handle = createControlledAdapterFactory({
      steps: [{ action: 'complete' }],
    })(context(), () => undefined);
    await handle.start();
    await expect(handle.start()).rejects.toThrow('already started');
  });
});

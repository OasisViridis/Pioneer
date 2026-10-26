import { describe, expect, it } from 'vitest';

import {
  createControlledAdapterFactory,
  ControlledScriptSchema,
} from '../../apps/desktop/src/main/harness/controlled-adapter';
import { RUN_LIMITS } from '../../apps/desktop/src/shared/contracts/pioneer-run';
import type {
  AdapterMessage,
  HarnessContext,
} from '../../apps/desktop/src/main/harness/adapter-seam';

const textEncoder = new TextEncoder();
const bytesOf = (value: string): number => textEncoder.encode(value).byteLength;

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

  it('never claims quiescence before start() ran', async () => {
    const handle = createControlledAdapterFactory({
      steps: [{ action: 'complete' }],
    })(context(), () => undefined);
    let quiet = false;
    void handle.quiescent.then(() => {
      quiet = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(quiet).toBe(false);
    await handle.start();
    await expect(handle.quiescent).resolves.toBeUndefined();
    expect(quiet).toBe(true);
    await handle.dispose();
  });

  it('holds quiescence until the run and its tracked work drained', async () => {
    const handle = createControlledAdapterFactory({
      steps: [{ action: 'wait', ms: 60 }, { action: 'complete' }],
    })(context(), () => undefined);
    let quiet = false;
    void handle.quiescent.then(() => {
      quiet = true;
    });
    const started = handle.start();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(quiet).toBe(false);
    await started;
    await handle.quiescent;
    expect(quiet).toBe(true);
  });

  it('resolves quiescence (never rejects) after a rejected tool drains', async () => {
    const failingContext: HarnessContext = {
      ...context(),
      tools: {
        execute: () => Promise.reject(new Error('executor failed')),
      },
    };
    const handle = createControlledAdapterFactory({
      steps: [
        {
          action: 'tool',
          request: { tool: 'read_file', arguments: { path: 'a.txt' } },
        },
        { action: 'complete' },
      ],
    })(failingContext, () => undefined);
    await expect(handle.start()).resolves.toEqual({
      status: 'failure',
      code: 'MODEL_FAILED',
    });
    await expect(handle.quiescent).resolves.toBeUndefined();
    await handle.dispose();
  });

  it('chunks CJK text on UTF-8 boundaries within the 4 KiB budget', async () => {
    const text = '满'.repeat(2000); // 6000 bytes, all three-byte characters
    const messages: AdapterMessage[] = [];
    const handle = createControlledAdapterFactory({
      steps: [{ action: 'text', text }, { action: 'complete' }],
    })(context(), (message) => {
      messages.push(message);
    });
    await handle.start();
    await handle.quiescent;
    const chunks = textChunks(messages);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join('')).toBe(text);
    for (const chunk of chunks) {
      expect(chunk.length).toBeGreaterThan(0);
      expect(bytesOf(chunk)).toBeLessThanOrEqual(RUN_LIMITS.textChunkBytes);
      expect(utf8RoundTrip(chunk)).toBe(chunk);
    }
  });

  it('keeps astral characters whole when chunking', async () => {
    const text = '🐟'.repeat(2048); // 8192 bytes, 4096 UTF-16 code units
    const messages: AdapterMessage[] = [];
    const handle = createControlledAdapterFactory({
      steps: [{ action: 'text', text }, { action: 'complete' }],
    })(context(), (message) => {
      messages.push(message);
    });
    await handle.start();
    await handle.quiescent;
    const chunks = textChunks(messages);
    expect(chunks.length).toBe(2);
    expect(chunks.join('')).toBe(text);
    for (const chunk of chunks) {
      expect(bytesOf(chunk)).toBeLessThanOrEqual(RUN_LIMITS.textChunkBytes);
      expect(utf8RoundTrip(chunk)).toBe(chunk);
    }
  });

  it('leaves an in-budget reply as a single chunk', async () => {
    const text = 'a'.repeat(4096);
    const messages: AdapterMessage[] = [];
    const handle = createControlledAdapterFactory({
      steps: [{ action: 'text', text }, { action: 'complete' }],
    })(context(), (message) => {
      messages.push(message);
    });
    await handle.start();
    await handle.quiescent;
    expect(textChunks(messages)).toEqual([text]);
  });
});

function textChunks(messages: AdapterMessage[]): string[] {
  const chunks: string[] = [];
  for (const message of messages) {
    if (message.type === 'text.delta') chunks.push(message.text);
  }
  return chunks;
}

/** Round-trips through strict UTF-8; a cut character would not survive. */
function utf8RoundTrip(value: string): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(
    textEncoder.encode(value),
  );
}

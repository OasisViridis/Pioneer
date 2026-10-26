import { describe, expect, it, vi } from 'vitest';

import type {
  AdapterMessage,
  HarnessContext,
} from '../../apps/desktop/src/main/harness/adapter-seam';
import { createPiAdapterFactory } from '../../apps/desktop/src/main/harness/pi-adapter';
import type { ToolOutcome } from '../../apps/desktop/src/main/harness/read-only-tools';
import { RUN_LIMITS } from '../../apps/desktop/src/shared/contracts/pioneer-run';
import type { ReadOnlyToolRequest } from '../../apps/desktop/src/shared/contracts/read-only-tools';

/**
 * Offline Pi adapter coverage. Both upstream packages and the provider module
 * are replaced by in-process fakes that reproduce only the calls the adapter
 * makes, so no request is ever built, no network is touched and no real
 * credential is read. The fake Agent starts a tool without awaiting it, which
 * is the "callback outlives the loop" case quiescence must cover.
 */

vi.mock('@earendil-works/pi-ai', () => ({
  PI_AI_VERSION: 'test',
  InMemoryCredentialStore: class {
    readonly kind = 'memory';
  },
  InMemoryModelsStore: class {
    readonly kind = 'memory';
  },
  Type: {
    Object: () => ({}),
    String: () => ({}),
  },
  createModels: () => ({
    setProvider: () => undefined,
    getModel: () => ({ id: 'test-model' }),
    refresh: () => Promise.resolve(),
    streamSimple: () => {
      throw new Error('no provider request may be built');
    },
  }),
}));

vi.mock('@earendil-works/pi-ai/providers/deepseek', () => ({
  deepseekProvider: () => ({ id: 'deepseek' }),
}));

vi.mock('@earendil-works/pi-agent-core', () => {
  interface FakeTool {
    execute: (
      callId: string,
      params: Record<string, string>,
    ) => Promise<unknown>;
  }
  interface FakeOptions {
    initialState?: { tools?: FakeTool[] };
  }
  class Agent {
    state: { messages: unknown[] } = { messages: [] };
    readonly #tools: FakeTool[];
    constructor(options: FakeOptions) {
      this.#tools = options.initialState?.tools ?? [];
    }
    abort(): void {
      // The fake holds no resources to release.
    }
    prompt(): Promise<void> {
      const tool = this.#tools[0];
      if (tool !== undefined) {
        // Deliberately not awaited: the callback may still be running when the
        // loop resolves, so only the tool counter can prove quiescence.
        void tool.execute('fake-call', { path: 'a.txt' });
      }
      this.state.messages = [
        {
          role: 'assistant',
          content: [{ type: 'text', text: '满'.repeat(2000) }],
        },
      ];
      return Promise.resolve();
    }
  }
  return { PI_AGENT_CORE_VERSION: 'test', Agent };
});

const textEncoder = new TextEncoder();
const bytesOf = (value: string): number => textEncoder.encode(value).byteLength;

const piConfig = {
  providerId: 'deepseek',
  modelId: 'test-model',
  endpoint: null,
  apiKeyEnv: 'PIONEER_TEST_API_KEY',
} as const;

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function createDeferred<T>(): Deferred<T> {
  let settle: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return {
    promise,
    resolve: (value: T) => {
      settle(value);
    },
  };
}

function context(
  execute: (request: ReadOnlyToolRequest) => Promise<ToolOutcome>,
): HarnessContext {
  return {
    identity: {
      sessionId: 'session:s',
      projectId: 'project:p',
      runId: 'run:r',
      revision: 1,
    },
    task: '回答问题。',
    abort: new AbortController().signal,
    tools: { execute },
  };
}

function textChunks(messages: AdapterMessage[]): string[] {
  const chunks: string[] = [];
  for (const message of messages) {
    if (message.type === 'text.delta') chunks.push(message.text);
  }
  return chunks;
}

function noopExecute(): Promise<ToolOutcome> {
  throw new Error('no tool may run in this case');
}

describe('P2 Pi adapter (offline fakes, no credential)', () => {
  it('never claims quiescence before start() ran', async () => {
    const adapter = createPiAdapterFactory(piConfig, {})(
      context(noopExecute),
      () => undefined,
    );
    let quiet = false;
    void adapter.quiescent.then(() => {
      quiet = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(quiet).toBe(false);
    await expect(adapter.start()).resolves.toEqual({
      status: 'failure',
      code: 'MODEL_FAILED',
    });
    await expect(adapter.quiescent).resolves.toBeUndefined();
    expect(quiet).toBe(true);
    await adapter.dispose();
  });

  it('waits for an in-flight tool and chunks text by UTF-8 bytes', async () => {
    const messages: AdapterMessage[] = [];
    const tool = createDeferred<ToolOutcome>();
    const adapter = createPiAdapterFactory(piConfig, {
      PIONEER_TEST_API_KEY: 'test-only-value',
    })(
      context(() => tool.promise),
      (message) => {
        messages.push(message);
      },
    );
    let quiet = false;
    void adapter.quiescent.then(() => {
      quiet = true;
    });
    await expect(adapter.start()).resolves.toEqual({
      status: 'success',
      usage: { inputTokens: null, outputTokens: null },
    });

    const chunks = textChunks(messages);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join('')).toBe('满'.repeat(2000));
    for (const chunk of chunks) {
      expect(chunk.length).toBeGreaterThan(0);
      expect(bytesOf(chunk)).toBeLessThanOrEqual(RUN_LIMITS.textChunkBytes);
      expect(
        new TextDecoder('utf-8', { fatal: true }).decode(
          textEncoder.encode(chunk),
        ),
      ).toBe(chunk);
    }

    // The loop ended, but the tool callback it started is still outstanding.
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(quiet).toBe(false);

    tool.resolve({
      status: 'succeeded',
      text: 'tool-output',
      truncated: false,
    });
    await expect(adapter.quiescent).resolves.toBeUndefined();
    expect(quiet).toBe(true);
    await adapter.dispose();
  });
});

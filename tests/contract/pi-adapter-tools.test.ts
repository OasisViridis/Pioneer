import { describe, expect, it, vi } from 'vitest';

import type {
  AdapterMessage,
  HarnessContext,
} from '../../apps/desktop/src/main/harness/adapter-seam';
import {
  createPiAdapterFactory,
  resolvePiRuntimeConfig,
} from '../../apps/desktop/src/main/harness/pi-adapter';
import type { ToolOutcome } from '../../apps/desktop/src/main/harness/read-only-tools';
import { RUN_LIMITS } from '../../apps/desktop/src/shared/contracts/pioneer-run';
import type { ReadOnlyToolRequest } from '../../apps/desktop/src/shared/contracts/read-only-tools';

const feedback = vi.hoisted(
  (): {
    results: unknown[];
    model: unknown;
    streamFn: ((...args: unknown[]) => unknown) | undefined;
    streamArgs: unknown[];
    stopReason: string;
  } => ({
    results: [],
    model: undefined,
    streamFn: undefined,
    streamArgs: [],
    stopReason: 'stop',
  }),
);

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
    streamSimple: (...args: unknown[]) => {
      feedback.streamArgs = args;
      throw new Error('no provider request may be built');
    },
  }),
}));

vi.mock('@earendil-works/pi-ai/providers/deepseek', () => ({
  deepseekProvider: () => ({ id: 'deepseek' }),
}));
vi.mock('@earendil-works/pi-ai/providers/opencode-go', () => ({
  opencodeGoProvider: () => ({ id: 'opencode-go' }),
}));

vi.mock('@earendil-works/pi-agent-core', () => {
  interface FakeTool {
    name: string;
    execute: (
      callId: string,
      params: Record<string, string>,
    ) => Promise<unknown>;
  }
  interface FakeOptions {
    initialState?: { tools?: FakeTool[]; model?: unknown };
    streamFn?: (...args: unknown[]) => unknown;
  }
  class Agent {
    state: { messages: unknown[] } = { messages: [] };
    readonly #tools: FakeTool[];
    constructor(options: FakeOptions) {
      this.#tools = options.initialState?.tools ?? [];
      feedback.model = options.initialState?.model;
      feedback.streamFn = options.streamFn;
    }
    abort(): void {
      // The fake holds no resources to release.
    }
    prompt(): Promise<void> {
      const tool =
        this.#tools.find((tool) => tool.name === 'edit_file') ?? this.#tools[0];
      if (tool !== undefined) {
        // Deliberately not awaited: the callback may still be running when the
        // loop resolves, so only the tool counter can prove quiescence.
        void tool
          .execute('fake-call', {
            path: 'a.txt',
            oldText: 'old',
            newText: 'new',
          })
          .then((result) => {
            feedback.results.push(result);
          });
      }
      this.state.messages = [
        {
          role: 'assistant',
          stopReason: feedback.stopReason,
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
  it('uses the pinned Pi OpenCode Go provider with an explicitly configured key variable', async () => {
    const config = resolvePiRuntimeConfig({
      PIONEER_PI_PROVIDER_ID: 'opencode-go',
      PIONEER_PI_MODEL_ID: 'deepseek-v4.1-flash',
      PIONEER_PI_API_KEY_ENV: 'PIONEER_TEST_API_KEY',
      PIONEER_PI_ENDPOINT: 'https://opencode.ai/inference/go/openai/v1',
    });
    expect(config?.providerId).toBe('opencode-go');
    if (!config) throw new Error('missing test config');
    const adapter = createPiAdapterFactory(config, {
      PIONEER_TEST_API_KEY: 'test-only',
    })(
      context(() =>
        Promise.resolve({
          status: 'succeeded',
          text: 'fixture',
          truncated: false,
        }),
      ),
      () => undefined,
    );
    try {
      expect((await adapter.start()).status).toBe('success');
      await adapter.quiescent;
      expect(feedback.model).toMatchObject({ baseUrl: config.endpoint });
      expect(() => feedback.streamFn?.(feedback.model, {}, {})).toThrow(
        'no provider request may be built',
      );
      expect(feedback.streamArgs[2]).toMatchObject({
        apiKey: 'test-only',
        sessionId: 'session:s',
        maxTokens: RUN_LIMITS.modelOutputTokens,
      });
    } finally {
      await adapter.dispose();
    }
  });
  it('reports a provider error as failure even when the Pi loop resolves normally', async () => {
    feedback.stopReason = 'error';
    const adapter = createPiAdapterFactory(piConfig, {
      PIONEER_TEST_API_KEY: 'test-only',
    })(
      context(() =>
        Promise.resolve({
          status: 'succeeded',
          text: 'fixture',
          truncated: false,
        }),
      ),
      () => undefined,
    );
    try {
      await expect(adapter.start()).resolves.toEqual({
        status: 'failure',
        code: 'MODEL_FAILED',
      });
      await adapter.quiescent;
    } finally {
      feedback.stopReason = 'stop';
      await adapter.dispose();
    }
  });
  it('returns actionable edit feedback to Pi as a tool error without throwing', async () => {
    feedback.results = [];
    const adapter = createPiAdapterFactory(piConfig, {
      PIONEER_TEST_API_KEY: 'test-only',
    })(
      {
        ...context(() =>
          Promise.resolve({ status: 'rejected', code: 'INVALID_TOOL_REQUEST' }),
        ),
        editTarget: 'a.txt',
      },
      () => undefined,
    );
    try {
      expect((await adapter.start()).status).toBe('success');
      await adapter.quiescent;
      expect(feedback.results).toHaveLength(1);
      expect(feedback.results[0]).toMatchObject({
        isError: true,
        details: { tool: 'edit_file', code: 'INVALID_TOOL_REQUEST' },
      });
      expect(JSON.stringify(feedback.results[0])).toContain('精确唯一匹配');
    } finally {
      await adapter.dispose();
    }
  });
  it('registers the real edit tool only with a main-owned target and forwards exact arguments', async () => {
    const execute = vi.fn((): Promise<ToolOutcome> =>
      Promise.resolve({
        status: 'succeeded',
        text: 'applied',
        truncated: false,
      }),
    );
    const adapter = createPiAdapterFactory(piConfig, {
      PIONEER_TEST_API_KEY: 'test-only',
    })({ ...context(execute), editTarget: 'a.txt' }, () => undefined);
    await adapter.start();
    await adapter.quiescent;
    expect(execute).toHaveBeenCalledWith({
      tool: 'edit_file',
      arguments: { path: 'a.txt', oldText: 'old', newText: 'new' },
    });
    await adapter.dispose();
  });
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

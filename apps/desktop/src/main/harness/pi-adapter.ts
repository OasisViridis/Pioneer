import type { AdapterOutcome, HarnessAdapterFactory } from './adapter-seam';

/**
 * Minimal Pi host adapter (#10 direction: pi-agent-core Agent + pi-ai Models
 * with an explicit streamFn, both pinned at 1.4.0). The packages are loaded
 * through dynamic import so the no-credential import/construct/release probe
 * (A02) can run in both the development entry and the packaged build.
 *
 * Real provider runs additionally require an explicitly authorized runtime
 * config; without one the run layer refuses admission (AUTHORIZATION_REQUIRED)
 * and the attempt is recorded as NOT_RUN rather than replayed.
 */

export interface PiRuntimeConfig {
  providerId: PiProviderId;
  modelId: string;
  endpoint: string | null;
  apiKeyEnv: string;
}

export const PI_PROVIDER_IDS = [
  'zai',
  'zai-coding-cn',
  'anthropic',
  'openai',
  'deepseek',
  'openrouter',
] as const;
export type PiProviderId = (typeof PI_PROVIDER_IDS)[number];

export type PiEnvironment = Readonly<
  Partial<
    Record<
      | 'PIONEER_PI_PROVIDER_ID'
      | 'PIONEER_PI_MODEL_ID'
      | 'PIONEER_PI_ENDPOINT'
      | 'PIONEER_PI_API_KEY_ENV',
      string
    >
  >
>;

/** The credential itself only ever lives in the referenced env var. */
export function resolvePiRuntimeConfig(
  environment: PiEnvironment = process.env,
): PiRuntimeConfig | null {
  const providerId = environment.PIONEER_PI_PROVIDER_ID;
  const modelId = environment.PIONEER_PI_MODEL_ID;
  const endpoint = environment.PIONEER_PI_ENDPOINT ?? null;
  const apiKeyEnv = environment.PIONEER_PI_API_KEY_ENV;
  if (!providerId || !modelId || !apiKeyEnv) return null;
  if (!PI_PROVIDER_IDS.includes(providerId as PiProviderId)) return null;
  if (endpoint !== null) {
    let parsed: URL;
    try {
      parsed = new URL(endpoint);
    } catch {
      return null;
    }
    if (parsed.protocol !== 'https:') return null;
  }
  return {
    providerId: providerId as PiProviderId,
    modelId,
    endpoint,
    apiKeyEnv,
  };
}

export function piCredentialPresent(
  config: PiRuntimeConfig,
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  const value = environment[config.apiKeyEnv];
  return typeof value === 'string' && value.length > 0;
}

export interface PiProbeReport {
  ok: boolean;
  stage: 'import' | 'construct' | 'release';
  piAiVersion: string | null;
  piAgentCoreVersion: string | null;
  nodeVersion: string;
  error: string | null;
}

/** A02: no-credential, no-network import/construct/release verification. */
export async function probePiRuntime(): Promise<PiProbeReport> {
  const report: PiProbeReport = {
    ok: false,
    stage: 'import',
    piAiVersion: null,
    piAgentCoreVersion: null,
    nodeVersion: process.version,
    error: null,
  };
  try {
    const ai = await import('@earendil-works/pi-ai');
    const core = await import('@earendil-works/pi-agent-core');
    report.piAiVersion = ai.PI_AI_VERSION;
    const coreVersion = (core as { PI_AGENT_CORE_VERSION?: string | undefined })
      .PI_AGENT_CORE_VERSION;
    report.piAgentCoreVersion = coreVersion ?? null;
    report.stage = 'construct';
    const models = ai.createModels({
      credentials: new ai.InMemoryCredentialStore(),
      modelsStore: new ai.InMemoryModelsStore(),
    });
    const agent = new core.Agent({
      streamFn: (model, context, options) =>
        models.streamSimple(model, context, options),
      identity: { attribution: null },
    });
    report.stage = 'release';
    agent.abort();
    report.ok = true;
    return report;
  } catch (error) {
    report.error =
      error instanceof Error ? error.message : String(error).slice(0, 256);
    return report;
  }
}

/** Static provider table — no renderer-controlled specifier ever reaches import(). */
async function loadPiProvider(providerId: PiProviderId): Promise<unknown> {
  switch (providerId) {
    case 'zai': {
      const module = await import('@earendil-works/pi-ai/providers/zai');
      return module.zaiProvider();
    }
    case 'zai-coding-cn': {
      const module =
        await import('@earendil-works/pi-ai/providers/zai-coding-cn');
      return module.zaiCodingCnProvider();
    }
    case 'anthropic': {
      const module = await import('@earendil-works/pi-ai/providers/anthropic');
      return module.anthropicProvider();
    }
    case 'openai': {
      const module = await import('@earendil-works/pi-ai/providers/openai');
      return module.openaiProvider();
    }
    case 'deepseek': {
      const module = await import('@earendil-works/pi-ai/providers/deepseek');
      return module.deepseekProvider();
    }
    case 'openrouter': {
      const module = await import('@earendil-works/pi-ai/providers/openrouter');
      return module.openrouterProvider();
    }
  }
}

/** TypeBox builder from pi-ai; only the Object/String shape is needed here. */
interface TypeBoxLike {
  Object: (properties: Record<string, unknown>, options?: unknown) => unknown;
  String: (options?: unknown) => unknown;
}

/**
 * Bridges the three read-only tools to Pi's AgentTool shape. Execution goes
 * through the harness executor port (main's wrapped executor), so every call
 * is rechecked by the #11 preflight, budgeted by §5, and published as wire
 * tool.requested/tool.result events with main-assigned callIds.
 */
function buildReadOnlyTools(
  type: TypeBoxLike,
  context: Parameters<HarnessAdapterFactory>[0],
): unknown[] {
  const outcomeToResult = (
    outcome: Awaited<ReturnType<typeof context.tools.execute>>,
    label: string,
  ): Record<string, unknown> => {
    if (outcome.status === 'succeeded') {
      return {
        content: [{ type: 'text', text: outcome.text }],
        details: { tool: label, truncated: outcome.truncated },
      };
    }
    return {
      content: [
        { type: 'text', text: `${label} ${outcome.status}: ${outcome.code}` },
      ],
      details: { tool: label, code: outcome.code },
      isError: true,
    };
  };
  const base = (name: string, label: string, parameters: unknown) => ({
    name,
    label,
    description:
      name === 'read_file'
        ? '读取项目内一个 UTF-8 文本文件的内容（只读，单次最多 64 KiB）。'
        : name === 'list_directory'
          ? '列出项目内一个目录的条目（只读，最多 200 项）。'
          : '在项目文件中做字面量搜索（只读，返回 文件:行号: 内容）。',
    parameters,
    execute: async (
      _toolCallId: string,
      params: Record<string, string>,
    ): Promise<Record<string, unknown>> => {
      if (name === 'search_in_files') {
        return outcomeToResult(
          await context.tools.execute({
            tool: 'search_in_files',
            arguments: { path: params.path ?? '.', query: params.query ?? '' },
          }),
          name,
        );
      }
      return outcomeToResult(
        await context.tools.execute({
          tool: name as 'read_file' | 'list_directory',
          arguments: { path: params.path ?? '.' },
        }),
        name,
      );
    },
  });
  return [
    base('read_file', '读取文件', type.Object({ path: type.String() })),
    base('list_directory', '列出目录', type.Object({ path: type.String() })),
    base(
      'search_in_files',
      '搜索文本',
      type.Object({ path: type.String(), query: type.String() }),
    ),
  ];
}

/** Pi run loop with the three read-only tools bridged to the harness executor. */
export function createPiAdapterFactory(
  config: PiRuntimeConfig,
  environment: NodeJS.ProcessEnv = process.env,
): HarnessAdapterFactory {
  return (context, emit) => {
    let stopped = false;
    let release: (() => void) | null = null;
    return {
      start: async (): Promise<AdapterOutcome> => {
        try {
          const ai = await import('@earendil-works/pi-ai');
          const core = await import('@earendil-works/pi-agent-core');
          const apiKey = environment[config.apiKeyEnv];
          if (apiKey === undefined || apiKey.length === 0) {
            return { status: 'failure', code: 'MODEL_FAILED' };
          }
          const models = ai.createModels({
            credentials: new ai.InMemoryCredentialStore(),
            modelsStore: new ai.InMemoryModelsStore(),
          });
          const provider = (await loadPiProvider(config.providerId)) as {
            id: string;
            baseUrl?: string;
          };
          models.setProvider(
            config.endpoint === null
              ? (provider as never)
              : ({ ...provider, baseUrl: config.endpoint } as never),
          );
          let model = models.getModel(provider.id, config.modelId);
          if (model === undefined) {
            // Dynamic catalog providers publish models over the network; this
            // only happens inside an explicitly authorized run.
            await models.refresh({ providers: [provider.id] });
            model = models.getModel(provider.id, config.modelId);
          }
          if (model === undefined) {
            return { status: 'failure', code: 'MODEL_FAILED' };
          }
          const agent = new core.Agent({
            streamFn: (requestModel, requestContext, options) =>
              models.streamSimple(requestModel, requestContext, options),
            identity: { attribution: null },
            initialState: {
              model,
              tools: buildReadOnlyTools(
                ai.Type as unknown as TypeBoxLike,
                context,
              ) as never,
              systemPrompt:
                '你是 Pioneer 桌面应用内的只读任务助手。你只能通过三个只读工具查看项目文件：read_file、list_directory、search_in_files。回答文件相关问题时优先调用工具获取真实内容；禁止声称访问过未读取的文件。',
            },
          });
          release = (): void => {
            agent.abort();
          };
          await agent.prompt(context.task);
          if (stopped || context.abort.aborted) {
            return { status: 'aborted' };
          }
          for (const message of agent.state.messages) {
            if (message.role !== 'assistant') continue;
            for (const block of message.content) {
              if (block.type === 'text' && block.text.trim().length > 0) {
                emit({ type: 'text.delta', text: block.text.slice(0, 4096) });
              }
            }
          }
          return {
            status: 'success',
            usage: { inputTokens: null, outputTokens: null },
          };
        } catch {
          if (stopped || context.abort.aborted) {
            return { status: 'aborted' };
          }
          return { status: 'failure', code: 'MODEL_FAILED' };
        }
      },
      requestStop: () => {
        stopped = true;
        release?.();
      },
      quiescent: Promise.resolve(),
      dispose: () => {
        stopped = true;
        release?.();
        return Promise.resolve();
      },
    };
  };
}

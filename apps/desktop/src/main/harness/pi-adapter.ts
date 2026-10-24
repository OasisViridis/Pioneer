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

/** Text-only Pi run loop; tool-enabled Pi runs stay a follow-up (A09 record). */
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
          });
          agent.state.model = model;
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

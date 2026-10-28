import { readFile } from 'node:fs/promises';
import { z } from 'zod';

import { ReadOnlyToolRequestSchema } from '../../shared/contracts/read-only-tools';
import type {
  AdapterOutcome,
  AdapterUsage,
  HarnessAdapterFactory,
  HarnessContext,
  HarnessEmit,
  HarnessHandle,
} from './adapter-seam';
import { splitTextChunks } from './text-budget';

/**
 * Deterministic in-process model stand-in. Selected only by main startup
 * configuration (E2E guard or explicit dev flag), never by a renderer request.
 * Behavior is described by a JSON script so Real E2E can drive text, tool
 * calls, waits and outcomes without any network or provider credential.
 */

export const ControlledStepSchema = z.discriminatedUnion('action', [
  z
    .object({ action: z.literal('text'), text: z.string().min(1).max(4096) })
    .strict(),
  z
    .object({
      action: z.literal('tool'),
      request: ReadOnlyToolRequestSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('unknown_tool'),
      name: z.string().min(1).max(256),
    })
    .strict(),
  z
    .object({
      action: z.literal('wait'),
      ms: z.number().int().min(0).max(60_000),
    })
    .strict(),
  /** Emits a transport disconnect and then never settles, so the host's stop
   * grace owns the terminal state instead of the adapter faking quiescence. */
  z.object({ action: z.literal('disconnect') }).strict(),
  z.object({ action: z.literal('complete') }).strict(),
  z
    .object({
      action: z.literal('fail'),
      code: z.enum([
        'MODEL_FAILED',
        'TOOL_FAILED',
        'PROTOCOL_ERROR',
        'OUTPUT_LIMIT',
      ]),
    })
    .strict(),
]);

export const ControlledScriptSchema = z
  .object({ steps: z.array(ControlledStepSchema).min(1).max(256) })
  .strict();

export type ControlledScript = z.infer<typeof ControlledScriptSchema>;

export async function loadControlledScript(
  path: string,
): Promise<ControlledScript> {
  const raw: unknown = JSON.parse(await readFile(path, 'utf-8'));
  return ControlledScriptSchema.parse(raw);
}

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new DOMException('aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

const noUsage: AdapterUsage = { inputTokens: null, outputTokens: null };

/** Default script when no explicit script is configured: one bounded reply. */
const defaultScript: ControlledScript = {
  steps: [
    {
      action: 'text',
      text: '受控运行器已连接：这是本地模拟回复，没有调用任何真实模型。',
    },
    { action: 'complete' },
  ],
};

export function createControlledAdapterFactory(
  script: ControlledScript = defaultScript,
): HarnessAdapterFactory {
  return (context: HarnessContext, emit: HarnessEmit): HarnessHandle => {
    let stopped = false;
    let startRun: Promise<AdapterOutcome> | null = null;
    const pending = new Set<Promise<unknown>>();

    // Quiescence is a positive claim, not a constructor default: it may only
    // settle after start() ran, the run promise settled (fulfilled or rejected —
    // a rejected run still drains), and every tracked tool/wait promise is
    // gone. It never rejects; main treats a rejection as "not quiet".
    let resolveQuiescent: (() => void) | null = null;
    const quiescent = new Promise<void>((resolve) => {
      resolveQuiescent = resolve;
    });

    // Stop/abort can arrive inside any awaited step; read the flags through
    // functions so control-flow analysis cannot narrow them to `false`.
    const isAborted = (signal: AbortSignal): boolean => signal.aborted;
    const isStopped = (): boolean => stopped;

    const track = <T>(resource: Promise<T>): Promise<T> => {
      const guarded = resource.finally(() => {
        pending.delete(guarded);
      });
      pending.add(guarded);
      return guarded;
    };

    const runScript = async (): Promise<AdapterOutcome> => {
      for (const step of script.steps) {
        if (isAborted(context.abort) || isStopped())
          return { status: 'aborted' };
        try {
          switch (step.action) {
            case 'text':
              for (const chunk of splitTextChunks(step.text)) {
                emit({ type: 'text.delta', text: chunk });
              }
              break;
            case 'tool':
              emit({ type: 'tool.request', request: step.request });
              await track(context.tools.execute(step.request));
              break;
            case 'unknown_tool':
              emit({ type: 'tool.unknown', name: step.name });
              break;
            case 'wait':
              await track(abortableDelay(step.ms, context.abort));
              break;
            case 'disconnect':
              emit({ type: 'disconnect' });
              // Never settle: the disconnect itself is the last adapter fact,
              // and the host's stop grace must decide the fixed outcome.
              await new Promise<never>(() => undefined);
              break;
            case 'complete':
              return { status: 'success', usage: noUsage };
            case 'fail':
              return { status: 'failure', code: step.code };
          }
        } catch {
          if (isAborted(context.abort) || isStopped())
            return { status: 'aborted' };
          return { status: 'failure', code: 'MODEL_FAILED' };
        }
      }
      return { status: 'success', usage: noUsage };
    };

    const settleQuiet = async (run: Promise<AdapterOutcome>): Promise<void> => {
      try {
        await run;
      } catch {
        // A rejected run still drains; rejection alone proves nothing.
      }
      // Drain in batches until nothing is tracked, including work a tool
      // continuation added while the previous batch was settling.
      while (pending.size > 0) {
        await Promise.allSettled([...pending]);
      }
    };

    return {
      start: () => {
        if (startRun !== null)
          return Promise.reject(new Error('adapter already started'));
        const run = runScript();
        startRun = run;
        // settleQuiet swallows every rejection, so the settle callback is the
        // only continuation needed.
        void settleQuiet(run).finally(() => {
          resolveQuiescent?.();
        });
        return run;
      },
      requestStop: () => {
        stopped = true;
      },
      quiescent,
      dispose: async () => {
        stopped = true;
        await Promise.allSettled([...pending]);
      },
    };
  };
}

import type {
  RunFailureCode,
  RunIdentity,
} from '../../shared/contracts/pioneer-run';
import type { HarnessToolRequest } from '../../shared/contracts/agent-edit';
import type { ToolOutcome } from './read-only-tools';

/**
 * Main-private HarnessAdapter seam (run contract §2). The factory constructs
 * the handle synchronously; the constructor itself must not start network or
 * tools — only start() may. Main owns identity, callId, seq and event shape;
 * the adapter may only speak the limited message vocabulary below.
 */

export interface HarnessToolExecutor {
  execute(request: HarnessToolRequest): Promise<ToolOutcome>;
}

/** The only messages an adapter may emit; raw SDK events never cross this seam. */
export type AdapterMessage =
  | { type: 'text.delta'; text: string }
  | { type: 'tool.request'; request: HarnessToolRequest }
  | { type: 'tool.unknown'; name: string }
  | { type: 'usage'; inputTokens: number | null; outputTokens: number | null }
  /** Transport-level disconnect; main owns the stop path and fixed outcome. */
  | { type: 'disconnect' };

export interface HarnessContext {
  readonly identity: RunIdentity;
  readonly task: string;
  readonly abort: AbortSignal;
  readonly tools: HarnessToolExecutor;
  readonly editTarget?: string;
}

export interface AdapterUsage {
  inputTokens: number | null;
  outputTokens: number | null;
}

export type AdapterOutcome =
  | { status: 'success'; usage: AdapterUsage }
  | { status: 'failure'; code: RunFailureCode }
  | { status: 'aborted' };

export type HarnessEmit = (message: AdapterMessage) => void;

export interface HarnessHandle {
  start(): Promise<AdapterOutcome>;
  requestStop(): void;
  readonly quiescent: Promise<void>;
  dispose(): Promise<void>;
}

export type HarnessAdapterFactory = (
  context: HarnessContext,
  emit: HarnessEmit,
) => HarnessHandle;

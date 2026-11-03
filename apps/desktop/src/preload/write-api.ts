import { WRITE_IPC_CHANNELS } from '../shared/contracts/ipc';
import {
  WriteExecutionActionSchema,
  WriteExecutionResultSchema,
  WriteReviewPrepareSchema,
  WriteReviewReplySchema,
  type WriteDesktopApi,
} from '../shared/contracts/write-execution';

export interface WriteIpcRendererPort {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
}

/**
 * Fixed write bridge. It exposes exactly one channel and two stages: a
 * validated prepare request and a validated execute request. Replies are parsed
 * again on this side, so a malformed main response never reaches the renderer.
 */
export function createWriteApi(ipc: WriteIpcRendererPort): WriteDesktopApi {
  return {
    prepareWrite: async (request) =>
      WriteReviewReplySchema.parse(
        await ipc.invoke(
          WRITE_IPC_CHANNELS.execution,
          WriteReviewPrepareSchema.parse(request),
        ),
      ),
    executeWrite: async (request) =>
      WriteExecutionResultSchema.parse(
        await ipc.invoke(
          WRITE_IPC_CHANNELS.execution,
          WriteExecutionActionSchema.parse(request),
        ),
      ),
  };
}

import {
  RunCursorRequestSchema,
  RunStartRequestSchema,
  RunStopRequestSchema,
} from '../shared/contracts/pioneer-run';
import {
  ListRunMaterialsReplySchema,
  ListRunMaterialsRequestSchema,
} from '../shared/contracts/egress';
import {
  RUN_IPC_CHANNELS,
  RunAckRequestSchema,
  RunAuthorizeReplySchema,
  RunAuthorizeRequestSchema,
  RunEventBatchSchema,
  RunGetReplySchema,
  RunStartReplySchema,
  RunStopReplySchema,
  RunSubscribeReplySchema,
  RunUnsubscribeRequestSchema,
  type RunDesktopApi,
} from '../shared/contracts/run-ipc';

export interface RunIpcRendererPort {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(
    channel: string,
    listener: (event: unknown, ...args: unknown[]) => void,
  ): unknown;
  removeListener(
    channel: string,
    listener: (event: unknown, ...args: unknown[]) => void,
  ): unknown;
}

/** Fixed run bridge: only schema-validated structures cross to the renderer. */
export function createRunApi(ipc: RunIpcRendererPort): RunDesktopApi {
  return {
    authorizeRun: async (request) =>
      RunAuthorizeReplySchema.parse(
        await ipc.invoke(
          RUN_IPC_CHANNELS.authorize,
          RunAuthorizeRequestSchema.parse(request),
        ),
      ),
    listRunMaterials: async (request) =>
      ListRunMaterialsReplySchema.parse(
        await ipc.invoke(
          RUN_IPC_CHANNELS.materials,
          ListRunMaterialsRequestSchema.parse(request),
        ),
      ),
    startRun: async (request) =>
      RunStartReplySchema.parse(
        await ipc.invoke(
          RUN_IPC_CHANNELS.start,
          RunStartRequestSchema.parse(request),
        ),
      ),
    stopRun: async (request) =>
      RunStopReplySchema.parse(
        await ipc.invoke(
          RUN_IPC_CHANNELS.stop,
          RunStopRequestSchema.parse(request),
        ),
      ),
    getRun: async (request) => {
      const reply = RunGetReplySchema.parse(
        await ipc.invoke(
          RUN_IPC_CHANNELS.get,
          RunCursorRequestSchema.parse(request),
        ),
      );
      return reply.ok ? reply.page : null;
    },
    subscribeRun: async (request) =>
      RunSubscribeReplySchema.parse(
        await ipc.invoke(
          RUN_IPC_CHANNELS.subscribe,
          RunCursorRequestSchema.parse(request),
        ),
      ).ok,
    acknowledgeRunPage: async (request) => {
      await ipc.invoke(
        RUN_IPC_CHANNELS.ack,
        RunAckRequestSchema.parse(request),
      );
    },
    unsubscribeRun: async (request) => {
      await ipc.invoke(
        RUN_IPC_CHANNELS.unsubscribe,
        RunUnsubscribeRequestSchema.parse(request),
      );
    },
    onRunEventBatch: (callback) => {
      let active = true;
      const listener = (_event: unknown, ...args: unknown[]): void => {
        if (!active || args.length === 0) return;
        const parsed = RunEventBatchSchema.safeParse(args[0]);
        if (parsed.success) callback(parsed.data);
      };
      ipc.on(RUN_IPC_CHANNELS.events, listener);
      return () => {
        if (!active) return;
        active = false;
        ipc.removeListener(RUN_IPC_CHANNELS.events, listener);
      };
    },
  };
}

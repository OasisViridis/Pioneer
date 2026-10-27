import {
  RunCursorRequestSchema,
  RunIdentitySchema,
  RunStartRequestSchema,
  RunStopRequestSchema,
} from '../shared/contracts/pioneer-run';
import { RunContextReplySchema } from '../shared/contracts/run-context';
import {
  ListRunMaterialsReplySchema,
  ListRunMaterialsRequestSchema,
} from '../shared/contracts/egress';
import {
  RUN_IPC_CHANNELS,
  RunAuthorizeReplySchema,
  RunAuthorizeRequestSchema,
  RunStartReplySchema,
  RunStopReplySchema,
  RunUnsubscribeRequestSchema,
  type RunStartReply,
  type RunStopReply,
} from '../shared/contracts/run-ipc';
import type { RunManager } from './harness/run-manager';
import {
  isTrustedSender,
  type IpcInvokeEventLike,
  type IpcMainLike,
} from './ipc';

export interface RunIpcDependencies {
  ipcMain: IpcMainLike;
  mainWindow: { webContents: { id: number } };
  expectedRendererUrl: string;
  manager: RunManager;
  /** Bounded candidate list for the explicit egress material picker. */
  listMaterials: (
    projectId: string,
  ) => Promise<{ path: string; bytes: number }[] | null>;
  /** Current epoch of the bound window; bumps on navigation/reload (§1). */
  windowEpoch: () => number;
}

type RunIpcEvent = IpcInvokeEventLike & {
  sender: IpcInvokeEventLike['sender'];
};

/**
 * Registers the fixed run surface. Every request re-validates the trusted
 * sender (main frame of the bound window at the expected origin); replies are
 * schema-validated before they cross the bridge.
 */
export function registerRunIpc(dependencies: RunIpcDependencies): void {
  const binding = (event: RunIpcEvent) => ({
    webContentsId: event.sender.id,
    windowEpoch: dependencies.windowEpoch(),
  });

  const guard = (
    event: RunIpcEvent,
  ):
    | { ok: true }
    | { ok: false; reply: 'UNTRUSTED_SENDER' | 'INVALID_REQUEST' } => {
    if (
      !isTrustedSender(
        event,
        dependencies.mainWindow as never,
        dependencies.expectedRendererUrl,
      )
    ) {
      return { ok: false, reply: 'UNTRUSTED_SENDER' };
    }
    return { ok: true };
  };

  dependencies.ipcMain.handle(
    RUN_IPC_CHANNELS.authorize,
    async (event, ...args) => {
      const trusted = guard(event);
      const parsed = RunAuthorizeRequestSchema.safeParse(args[0]);
      if (!trusted.ok)
        return RunAuthorizeReplySchema.parse({
          ok: false,
          code: trusted.reply,
        });
      if (!parsed.success)
        return RunAuthorizeReplySchema.parse({
          ok: false,
          code: 'INVALID_REQUEST',
        });
      const reply = await dependencies.manager.authorize({
        sessionId: parsed.data.sessionId,
        projectId: parsed.data.projectId,
        revision: parsed.data.expectedRevision,
        task: parsed.data.task,
        materials: parsed.data.materials,
        ...binding(event),
      });
      return RunAuthorizeReplySchema.parse(
        reply.ok
          ? { ok: true, summary: reply.authorization }
          : { ok: false, code: reply.code },
      );
    },
  );

  dependencies.ipcMain.handle(
    RUN_IPC_CHANNELS.materials,
    async (event, ...args) => {
      const trusted = guard(event);
      const parsed = ListRunMaterialsRequestSchema.safeParse(args[0]);
      if (!trusted.ok || !parsed.success)
        return ListRunMaterialsReplySchema.parse({
          ok: false,
          code: 'INVALID_REQUEST',
        });
      const materials = await dependencies.listMaterials(parsed.data.projectId);
      if (materials === null)
        return ListRunMaterialsReplySchema.parse({
          ok: false,
          code: 'INVALID_REQUEST',
        });
      return ListRunMaterialsReplySchema.parse({
        ok: true,
        materials,
      });
    },
  );

  dependencies.ipcMain.handle(
    RUN_IPC_CHANNELS.start,
    async (event, ...args): Promise<RunStartReply> => {
      const trusted = guard(event);
      const parsed = RunStartRequestSchema.safeParse(args[0]);
      if (!trusted.ok)
        return RunStartReplySchema.parse({ ok: false, code: trusted.reply });
      if (!parsed.success)
        return RunStartReplySchema.parse({
          ok: false,
          code: 'INVALID_REQUEST',
        });
      const reply = await dependencies.manager.start(
        parsed.data,
        binding(event),
      );
      return RunStartReplySchema.parse(
        reply.ok
          ? { ok: true, runId: reply.runId }
          : { ok: false, code: reply.code },
      );
    },
  );

  dependencies.ipcMain.handle(
    RUN_IPC_CHANNELS.stop,
    async (event, ...args): Promise<RunStopReply> => {
      const trusted = guard(event);
      const parsed = RunStopRequestSchema.safeParse(args[0]);
      if (!trusted.ok)
        return RunStopReplySchema.parse({ ok: false, code: trusted.reply });
      if (!parsed.success)
        return RunStopReplySchema.parse({
          ok: false,
          code: 'INVALID_REQUEST',
        });
      const reply = await Promise.resolve(
        dependencies.manager.stop({
          ...parsed.data,
          ...binding(event),
        }),
      );
      return RunStopReplySchema.parse(
        reply.ok
          ? { ok: true, status: reply.status }
          : { ok: false, code: reply.code },
      );
    },
  );

  dependencies.ipcMain.handle(RUN_IPC_CHANNELS.get, async (event, ...args) => {
    const trusted = guard(event);
    const parsed = RunCursorRequestSchema.safeParse(args[0]);
    const page =
      trusted.ok && parsed.success
        ? dependencies.manager.getRun({ ...parsed.data, ...binding(event) })
        : null;
    return Promise.resolve(
      page === null ? { ok: false, code: 'RUN_NOT_FOUND' } : { ok: true, page },
    );
  });

  dependencies.ipcMain.handle(RUN_IPC_CHANNELS.context, (event, ...args) => {
    const trusted = guard(event);
    const parsed = RunIdentitySchema.safeParse(args[0]);
    const context =
      trusted.ok && parsed.success
        ? dependencies.manager.getContext({
            ...parsed.data,
            ...binding(event),
          })
        : null;
    return Promise.resolve(
      RunContextReplySchema.parse(
        context === null
          ? { ok: false, code: 'RUN_NOT_FOUND' }
          : { ok: true, context },
      ),
    );
  });

  dependencies.ipcMain.handle(
    RUN_IPC_CHANNELS.subscribe,
    async (event, ...args) => {
      const trusted = guard(event);
      const parsed = RunCursorRequestSchema.safeParse(args[0]);
      if (!trusted.ok || !parsed.success)
        return { ok: false, code: 'RUN_NOT_FOUND' };
      const accepted = dependencies.manager.subscribe({
        ...parsed.data,
        ...binding(event),
      });
      return Promise.resolve(
        accepted ? { ok: true } : { ok: false, code: 'RUN_NOT_FOUND' },
      );
    },
  );

  dependencies.ipcMain.handle(RUN_IPC_CHANNELS.ack, async (event, ...args) => {
    const trusted = guard(event);
    const parsed = RunCursorRequestSchema.safeParse(args[0]);
    if (trusted.ok && parsed.success) {
      dependencies.manager.acknowledge({
        runId: parsed.data.runId,
        webContentsId: event.sender.id,
        afterSeq: parsed.data.afterSeq,
      });
    }
    return Promise.resolve();
  });

  dependencies.ipcMain.handle(
    RUN_IPC_CHANNELS.unsubscribe,
    async (event, ...args) => {
      const trusted = guard(event);
      const parsed = RunUnsubscribeRequestSchema.safeParse(args[0]);
      if (trusted.ok && parsed.success) {
        dependencies.manager.unsubscribe({
          runId: parsed.data.runId,
          webContentsId: event.sender.id,
        });
      }
      return Promise.resolve();
    },
  );
}

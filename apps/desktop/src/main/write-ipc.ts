import {
  WRITE_IPC_CHANNELS,
  WritePermissionGetReplySchema,
  WritePermissionGetRequestSchema,
  WritePermissionSetReplySchema,
  WritePermissionSetRequestSchema,
  WritePreviewApplyReplySchema,
  WritePreviewApplyRequestSchema,
  WritePreviewGetReplySchema,
  WritePreviewGetRequestSchema,
  WritePreviewListReplySchema,
  WritePreviewListRequestSchema,
  WritePreviewRefreshReplySchema,
  WritePreviewRefreshRequestSchema,
  WritePreviewRejectReplySchema,
  WritePreviewRejectRequestSchema,
  type WritePreviewApplyReply,
  type WritePreviewGetReply,
  type WritePreviewListReply,
  type WritePreviewRefreshReply,
  type WritePreviewRejectReply,
} from '../shared/contracts/write-preview';
import type { WriteController } from './write-controller';
import {
  isTrustedSender,
  type IpcInvokeEventLike,
  type IpcMainLike,
} from './ipc';

export interface WriteIpcDependencies {
  ipcMain: IpcMainLike;
  mainWindow: {
    webContents: { id: number; mainFrame: unknown; getURL(): string };
  };
  expectedRendererUrl: string;
  controller: WriteController;
  /** Current epoch of the bound window; bumps on navigation/reload. */
  windowEpoch: () => number;
}

type WriteIpcEvent = IpcInvokeEventLike & {
  sender: IpcInvokeEventLike['sender'];
};

/**
 * Registers the fixed P4-A write surface. Every request re-validates the
 * trusted sender and the window binding; the renderer never supplies a path,
 * file content, project root or an approval fact.
 */
export function registerWriteIpc(dependencies: WriteIpcDependencies): void {
  const binding = (event: WriteIpcEvent) => ({
    webContentsId: event.sender.id,
    windowEpoch: dependencies.windowEpoch(),
  });

  const guarded = (event: WriteIpcEvent): boolean =>
    isTrustedSender(
      event,
      dependencies.mainWindow as never,
      dependencies.expectedRendererUrl,
    );

  dependencies.ipcMain.handle(
    WRITE_IPC_CHANNELS.permissionGet,
    (event, ...args) => {
      const trusted = guarded(event);
      const parsed = WritePermissionGetRequestSchema.safeParse(args[0]);
      if (!trusted)
        return Promise.resolve(
          WritePermissionGetReplySchema.parse({
            ok: false,
            code: 'UNTRUSTED_SENDER',
          }),
        );
      if (!parsed.success)
        return Promise.resolve(
          WritePermissionGetReplySchema.parse({
            ok: false,
            code: 'INVALID_REQUEST',
          }),
        );
      const permission = dependencies.controller.getPermission(
        parsed.data.sessionId,
        parsed.data.projectId,
        binding(event),
      );
      return Promise.resolve(
        WritePermissionGetReplySchema.parse({
          ok: true,
          mode: permission.mode,
          riskAcknowledged: permission.riskAcknowledged,
        }),
      );
    },
  );

  dependencies.ipcMain.handle(
    WRITE_IPC_CHANNELS.permissionSet,
    async (event, ...args) => {
      const trusted = guarded(event);
      const parsed = WritePermissionSetRequestSchema.safeParse(args[0]);
      if (!trusted)
        return WritePermissionSetReplySchema.parse({
          ok: false,
          code: 'UNTRUSTED_SENDER',
        });
      if (!parsed.success)
        return WritePermissionSetReplySchema.parse({
          ok: false,
          code: 'INVALID_REQUEST',
        });
      const reply = await dependencies.controller.setPermission({
        sessionId: parsed.data.sessionId,
        projectId: parsed.data.projectId,
        mode: parsed.data.mode,
        riskAcknowledged: parsed.data.riskAcknowledged,
        ...binding(event),
      });
      return WritePermissionSetReplySchema.parse(reply);
    },
  );

  dependencies.ipcMain.handle(
    WRITE_IPC_CHANNELS.previewList,
    (event, ...args): Promise<WritePreviewListReply> => {
      const trusted = guarded(event);
      const parsed = WritePreviewListRequestSchema.safeParse(args[0]);
      if (!trusted)
        return Promise.resolve(
          WritePreviewListReplySchema.parse({
            ok: false,
            code: 'UNTRUSTED_SENDER',
          }),
        );
      if (!parsed.success)
        return Promise.resolve(
          WritePreviewListReplySchema.parse({
            ok: false,
            code: 'INVALID_REQUEST',
          }),
        );
      return Promise.resolve(
        WritePreviewListReplySchema.parse({
          ok: true,
          previews: dependencies.controller.listPreviews({
            sessionId: parsed.data.sessionId,
            projectId: parsed.data.projectId,
            ...binding(event),
          }),
        }),
      );
    },
  );

  dependencies.ipcMain.handle(
    WRITE_IPC_CHANNELS.previewGet,
    (event, ...args): Promise<WritePreviewGetReply> => {
      const trusted = guarded(event);
      const parsed = WritePreviewGetRequestSchema.safeParse(args[0]);
      if (!trusted)
        return Promise.resolve(
          WritePreviewGetReplySchema.parse({
            ok: false,
            code: 'UNTRUSTED_SENDER',
          }),
        );
      if (!parsed.success)
        return Promise.resolve(
          WritePreviewGetReplySchema.parse({
            ok: false,
            code: 'INVALID_REQUEST',
          }),
        );
      return Promise.resolve(
        WritePreviewGetReplySchema.parse(
          dependencies.controller.getPreview({
            ...parsed.data,
            ...binding(event),
          }),
        ),
      );
    },
  );

  dependencies.ipcMain.handle(
    WRITE_IPC_CHANNELS.previewRefresh,
    async (event, ...args): Promise<WritePreviewRefreshReply> => {
      const trusted = guarded(event);
      const parsed = WritePreviewRefreshRequestSchema.safeParse(args[0]);
      if (!trusted)
        return WritePreviewRefreshReplySchema.parse({
          ok: false,
          code: 'UNTRUSTED_SENDER',
        });
      if (!parsed.success)
        return WritePreviewRefreshReplySchema.parse({
          ok: false,
          code: 'INVALID_REQUEST',
        });
      return WritePreviewRefreshReplySchema.parse(
        await dependencies.controller.refresh({
          ...parsed.data,
          ...binding(event),
        }),
      );
    },
  );

  dependencies.ipcMain.handle(
    WRITE_IPC_CHANNELS.previewReject,
    async (event, ...args): Promise<WritePreviewRejectReply> => {
      const trusted = guarded(event);
      const parsed = WritePreviewRejectRequestSchema.safeParse(args[0]);
      if (!trusted)
        return WritePreviewRejectReplySchema.parse({
          ok: false,
          code: 'UNTRUSTED_SENDER',
        });
      if (!parsed.success)
        return WritePreviewRejectReplySchema.parse({
          ok: false,
          code: 'INVALID_REQUEST',
        });
      const reply = await dependencies.controller.reject({
        ...parsed.data,
        ...binding(event),
      });
      return WritePreviewRejectReplySchema.parse(
        reply.ok ? { ok: true, state: 'rejected' } : reply,
      );
    },
  );

  dependencies.ipcMain.handle(
    WRITE_IPC_CHANNELS.previewApply,
    async (event, ...args): Promise<WritePreviewApplyReply> => {
      const trusted = guarded(event);
      const parsed = WritePreviewApplyRequestSchema.safeParse(args[0]);
      if (!trusted)
        return WritePreviewApplyReplySchema.parse({
          ok: false,
          code: 'UNTRUSTED_SENDER',
          report: null,
        });
      if (!parsed.success)
        return WritePreviewApplyReplySchema.parse({
          ok: false,
          code: 'INVALID_REQUEST',
          report: null,
        });
      return WritePreviewApplyReplySchema.parse(
        await dependencies.controller.apply({
          ...parsed.data,
          ...binding(event),
        }),
      );
    },
  );
}

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
  type WriteDesktopApi,
} from '../shared/contracts/write-preview';
import type { RunIpcRendererPort } from './run-api';

/** Fixed P4-A write bridge: only schema-validated structures reach renderer. */
export function createWriteApi(ipc: RunIpcRendererPort): WriteDesktopApi {
  return {
    getWritePermission: async (request) =>
      WritePermissionGetReplySchema.parse(
        await ipc.invoke(
          WRITE_IPC_CHANNELS.permissionGet,
          WritePermissionGetRequestSchema.parse(request),
        ),
      ),
    setWritePermission: async (request) =>
      WritePermissionSetReplySchema.parse(
        await ipc.invoke(
          WRITE_IPC_CHANNELS.permissionSet,
          WritePermissionSetRequestSchema.parse(request),
        ),
      ),
    listWritePreviews: async (request) =>
      WritePreviewListReplySchema.parse(
        await ipc.invoke(
          WRITE_IPC_CHANNELS.previewList,
          WritePreviewListRequestSchema.parse(request),
        ),
      ),
    getWritePreview: async (request) =>
      WritePreviewGetReplySchema.parse(
        await ipc.invoke(
          WRITE_IPC_CHANNELS.previewGet,
          WritePreviewGetRequestSchema.parse(request),
        ),
      ),
    refreshWritePreview: async (request) =>
      WritePreviewRefreshReplySchema.parse(
        await ipc.invoke(
          WRITE_IPC_CHANNELS.previewRefresh,
          WritePreviewRefreshRequestSchema.parse(request),
        ),
      ),
    rejectWritePreview: async (request) =>
      WritePreviewRejectReplySchema.parse(
        await ipc.invoke(
          WRITE_IPC_CHANNELS.previewReject,
          WritePreviewRejectRequestSchema.parse(request),
        ),
      ),
    applyWritePreview: async (request) =>
      WritePreviewApplyReplySchema.parse(
        await ipc.invoke(
          WRITE_IPC_CHANNELS.previewApply,
          WritePreviewApplyRequestSchema.parse(request),
        ),
      ),
  };
}

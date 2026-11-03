import type { PioneerDesktopApi } from '../../shared/contracts/ipc';
import type {
  WritePermissionGetReply,
  WritePermissionGetRequest,
  WritePermissionSetReply,
  WritePermissionSetRequest,
  WritePreviewApplyReply,
  WritePreviewApplyRequest,
  WritePreviewGetReply,
  WritePreviewGetRequest,
  WritePreviewListReply,
  WritePreviewListRequest,
  WritePreviewRefreshReply,
  WritePreviewRefreshRequest,
  WritePreviewRejectReply,
  WritePreviewRejectRequest,
} from '../../shared/contracts/write-preview';

/**
 * Renderer-side port for the P4-A write surface. Components depend on this
 * small interface, not on the preload object, so the flow is testable without
 * Electron and the renderer still has no path, file handle or write primitive.
 */
export interface WritePort {
  getPermission(
    request: WritePermissionGetRequest,
  ): Promise<WritePermissionGetReply>;
  setPermission(
    request: WritePermissionSetRequest,
  ): Promise<WritePermissionSetReply>;
  listPreviews(
    request: WritePreviewListRequest,
  ): Promise<WritePreviewListReply>;
  getPreview(request: WritePreviewGetRequest): Promise<WritePreviewGetReply>;
  refreshPreview(
    request: WritePreviewRefreshRequest,
  ): Promise<WritePreviewRefreshReply>;
  rejectPreview(
    request: WritePreviewRejectRequest,
  ): Promise<WritePreviewRejectReply>;
  applyPreview(
    request: WritePreviewApplyRequest,
  ): Promise<WritePreviewApplyReply>;
}

const desktop = (): PioneerDesktopApi =>
  (window as Window & { pioneer: PioneerDesktopApi }).pioneer;

export const writePort: WritePort = {
  getPermission: (request) => desktop().getWritePermission(request),
  setPermission: (request) => desktop().setWritePermission(request),
  listPreviews: (request) => desktop().listWritePreviews(request),
  getPreview: (request) => desktop().getWritePreview(request),
  refreshPreview: (request) => desktop().refreshWritePreview(request),
  rejectPreview: (request) => desktop().rejectWritePreview(request),
  applyPreview: (request) => desktop().applyWritePreview(request),
};

import { z } from 'zod';
import {
  SESSION_IPC_CHANNELS,
  type CloseDecision,
} from '../shared/contracts/session-ipc';
import { SessionStateSchema } from '../shared/session-state';
import { EmptyIpcRequestSchema } from '../shared/validation';
import {
  isTrustedSender,
  type CatalogIpcDependencies,
  type IpcInvokeEventLike,
} from './ipc';
import type { SessionWorkspaceState } from '../shared/contracts/session-workspace';
import { querySessionActivity } from '../shared/session-activity';

interface SessionStateIpcDependencies extends Pick<
  CatalogIpcDependencies,
  'ipcMain' | 'mainWindow' | 'expectedRendererUrl'
> {
  store: {
    load(): Promise<SessionWorkspaceState | null>;
    save(state: SessionWorkspaceState): Promise<void>;
  };
  lifecycle: { connect(): void; finish(decision: CloseDecision): void };
}
const SaveRequestSchema = z.tuple([SessionStateSchema]);
export function registerSessionStateIpc(
  dependencies: SessionStateIpcDependencies,
): void {
  const trusted = (event: IpcInvokeEventLike): void => {
    if (
      !isTrustedSender(
        event,
        dependencies.mainWindow,
        dependencies.expectedRendererUrl,
      )
    )
      throw new Error('Untrusted IPC sender');
  };
  dependencies.ipcMain.handle(
    SESSION_IPC_CHANNELS.activity,
    async (event, ...args) => {
      trusted(event);
      if (!EmptyIpcRequestSchema.safeParse(args).success)
        throw new Error('Invalid activity query');
      const state = await dependencies.store.load();
      return state === null
        ? { sessions: [], workspaces: [] }
        : querySessionActivity(SessionStateSchema.parse(state));
    },
  );
  dependencies.ipcMain.handle(
    SESSION_IPC_CHANNELS.load,
    async (event, ...args) => {
      trusted(event);
      if (!EmptyIpcRequestSchema.safeParse(args).success)
        throw new Error('Invalid session load request');
      dependencies.lifecycle.connect();
      const state = await dependencies.store.load();
      return state === null ? null : SessionStateSchema.parse(state);
    },
  );
  dependencies.ipcMain.handle(
    SESSION_IPC_CHANNELS.save,
    async (event, ...args) => {
      trusted(event);
      const request = SaveRequestSchema.safeParse(args);
      if (!request.success) throw new Error('Invalid session save request');
      await dependencies.store.save(request.data[0]);
    },
  );
  dependencies.ipcMain.handle(
    SESSION_IPC_CHANNELS.closeResult,
    (event, ...args) =>
      Promise.resolve().then(() => {
        trusted(event);
        const request = z
          .tuple([z.enum(['saved', 'cancel', 'discard', 'failed'])])
          .safeParse(args);
        if (!request.success) throw new Error('Invalid close result');
        dependencies.lifecycle.finish(request.data[0]);
      }),
  );
}

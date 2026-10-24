import { z } from 'zod';
import {
  SESSION_CLOSE_REQUESTED_CHANNEL,
  SESSION_IPC_CHANNELS,
  type SessionDesktopApi,
} from '../shared/contracts/session-ipc';
import { SessionStateSchema } from '../shared/session-state';
import { SessionActivitySnapshotSchema } from '../shared/session-activity';

export interface SessionIpcRendererPort {
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

/** Fixed session operations only; no raw IPC or native event escapes the bridge. */
export function createSessionApi(
  ipc: SessionIpcRendererPort,
): SessionDesktopApi {
  return {
    loadSessionState: async () => {
      const state = await ipc.invoke(SESSION_IPC_CHANNELS.load);
      return state === null ? null : SessionStateSchema.parse(state);
    },
    saveSessionState: async (state) => {
      await ipc.invoke(
        SESSION_IPC_CHANNELS.save,
        SessionStateSchema.parse(state),
      );
    },
    getSessionActivity: async () =>
      SessionActivitySnapshotSchema.parse(
        await ipc.invoke(SESSION_IPC_CHANNELS.activity),
      ),
    finishClose: async (decision) => {
      const valid = z
        .enum(['saved', 'cancel', 'discard', 'failed'])
        .parse(decision);
      await ipc.invoke(SESSION_IPC_CHANNELS.closeResult, valid);
    },
    onCloseRequested: (callback) => {
      let active = true;
      const listener = (_event: unknown, ...args: unknown[]): void => {
        if (active && args.length === 0) callback();
      };
      ipc.on(SESSION_CLOSE_REQUESTED_CHANNEL, listener);
      return () => {
        if (!active) return;
        active = false;
        ipc.removeListener(SESSION_CLOSE_REQUESTED_CHANNEL, listener);
      };
    },
  };
}

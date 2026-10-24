import {
  WINDOW_IPC_CHANNELS,
  WINDOW_STATE_CHANGED_CHANNEL,
  WindowStateSchema,
  type WindowDesktopApi,
} from '../shared/window-state';
export interface WindowIpcRendererPort {
  invoke(channel: string): Promise<unknown>;
  on(
    channel: string,
    listener: (event: unknown, ...args: unknown[]) => void,
  ): unknown;
  removeListener(
    channel: string,
    listener: (event: unknown, ...args: unknown[]) => void,
  ): unknown;
}
/** Preload-only adapter: fixed invocations, validated data, idempotent cleanup. */
export function createWindowApi(ipc: WindowIpcRendererPort): WindowDesktopApi {
  const action = async (channel: string): Promise<void> => {
    await ipc.invoke(channel);
  };
  return {
    getWindowState: async () =>
      WindowStateSchema.parse(await ipc.invoke(WINDOW_IPC_CHANNELS.state)),
    onWindowStateChanged: (callback) => {
      let active = true;
      const listener = (_event: unknown, ...args: unknown[]): void => {
        if (!active || args.length !== 1) return;
        const state = WindowStateSchema.safeParse(args[0]);
        if (state.success) callback(state.data);
      };
      ipc.on(WINDOW_STATE_CHANGED_CHANNEL, listener);
      return () => {
        if (!active) return;
        active = false;
        ipc.removeListener(WINDOW_STATE_CHANGED_CHANNEL, listener);
      };
    },
    closeWindow: () => action(WINDOW_IPC_CHANNELS.close),
    minimizeWindow: () => action(WINDOW_IPC_CHANNELS.minimize),
    toggleFullscreen: () => action(WINDOW_IPC_CHANNELS.fullscreen),
    toggleMaximize: () => action(WINDOW_IPC_CHANNELS.maximize),
    quitApp: () => action(WINDOW_IPC_CHANNELS.quit),
  };
}

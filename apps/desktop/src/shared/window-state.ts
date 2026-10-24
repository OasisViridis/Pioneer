import { z } from 'zod';

export const WINDOW_IPC_CHANNELS = {
  state: 'window:state',
  close: 'window:close',
  minimize: 'window:minimize',
  fullscreen: 'window:toggle-fullscreen',
  maximize: 'window:toggle-maximize',
  quit: 'window:quit-app',
} as const;
export const WINDOW_STATE_CHANGED_CHANNEL = 'window:state-changed';

/** Native state only; no window IDs, caller bounds, paths or generic commands. */
export const WindowStateSchema = z
  .object({
    focused: z.boolean(),
    minimized: z.boolean(),
    maximized: z.boolean(),
    fullscreen: z.boolean(),
    fullscreenTransitioning: z.boolean(),
    closeBlockedReason: z.enum(['tray-unavailable']).nullable(),
  })
  .strict();
export type WindowState = z.infer<typeof WindowStateSchema>;

export interface WindowDesktopApi {
  getWindowState(): Promise<WindowState>;
  onWindowStateChanged(callback: (state: WindowState) => void): () => void;
  closeWindow(): Promise<void>;
  minimizeWindow(): Promise<void>;
  toggleFullscreen(): Promise<void>;
  toggleMaximize(): Promise<void>;
  quitApp(): Promise<void>;
}

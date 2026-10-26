import {
  isTrustedSender,
  type CatalogIpcDependencies,
  type IpcInvokeEventLike,
} from './ipc';
import { WINDOW_IPC_CHANNELS, WindowStateSchema } from '../shared/window-state';
import { EmptyIpcRequestSchema } from '../shared/validation';
import type { createWindowControls } from './window-controls';
interface WindowIpcDependencies extends Pick<
  CatalogIpcDependencies,
  'ipcMain' | 'expectedRendererUrl'
> {
  ipcMain: CatalogIpcDependencies['ipcMain'] & {
    removeHandler(channel: string): void;
  };
  mainWindow: CatalogIpcDependencies['mainWindow'] & { isDestroyed(): boolean };
  controls: ReturnType<typeof createWindowControls>;
}
/** Exactly six fixed zero-payload operations; never an arbitrary window method. */
export function registerWindowIpc(
  dependencies: WindowIpcDependencies,
): () => void {
  let disposed = false;
  const validate = (event: IpcInvokeEventLike, args: unknown[]): void => {
    if (
      disposed ||
      dependencies.mainWindow.isDestroyed() ||
      dependencies.controls.isUnavailable()
    )
      throw new Error('Window unavailable');
    if (
      !isTrustedSender(
        event,
        dependencies.mainWindow,
        dependencies.expectedRendererUrl,
      )
    )
      throw new Error('Untrusted IPC sender');
    if (!EmptyIpcRequestSchema.safeParse(args).success)
      throw new Error('Invalid window request');
  };
  const controls = dependencies.controls;
  const operations: [string, () => unknown][] = [
    [
      WINDOW_IPC_CHANNELS.state,
      () => WindowStateSchema.parse(controls.snapshot()),
    ],
    [
      WINDOW_IPC_CHANNELS.close,
      () => {
        controls.close();
      },
    ],
    [
      WINDOW_IPC_CHANNELS.minimize,
      () => {
        controls.minimize();
      },
    ],
    [WINDOW_IPC_CHANNELS.fullscreen, () => controls.fullscreen()],
    [
      WINDOW_IPC_CHANNELS.maximize,
      () => {
        controls.maximize();
      },
    ],
    [
      WINDOW_IPC_CHANNELS.quit,
      () => {
        controls.quit();
      },
    ],
  ];
  for (const [channel, operation] of operations) {
    dependencies.ipcMain.handle(channel, async (event, ...args) => {
      validate(event, args);
      return await operation();
    });
  }
  return () => {
    if (disposed) return;
    disposed = true;
    controls.dispose();
    for (const channel of Object.values(WINDOW_IPC_CHANNELS))
      dependencies.ipcMain.removeHandler(channel);
  };
}

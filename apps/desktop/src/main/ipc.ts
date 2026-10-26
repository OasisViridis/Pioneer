import type { CatalogResult } from '../shared/contracts/catalog';
import { IPC_CHANNELS } from '../shared/contracts/ipc';
import {
  CatalogResultSchema,
  EmptyIpcRequestSchema,
} from '../shared/validation';
import type { CatalogService } from './catalog/catalog-service';

export interface SenderFrameLike {
  url: string;
}

export interface WebContentsLike {
  id: number;
  mainFrame: SenderFrameLike | null;
  getURL(): string;
}

export interface IpcInvokeEventLike {
  sender: WebContentsLike;
  senderFrame: SenderFrameLike | null;
}

export interface IpcMainLike {
  handle(
    channel: string,
    listener: (
      event: IpcInvokeEventLike,
      ...args: unknown[]
    ) => Promise<unknown>,
  ): void;
}

export interface RootPickerLike {
  showOpenDialog(
    window: { webContents: WebContentsLike },
    options: { properties: readonly 'openDirectory'[] },
  ): Promise<{ canceled: boolean; filePaths: readonly string[] }>;
}

export interface CatalogIpcDependencies {
  ipcMain: IpcMainLike;
  mainWindow: { webContents: WebContentsLike };
  /** The packaged file URL or the exact development origin derived from Forge's entry URL. */
  expectedRendererUrl: string;
  picker: RootPickerLike;
  service: CatalogService;
}

function matchesExpectedRendererUrl(
  actualUrl: string,
  expectedRendererUrl: string,
): boolean {
  try {
    const actual = new URL(actualUrl);
    const expected = new URL(expectedRendererUrl);
    return expected.protocol === 'file:'
      ? actual.href === expected.href
      : actual.origin === expected.origin;
  } catch {
    return false;
  }
}

export function isTrustedSender(
  event: IpcInvokeEventLike,
  window: { webContents: WebContentsLike },
  expectedRendererUrl: string,
): boolean {
  const trustedContents = window.webContents;
  if (event.senderFrame === null || trustedContents.mainFrame === null)
    return false;
  return (
    event.sender.id === trustedContents.id &&
    event.senderFrame === trustedContents.mainFrame &&
    matchesExpectedRendererUrl(event.senderFrame.url, expectedRendererUrl) &&
    matchesExpectedRendererUrl(event.sender.getURL(), expectedRendererUrl)
  );
}

function validateRequest(
  event: IpcInvokeEventLike,
  args: unknown[],
  dependencies: CatalogIpcDependencies,
): void {
  if (
    !isTrustedSender(
      event,
      dependencies.mainWindow,
      dependencies.expectedRendererUrl,
    )
  ) {
    throw new Error('Untrusted IPC sender');
  }
  if (!EmptyIpcRequestSchema.safeParse(args).success) {
    throw new Error('Invalid IPC request');
  }
}

/** Registers the whole renderer-facing surface: three fixed, payload-free request handlers. */
export function registerCatalogIpc(dependencies: CatalogIpcDependencies): void {
  const guarded =
    (operation: () => Promise<CatalogResult | null>) =>
    async (event: IpcInvokeEventLike, ...args: unknown[]) => {
      validateRequest(event, args, dependencies);
      const result = await operation();
      return result === null ? null : CatalogResultSchema.parse(result);
    };

  dependencies.ipcMain.handle(
    IPC_CHANNELS.getCatalog,
    guarded(() => dependencies.service.getCatalog()),
  );
  dependencies.ipcMain.handle(
    IPC_CHANNELS.rescan,
    guarded(() => dependencies.service.rescan()),
  );
  dependencies.ipcMain.handle(
    IPC_CHANNELS.selectRoot,
    guarded(async () => {
      const selection = await dependencies.picker.showOpenDialog(
        dependencies.mainWindow,
        { properties: ['openDirectory'] },
      );
      if (selection.canceled) return null;
      const rootPath = selection.filePaths[0];
      if (rootPath === undefined)
        throw new Error('Invalid directory selection');
      return dependencies.service.selectRoot(rootPath);
    }),
  );
}

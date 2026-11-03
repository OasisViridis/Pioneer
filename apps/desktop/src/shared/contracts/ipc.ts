import type { CatalogResult } from './catalog';
import type { SessionDesktopApi } from './session-ipc';
import type { RunDesktopApi } from './run-ipc';
import type { WriteDesktopApi } from './write-preview';

export const IPC_CHANNELS = {
  selectRoot: 'catalog:select-root',
  getCatalog: 'catalog:get',
  rescan: 'catalog:rescan',
} as const;

/** Every catalog IPC request is deliberately payload-free. */
export type EmptyIpcRequest = readonly [];

export interface PioneerDesktopApi
  extends SessionDesktopApi, RunDesktopApi, WriteDesktopApi {
  selectRoot(): Promise<CatalogResult | null>;
  getCatalog(): Promise<CatalogResult>;
  rescan(): Promise<CatalogResult>;
}

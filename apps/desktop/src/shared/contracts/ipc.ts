import type { CatalogResult } from './catalog';
import type { SessionDesktopApi } from './session-ipc';
import type { RunDesktopApi } from './run-ipc';

export const IPC_CHANNELS = {
  selectRoot: 'catalog:select-root',
  getCatalog: 'catalog:get',
  rescan: 'catalog:rescan',
} as const;

/** Every catalog IPC request is deliberately payload-free. */
export type EmptyIpcRequest = readonly [];

export interface PioneerDesktopApi extends SessionDesktopApi, RunDesktopApi {
  selectRoot(): Promise<CatalogResult | null>;
  getCatalog(): Promise<CatalogResult>;
  rescan(): Promise<CatalogResult>;
}

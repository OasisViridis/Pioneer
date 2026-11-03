import type { CatalogResult } from './catalog';
import type { SessionDesktopApi } from './session-ipc';
import type { RunDesktopApi } from './run-ipc';
import type { WriteDesktopApi } from './write-execution';

export const IPC_CHANNELS = {
  selectRoot: 'catalog:select-root',
  getCatalog: 'catalog:get',
  rescan: 'catalog:rescan',
} as const;

/**
 * The one controlled-write channel. It carries a two-stage protocol on a single
 * fixed channel: `prepare` returns the request main built from the selected
 * project, and `execute` sends that exact request back for the executor.
 */
export const WRITE_IPC_CHANNELS = {
  execution: 'write:execution',
} as const;

/** Every catalog IPC request is deliberately payload-free. */
export type EmptyIpcRequest = readonly [];

export interface PioneerDesktopApi
  extends SessionDesktopApi, RunDesktopApi, WriteDesktopApi {
  selectRoot(): Promise<CatalogResult | null>;
  getCatalog(): Promise<CatalogResult>;
  rescan(): Promise<CatalogResult>;
}

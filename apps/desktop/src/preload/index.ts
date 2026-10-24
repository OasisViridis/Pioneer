import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type PioneerDesktopApi } from '../shared/contracts/ipc';
import type { CatalogResult } from '../shared/contracts/catalog';
import { createSessionApi } from './session-api';
import { createRunApi } from './run-api';

const api: PioneerDesktopApi = {
  ...createSessionApi(ipcRenderer),
  ...createRunApi(ipcRenderer),
  getCatalog: () =>
    ipcRenderer.invoke(IPC_CHANNELS.getCatalog) as Promise<CatalogResult>,
  rescan: () =>
    ipcRenderer.invoke(IPC_CHANNELS.rescan) as Promise<CatalogResult>,
  selectRoot: () =>
    ipcRenderer.invoke(
      IPC_CHANNELS.selectRoot,
    ) as Promise<CatalogResult | null>,
};

contextBridge.exposeInMainWorld('pioneer', api);

import { app, dialog, ipcMain } from 'electron';

import { CatalogService } from './catalog/catalog-service';
import { scanWorkspace } from './catalog/scanner';
import { registerCatalogIpc } from './ipc';
import { IPC_CHANNELS } from '../shared/contracts/ipc';
import { applyLaunchRuntimeConfig } from './runtime-config';
import { createSettingsStore } from './settings-store';
import { createMainWindow } from './window';
import {
  createSessionStateStore,
  type SessionStateStore,
} from './session-state-store';
import { registerSessionStateIpc } from './session-state-ipc';
import {
  SESSION_CLOSE_REQUESTED_CHANNEL,
  SESSION_IPC_CHANNELS,
} from '../shared/contracts/session-ipc';
import {
  RUN_IPC_CHANNELS,
  type RunEventBatch,
} from '../shared/contracts/run-ipc';
import { RUN_LIMITS } from '../shared/contracts/pioneer-run';
import { assembleRunHost, type AssembledRunHost } from './run-host';
import { registerRunIpc } from './run-ipc';
import { probePiRuntime } from './harness/pi-adapter';
import {
  createPendingSaveTracker,
  createWindowCloseBarrier,
  createCloseCoordinator,
} from './window-lifecycle';
import { createAppWindowCoordinator } from './app-window-lifecycle';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

let mainWindow: ReturnType<typeof createMainWindow> | null = null;
let catalogService: CatalogService | null = null;
let sessionStore: SessionStateStore | null = null;
let runHost: AssembledRunHost | null = null;
let windowEpochCounter = 0;
let activeWindowBinding: { webContentsId: number; epoch: number } | null = null;
const acceptedSaves = createPendingSaveTracker();

// This must run before app readiness can construct Chromium session state.
const launchRuntimeConfig = applyLaunchRuntimeConfig(app);
const ownsProfile = app.requestSingleInstanceLock();
if (!ownsProfile) app.exit(0);

const appLifecycle = createAppWindowCoordinator({
  hasWindow: () => mainWindow !== null && !mainWindow.isDestroyed(),
  trayAvailable: () => false,
  open: () => {
    if (catalogService !== null) openMainWindow(catalogService);
  },
  focus: () => {
    if (mainWindow !== null && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  },
  close: () => {
    if (mainWindow !== null && !mainWindow.isDestroyed()) mainWindow.close();
  },
  quit: () => {
    app.quit();
  },
  reportTrayUnavailable: () => undefined,
  reportOperationFailure: (reason) => {
    dialog.showErrorBox('Pioneer 无法完成窗口操作', reason);
  },
  settleAcceptedSaves: () => acceptedSaves.settle(),
});

app.on('second-instance', () => {
  appLifecycle.requestReopen();
});
let shutdownSettled = false;
app.on('before-quit', (event) => {
  if (!ownsProfile || appLifecycle.allowFinalQuit()) {
    if (shutdownSettled) return;
    // Bounded stop attempt: hold the quit for the harness grace window so the
    // run layer can converge and journal its terminals. Unconverged runs become
    // host_restarted tombstones at next boot instead of being replayed.
    event.preventDefault();
    void (async () => {
      const host = runHost;
      try {
        await Promise.race([
          host === null
            ? Promise.resolve()
            : host.manager.shutdown().catch(() => undefined),
          new Promise<void>((resolve) => {
            setTimeout(resolve, RUN_LIMITS.stopGraceMs + 1_000).unref();
          }),
        ]);
      } catch {
        // Quitting matters more than a clean stop; the journal decides next boot.
      }
      shutdownSettled = true;
      app.quit();
    })();
    return;
  }
  event.preventDefault();
  appLifecycle.requestQuit();
});

const openMainWindow = (service: CatalogService): void => {
  mainWindow = createMainWindow({
    entryUrl: MAIN_WINDOW_WEBPACK_ENTRY,
    preloadPath: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
  });

  const trustedWindow = mainWindow;
  const store = sessionStore;
  const boundWebContentsId = trustedWindow.webContents.id;
  windowEpochCounter += 1;
  activeWindowBinding = {
    webContentsId: boundWebContentsId,
    epoch: windowEpochCounter,
  };
  if (store === null)
    throw new Error(
      'Session store must be initialized before opening the workspace.',
    );
  const closeBarrier = createWindowCloseBarrier({
    settle: () => acceptedSaves.settle(),
    close: () => {
      if (!trustedWindow.isDestroyed()) trustedWindow.close();
    },
  });
  const closeCoordinator = createCloseCoordinator({
    notify: () => {
      if (!trustedWindow.isDestroyed())
        trustedWindow.webContents.send(SESSION_CLOSE_REQUESTED_CHANNEL);
    },
    close: () => {
      closeBarrier.wait();
    },
  });
  trustedWindow.on('close', (event) => {
    if (!closeCoordinator.request()) {
      event.preventDefault();
      return;
    }
    if (acceptedSaves.hasPending()) {
      event.preventDefault();
      closeBarrier.wait();
    }
  });
  trustedWindow.webContents.on(
    'did-start-navigation',
    (_event, _url, isInPlace, isMainFrame) => {
      if (isMainFrame && !isInPlace) {
        closeCoordinator.disconnect();
        closeBarrier.invalidate();
        // Contract §1: a navigation rebuilds the window binding. Runs from the
        // previous document lose their window and are stopped instead of keep
        // running behind a dead renderer.
        runHost?.manager.abandonWindow(boundWebContentsId);
        windowEpochCounter += 1;
        activeWindowBinding = {
          webContentsId: boundWebContentsId,
          epoch: windowEpochCounter,
        };
      }
    },
  );
  trustedWindow.webContents.on('render-process-gone', () => {
    closeCoordinator.disconnect();
    closeBarrier.invalidate();
    runHost?.manager.abandonWindow(boundWebContentsId);
    windowEpochCounter += 1;
    activeWindowBinding = {
      webContentsId: boundWebContentsId,
      epoch: windowEpochCounter,
    };
  });
  trustedWindow.once('closed', () => {
    closeCoordinator.disconnect();
    closeBarrier.invalidate();
    runHost?.manager.abandonWindow(boundWebContentsId);
    if (activeWindowBinding?.webContentsId === boundWebContentsId) {
      activeWindowBinding = null;
    }
    if (mainWindow === trustedWindow) mainWindow = null;
    appLifecycle.windowClosed();
  });
  for (const channel of [
    ...Object.values(IPC_CHANNELS),
    ...Object.values(SESSION_IPC_CHANNELS),
    ...Object.values(RUN_IPC_CHANNELS),
  ]) {
    ipcMain.removeHandler(channel);
  }
  registerCatalogIpc({
    expectedRendererUrl:
      new URL(MAIN_WINDOW_WEBPACK_ENTRY).protocol === 'file:'
        ? MAIN_WINDOW_WEBPACK_ENTRY
        : new URL(MAIN_WINDOW_WEBPACK_ENTRY).origin,
    ipcMain: {
      handle: (channel, handler) => {
        ipcMain.handle(channel, (event, ...args: unknown[]) =>
          handler(event, ...args),
        );
      },
    },
    mainWindow: {
      webContents: trustedWindow.webContents,
    },
    picker: {
      showOpenDialog: async (_window, options) => {
        if (launchRuntimeConfig !== null) {
          const delayMs = Number(process.env.PIONEER_E2E_PICKER_DELAY_MS ?? 0);
          if (Number.isFinite(delayMs) && delayMs > 0)
            await new Promise<void>((resolve) => {
              setTimeout(resolve, delayMs);
            });
          if (process.env.PIONEER_E2E_PICKER_MODE === 'cancel')
            return { canceled: true, filePaths: [] };
          const configuredRoot = process.env.PIONEER_E2E_PICKER_ROOT;
          if (configuredRoot !== undefined)
            return { canceled: false, filePaths: [configuredRoot] };
        }
        return dialog.showOpenDialog(trustedWindow, {
          properties: [...options.properties],
        });
      },
    },
    service,
  });
  registerSessionStateIpc({
    expectedRendererUrl:
      new URL(MAIN_WINDOW_WEBPACK_ENTRY).protocol === 'file:'
        ? MAIN_WINDOW_WEBPACK_ENTRY
        : new URL(MAIN_WINDOW_WEBPACK_ENTRY).origin,
    ipcMain: {
      handle: (channel, handler) => {
        ipcMain.handle(channel, (event, ...args: unknown[]) =>
          handler(event, ...args),
        );
      },
    },
    mainWindow: { webContents: trustedWindow.webContents },
    store: {
      load: () => store.load(),
      save: (state) => acceptedSaves.track(store.save(state)),
    },
    lifecycle: {
      connect: () => {
        closeCoordinator.connect();
      },
      finish: (decision) => {
        if (decision === 'cancel' || decision === 'failed')
          appLifecycle.cancelQuit();
        closeCoordinator.finish(decision);
      },
    },
  });
  if (runHost !== null) {
    registerRunIpc({
      ipcMain: {
        handle: (channel, handler) => {
          ipcMain.handle(channel, (event, ...args: unknown[]) =>
            handler(event, ...args),
          );
        },
      },
      mainWindow: { webContents: trustedWindow.webContents },
      expectedRendererUrl:
        new URL(MAIN_WINDOW_WEBPACK_ENTRY).protocol === 'file:'
          ? MAIN_WINDOW_WEBPACK_ENTRY
          : new URL(MAIN_WINDOW_WEBPACK_ENTRY).origin,
      manager: runHost.manager,
      windowEpoch: () => activeWindowBinding?.epoch ?? windowEpochCounter,
    });
  }
};

void app.whenReady().then(async () => {
  if (!ownsProfile) return;
  // A02 probe seam: no-credential Pi import/construct/release verification in
  // both the development entry and the packaged build. Startup config only.
  const probeOut = process.env.PIONEER_PI_PROBE_OUT;
  if (probeOut !== undefined && probeOut.length > 0) {
    const report = await probePiRuntime();
    await import('node:fs/promises').then((fs) =>
      fs.writeFile(probeOut, JSON.stringify(report, null, 2), 'utf-8'),
    );
    console.log('[pi-probe]', JSON.stringify(report));
    if (process.env.PIONEER_PI_PROBE_EXIT === '1') {
      app.exit(0);
      return;
    }
  }
  const baseSessions = createSessionStateStore(app.getPath('userData'));
  sessionStore = {
    load: () => baseSessions.load(),
    settled: () => baseSessions.settled(),
    save: async (state) => {
      if (launchRuntimeConfig !== null) {
        const delayMs = Number(
          process.env.PIONEER_E2E_SESSION_SAVE_DELAY_MS ?? 0,
        );
        if (Number.isFinite(delayMs) && delayMs > 0)
          await new Promise<void>((resolve) => {
            setTimeout(resolve, delayMs);
          });
      }
      await baseSessions.save(state);
    },
  };
  const baseSettings = createSettingsStore(app.getPath('userData'));
  let rejectedSave = false;
  let rejectSaveArmed = false;
  const settings =
    launchRuntimeConfig !== null &&
    process.env.PIONEER_E2E_REJECT_SAVE_ONCE === '1'
      ? {
          loadRoot: () => baseSettings.loadRoot(),
          saveRoot: async (rootPath: string) => {
            if (rejectSaveArmed && !rejectedSave) {
              rejectedSave = true;
              throw new Error('E2E settings persistence rejection.');
            }
            return baseSettings.saveRoot(rootPath);
          },
        }
      : baseSettings;
  let rejectedRescan = false;
  const beforeRescan =
    launchRuntimeConfig !== null &&
    (process.env.PIONEER_E2E_RESCAN_DELAY_MS !== undefined ||
      process.env.PIONEER_E2E_RESCAN_FAIL_ONCE === '1')
      ? async () => {
          const delayMs = Number(process.env.PIONEER_E2E_RESCAN_DELAY_MS ?? 0);
          if (Number.isFinite(delayMs) && delayMs > 0)
            await new Promise<void>((resolve) => {
              setTimeout(resolve, delayMs);
            });
          if (
            process.env.PIONEER_E2E_RESCAN_FAIL_ONCE === '1' &&
            !rejectedRescan
          ) {
            rejectedRescan = true;
            throw new Error('E2E rescan failure.');
          }
        }
      : undefined;
  catalogService = new CatalogService({
    scan: scanWorkspace,
    settings,
    beforeRescan,
  });

  runHost = await assembleRunHost({
    userDataPath: app.getPath('userData'),
    resolveProject: async (projectId) => {
      const service = catalogService;
      if (service === null) return null;
      const catalog = await service.getCatalog();
      const project = catalog.projects.find(
        (candidate) => candidate.id === projectId,
      );
      if (project === undefined) return null;
      return { root: project.absolutePath, projectName: project.name };
    },
    windowBindings: {
      epochFor: (webContentsId) =>
        activeWindowBinding?.webContentsId === webContentsId
          ? activeWindowBinding.epoch
          : null,
    },
    sender: {
      send: (webContentsId, batch: RunEventBatch) => {
        if (
          mainWindow !== null &&
          !mainWindow.isDestroyed() &&
          mainWindow.webContents.id === webContentsId
        ) {
          mainWindow.webContents.send(RUN_IPC_CHANNELS.events, batch);
        }
      },
    },
  });

  if (launchRuntimeConfig !== null) {
    await catalogService.selectRoot(launchRuntimeConfig.rootPath);
    rejectSaveArmed = true;
  }

  if (!appLifecycle.isQuitting()) openMainWindow(catalogService);
  appLifecycle.markReady();

  app.on('activate', () => {
    if (
      catalogService !== null &&
      (mainWindow === null || mainWindow.isDestroyed())
    ) {
      appLifecycle.requestReopen();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    appLifecycle.requestQuit();
  }
});

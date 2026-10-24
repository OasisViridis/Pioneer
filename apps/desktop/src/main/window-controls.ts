import type { WindowState } from '../shared/window-state';
import type { WebContentsLike } from './ipc';

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface NativeWindowPort {
  webContents: WebContentsLike;
  isDestroyed(): boolean;
  isFocused(): boolean;
  isMinimized(): boolean;
  isMaximized(): boolean;
  isFullScreen(): boolean;
  getNormalBounds(): WindowBounds;
  setBounds(bounds: WindowBounds): void;
  close(): void;
  minimize(): void;
  maximize(): void;
  unmaximize(): void;
  setFullScreen(value: boolean): void;
  on(event: string, listener: () => void): unknown;
  removeListener(event: string, listener: () => void): unknown;
}
export interface WindowControlOptions {
  window: NativeWindowPort;
  notify(state: WindowState): void;
  requestQuit(): void;
  closeBlockedReason(): WindowState['closeBlockedReason'];
  constrainRestoreBounds(bounds: WindowBounds): WindowBounds;
  defer?(action: () => void): void;
}
/** Narrow native adapter; the app/window close coordinators still own saving. */
export function createWindowControls(options: WindowControlOptions) {
  const window = options.window;
  const defer = (action: () => void): void => {
    if (options.defer) options.defer(action);
    else setImmediate(action);
  };
  let disposed = false;
  let beforeFullscreen: { maximized: boolean; bounds: WindowBounds } | null =
    null;
  let transition: {
    wanted: boolean;
    promise: Promise<void>;
    resolve(): void;
    reject(error: Error): void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  const isUnavailable = (): boolean => disposed || window.isDestroyed();
  const assertAvailable = (): void => {
    if (isUnavailable()) throw new Error('Window unavailable');
  };
  const snapshot = (): WindowState => {
    assertAvailable();
    return {
      focused: window.isFocused(),
      minimized: window.isMinimized(),
      maximized: window.isMaximized(),
      fullscreen: window.isFullScreen(),
      fullscreenTransitioning: transition !== null,
      closeBlockedReason: options.closeBlockedReason(),
    };
  };
  const publish = (): void => {
    if (isUnavailable()) return;
    const state = snapshot();
    // A renderer transport can disappear between liveness read and send. It
    // must not strand a native transition; getWindowState remains authoritative.
    try {
      options.notify(state);
    } catch {
      return;
    }
  };
  const failTransition = (error: Error): void => {
    if (transition === null) return;
    const failed = transition;
    transition = null;
    clearTimeout(failed.timer);
    failed.reject(error);
  };
  const finishTransition = (): void => {
    if (transition === null) return;
    if (window.isFullScreen() !== transition.wanted) return;
    const finished = transition;
    transition = null;
    clearTimeout(finished.timer);
    finished.resolve();
  };
  const restoreBounds = (): void => {
    if (beforeFullscreen === null) return;
    const previous = beforeFullscreen;
    const visibleBounds = options.constrainRestoreBounds(previous.bounds);
    if (previous.maximized) {
      if (!window.isMaximized()) {
        window.setBounds(visibleBounds);
        window.maximize();
      }
    } else {
      if (window.isMaximized()) window.unmaximize();
      window.setBounds(visibleBounds);
    }
    // Only consume recovery data after the native restoration succeeded.
    beforeFullscreen = null;
  };
  const listeners: [string, () => void][] = [
    ...['focus', 'blur', 'minimize', 'restore', 'maximize', 'unmaximize'].map(
      (event) =>
        [
          event,
          () => {
            defer(publish);
          },
        ] as [string, () => void],
    ),
    [
      'enter-full-screen',
      () => {
        // Windows may emit the event inside setFullScreen before isFullScreen
        // reflects it. Read on the next tick, never infer state from the event.
        defer(() => {
          if (isUnavailable()) return;
          finishTransition();
          publish();
        });
      },
    ],
    [
      'leave-full-screen',
      () => {
        defer(() => {
          if (isUnavailable()) return;
          try {
            restoreBounds();
            finishTransition();
          } catch (error) {
            failTransition(
              error instanceof Error
                ? error
                : new Error('Native bounds restoration failed'),
            );
          }
          publish();
        });
      },
    ],
  ];
  for (const [event, listener] of listeners) window.on(event, listener);

  return {
    snapshot,
    isUnavailable,
    publish,
    close(): void {
      assertAvailable();
      // Returning an accepted invoke is not proof the existing close gate passed.
      defer(() => {
        if (!isUnavailable()) window.close();
      });
    },
    quit(): void {
      assertAvailable();
      // A valid accepted app intent survives disposal of its original window.
      defer(() => {
        options.requestQuit();
      });
    },
    minimize(): void {
      assertAvailable();
      window.minimize();
    },
    maximize(): void {
      assertAvailable();
      if (window.isFullScreen() || transition !== null)
        throw new Error('Maximize is unavailable during fullscreen');
      if (window.isMaximized()) window.unmaximize();
      else window.maximize();
    },
    fullscreen(): Promise<void> {
      assertAvailable();
      if (transition !== null) return transition.promise;
      const wanted = !window.isFullScreen();
      const capturedRecovery = wanted && beforeFullscreen === null;
      if (capturedRecovery)
        beforeFullscreen = {
          maximized: window.isMaximized(),
          bounds: { ...window.getNormalBounds() },
        };
      let resolve!: () => void;
      let reject!: (error: Error) => void;
      const promise = new Promise<void>((done, failed) => {
        resolve = done;
        reject = failed;
      });
      const timer = setTimeout(() => {
        if (isUnavailable()) {
          failTransition(new Error('Window unavailable'));
          return;
        }
        failTransition(new Error('Native fullscreen transition timed out'));
        // Keep recovery data: Windows may deliver enter-full-screen late.
        publish();
      }, 5000);
      transition = { wanted, promise, resolve, reject, timer };
      publish();
      try {
        window.setFullScreen(wanted);
      } catch (error) {
        failTransition(
          error instanceof Error
            ? error
            : new Error('Native fullscreen transition failed'),
        );
        if (capturedRecovery && !window.isFullScreen()) beforeFullscreen = null;
        publish();
      }
      return promise;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      failTransition(new Error('Window unavailable'));
      for (const [event, listener] of listeners)
        window.removeListener(event, listener);
    },
  };
}

import type { WindowDesktopApi, WindowState } from '../../shared/window-state';

/** Live events outrank the initial snapshot, including synchronous subscription replay. */
export function observeWindowState(
  api: Pick<WindowDesktopApi, 'getWindowState' | 'onWindowStateChanged'>,
  changed: (state: WindowState) => void,
  failed: () => void,
): () => void {
  let current = true;
  let eventObserved = false;
  const unsubscribe = api.onWindowStateChanged((snapshot) => {
    eventObserved = true;
    if (current) changed(snapshot);
  });
  void api.getWindowState().then(
    (snapshot) => {
      if (current && !eventObserved) changed(snapshot);
    },
    () => {
      if (current && !eventObserved) failed();
    },
  );
  return () => {
    current = false;
    unsubscribe();
  };
}

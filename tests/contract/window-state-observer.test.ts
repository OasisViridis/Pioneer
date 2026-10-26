import { describe, expect, it, vi } from 'vitest';
import { observeWindowState } from '../../apps/desktop/src/renderer/state/window-state-observer';
import type { WindowState } from '../../apps/desktop/src/shared/window-state';

const old: WindowState = {
  focused: false,
  minimized: false,
  maximized: false,
  fullscreen: false,
  fullscreenTransitioning: false,
  closeBlockedReason: null,
};
describe('window snapshot versus live events', () => {
  it('does not report a stale snapshot failure after a valid live event', async () => {
    const changed = vi.fn();
    const failed = vi.fn();
    const dispose = observeWindowState(
      {
        onWindowStateChanged(callback) {
          callback(old);
          return () => undefined;
        },
        getWindowState: () =>
          Promise.reject(new Error('stale snapshot failed')),
      },
      changed,
      failed,
    );
    await Promise.resolve();
    expect(changed).toHaveBeenCalledExactlyOnceWith(old);
    expect(failed).not.toHaveBeenCalled();
    dispose();
  });
  it('keeps a synchronously replayed event instead of overwriting it with a late snapshot', async () => {
    let resolve!: (state: WindowState) => void;
    const changed = vi.fn();
    const failed = vi.fn();
    const current = { ...old, focused: true };
    const unsubscribe = vi.fn();
    const dispose = observeWindowState(
      {
        onWindowStateChanged(callback) {
          callback(current);
          return unsubscribe;
        },
        getWindowState: () =>
          new Promise<WindowState>((done) => {
            resolve = done;
          }),
      },
      changed,
      failed,
    );
    resolve(old);
    await Promise.resolve();
    expect(changed).toHaveBeenCalledExactlyOnceWith(current);
    expect(failed).not.toHaveBeenCalled();
    dispose();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('ignores a snapshot and retained event callback after disposal', async () => {
    let resolve!: (state: WindowState) => void;
    let event!: (state: WindowState) => void;
    const changed = vi.fn();
    const dispose = observeWindowState(
      {
        onWindowStateChanged(callback) {
          event = callback;
          return () => undefined;
        },
        getWindowState: () =>
          new Promise<WindowState>((done) => {
            resolve = done;
          }),
      },
      changed,
      vi.fn(),
    );
    dispose();
    event(old);
    resolve(old);
    await Promise.resolve();
    expect(changed).not.toHaveBeenCalled();
  });
});

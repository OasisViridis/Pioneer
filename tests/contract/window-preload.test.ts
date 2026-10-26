import { describe, expect, it, vi } from 'vitest';
import { createWindowApi } from '../../apps/desktop/src/preload/window-api';
import {
  WINDOW_IPC_CHANNELS,
  WINDOW_STATE_CHANGED_CHANNEL,
  type WindowState,
} from '../../apps/desktop/src/shared/window-state';

const nativeState: WindowState = {
  focused: true,
  minimized: false,
  maximized: false,
  fullscreen: false,
  fullscreenTransitioning: false,
  closeBlockedReason: null,
};
function harness() {
  const listeners = new Map<
    string,
    (event: unknown, ...args: unknown[]) => void
  >();
  const invoke = vi.fn().mockResolvedValue(nativeState);
  const removeListener = vi.fn((channel: string) => {
    listeners.delete(channel);
  });
  const api = createWindowApi({
    invoke,
    on: (channel, listener) => {
      listeners.set(channel, listener);
    },
    removeListener,
  });
  return { api, invoke, removeListener, listeners };
}
describe('window preload adapter', () => {
  it('only invokes six fixed channels without forwarding arguments or exposing main return objects', async () => {
    const h = harness();
    expect(Object.keys(h.api).sort()).toEqual(
      [
        'getWindowState',
        'onWindowStateChanged',
        'closeWindow',
        'minimizeWindow',
        'toggleFullscreen',
        'toggleMaximize',
        'quitApp',
      ].sort(),
    );
    await expect(h.api.getWindowState()).resolves.toEqual(nativeState);
    await expect(h.api.closeWindow()).resolves.toBeUndefined();
    await h.api.minimizeWindow();
    await h.api.toggleFullscreen();
    await h.api.toggleMaximize();
    await h.api.quitApp();
    expect(h.invoke.mock.calls).toEqual([
      [WINDOW_IPC_CHANNELS.state],
      [WINDOW_IPC_CHANNELS.close],
      [WINDOW_IPC_CHANNELS.minimize],
      [WINDOW_IPC_CHANNELS.fullscreen],
      [WINDOW_IPC_CHANNELS.maximize],
      [WINDOW_IPC_CHANNELS.quit],
    ]);
  });
  it('rejects malformed initial native state, including extra fields', async () => {
    const h = harness();
    h.invoke.mockResolvedValue({ ...nativeState, windowId: 42 });
    await expect(h.api.getWindowState()).rejects.toThrow();
    h.invoke.mockResolvedValue({ ...nativeState, fullscreen: 'yes' });
    await expect(h.api.getWindowState()).rejects.toThrow();
  });
  it('passes only validated snapshots to subscriptions, never the Electron event object', () => {
    const h = harness();
    const callback = vi.fn();
    const unsubscribe = h.api.onWindowStateChanged(callback);
    const listener = h.listeners.get(WINDOW_STATE_CHANGED_CHANNEL);
    if (!listener) throw new Error('Window subscription missing');
    listener({ sender: { privateElectronCapability: true } }, nativeState);
    expect(callback.mock.calls).toEqual([[nativeState]]);
    listener({}, { ...nativeState, command: 'destroy' });
    listener({}, nativeState, nativeState);
    listener({}, undefined);
    expect(callback).toHaveBeenCalledTimes(1);
    unsubscribe();
    unsubscribe();
    expect(h.removeListener).toHaveBeenCalledTimes(1);
    expect(h.listeners.size).toBe(0);
    listener({}, nativeState);
    expect(callback).toHaveBeenCalledTimes(1);
  });
  it('propagates action failures without reporting invented state', async () => {
    const h = harness();
    h.invoke.mockRejectedValue(new Error('native transition failed'));
    await expect(h.api.toggleFullscreen()).rejects.toThrow(
      'native transition failed',
    );
  });
});

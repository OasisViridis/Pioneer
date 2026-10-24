import { EventEmitter } from 'node:events';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { BrowserWindow, IpcRenderer } from 'electron';
import type { NativeWindowPort } from '../../apps/desktop/src/main/window-controls';
import type { WindowIpcRendererPort } from '../../apps/desktop/src/preload/window-api';
import { createWindowControls } from '../../apps/desktop/src/main/window-controls';
import { registerWindowIpc } from '../../apps/desktop/src/main/window-ipc';
import { resolveWindowRestoreBounds } from '../../apps/desktop/src/main/window-restore-bounds';
import { WINDOW_IPC_CHANNELS } from '../../apps/desktop/src/shared/window-state';
import type { IpcInvokeEventLike } from '../../apps/desktop/src/main/ipc';

function harness() {
  const events = new EventEmitter();
  const frame = { url: 'file:///C:/Pioneer/index.html' };
  const contents = { id: 42, mainFrame: frame, getURL: () => frame.url };
  let focused = true,
    minimized = false,
    maximized = false,
    fullscreen = false,
    destroyed = false;
  let bounds = { x: 100, y: 80, width: 1200, height: 800 };
  let trayAvailable = true;
  let workAreas = [{ x: 0, y: 0, width: 1920, height: 1040 }];
  const deferred: (() => void)[] = [];
  const native = {
    webContents: contents,
    isDestroyed: () => destroyed,
    isFocused: () => focused,
    isMinimized: () => minimized,
    isMaximized: () => maximized,
    isFullScreen: () => fullscreen,
    getNormalBounds: () => ({ ...bounds }),
    setBounds: vi.fn((next: typeof bounds) => {
      bounds = { ...next };
    }),
    on: events.on.bind(events),
    removeListener: events.removeListener.bind(events),
    close: vi.fn(),
    minimize: vi.fn(),
    maximize: vi.fn(),
    unmaximize: vi.fn(),
    setFullScreen: vi.fn(),
  };
  const notify = vi.fn();
  const requestQuit = vi.fn();
  const controls = createWindowControls({
    window: native,
    notify,
    requestQuit,
    closeBlockedReason: () => (trayAvailable ? null : 'tray-unavailable'),
    constrainRestoreBounds: (bounds) =>
      resolveWindowRestoreBounds(bounds, workAreas),
    defer: (action) => {
      deferred.push(action);
    },
  });
  const handlers = new Map<
    string,
    (event: IpcInvokeEventLike, ...args: unknown[]) => Promise<unknown>
  >();
  const removeHandler = vi.fn((channel: string) => {
    handlers.delete(channel);
  });
  const dispose = registerWindowIpc({
    mainWindow: native,
    expectedRendererUrl: frame.url,
    controls,
    ipcMain: {
      handle: (channel, handler) => {
        handlers.set(channel, handler);
      },
      removeHandler,
    },
  });
  const event = { sender: contents, senderFrame: frame };
  const invoke = (channel: string, args: unknown[] = [], sender = event) => {
    const handler = handlers.get(channel);
    if (!handler) throw new Error('Window handler missing: ' + channel);
    return handler(sender, ...args);
  };
  return {
    native,
    notify,
    controls,
    handlers,
    event,
    frame,
    invoke,
    dispose,
    removeHandler,
    requestQuit,
    runDeferred: () => {
      while (deferred.length) deferred.shift()?.();
    },
    setWorkAreas: (areas: typeof workAreas) => {
      workAreas = areas;
    },
    failTray: () => {
      trayAvailable = false;
    },
    destroy: () => {
      destroyed = true;
    },
    change: (
      state: Partial<{
        focused: boolean;
        minimized: boolean;
        maximized: boolean;
        fullscreen: boolean;
      }>,
      eventName: string,
      eventBeforeState = false,
    ) => {
      if (eventBeforeState) events.emit(eventName);
      if (state.focused !== undefined) focused = state.focused;
      if (state.minimized !== undefined) minimized = state.minimized;
      if (state.maximized !== undefined) maximized = state.maximized;
      if (state.fullscreen !== undefined) fullscreen = state.fullscreen;
      if (!eventBeforeState) events.emit(eventName);
      while (deferred.length) deferred.shift()?.();
    },
    listeners: () =>
      events
        .eventNames()
        .reduce((count, name) => count + events.listenerCount(name), 0),
  };
}

describe('fixed window IPC and native state ownership', () => {
  it('does not overwrite unconsumed recovery bounds when entering fullscreen again after a restore failure', async () => {
    const h = harness();
    const original = h.native.getNormalBounds();
    const enter = h.invoke(WINDOW_IPC_CHANNELS.fullscreen);
    h.change({ fullscreen: true }, 'enter-full-screen');
    await enter;
    h.setWorkAreas([]);
    const leave = h.invoke(WINDOW_IPC_CHANNELS.fullscreen);
    const failed = expect(leave).rejects.toThrow('No usable display work area');
    h.change({ fullscreen: false }, 'leave-full-screen');
    await failed;
    h.native.setBounds({ x: 300, y: 220, width: 900, height: 700 });
    const reenter = h.invoke(WINDOW_IPC_CHANNELS.fullscreen);
    h.change({ fullscreen: true }, 'enter-full-screen');
    await reenter;
    h.setWorkAreas([{ x: 0, y: 0, width: 1920, height: 1040 }]);
    const retryLeave = h.invoke(WINDOW_IPC_CHANNELS.fullscreen);
    h.change({ fullscreen: false }, 'leave-full-screen');
    await retryLeave;
    expect(h.native.setBounds).toHaveBeenLastCalledWith(original);
    h.dispose();
  });
  it('reconciles an event emitted before the native fullscreen flag becomes observable', async () => {
    const h = harness();
    const enter = h.invoke(WINDOW_IPC_CHANNELS.fullscreen);
    const settled = enter.catch(() => {
      /* Dispose may reject during a failed assertion. */
    });
    h.change({ fullscreen: true }, 'enter-full-screen', true);
    try {
      expect(h.controls.snapshot()).toMatchObject({
        fullscreen: true,
        fullscreenTransitioning: false,
      });
      expect(h.notify).toHaveBeenLastCalledWith(
        expect.objectContaining({
          fullscreen: true,
          fullscreenTransitioning: false,
        }),
      );
    } finally {
      h.dispose();
      await settled;
    }
  });
  it('retains restoration data when the current display adapter fails and can recover on a later native leave event', async () => {
    const h = harness();
    const enter = h.invoke(WINDOW_IPC_CHANNELS.fullscreen);
    await Promise.resolve();
    h.change({ fullscreen: true }, 'enter-full-screen');
    await enter;
    h.setWorkAreas([]);
    const leave = h.invoke(WINDOW_IPC_CHANNELS.fullscreen);
    const failed = expect(leave).rejects.toThrow('No usable display work area');
    await Promise.resolve();
    h.change({ fullscreen: false }, 'leave-full-screen');
    await failed;
    expect(h.native.setBounds).not.toHaveBeenCalled();
    h.setWorkAreas([{ x: 0, y: 0, width: 1920, height: 1040 }]);
    h.change({ fullscreen: false }, 'leave-full-screen');
    expect(h.native.setBounds).toHaveBeenLastCalledWith({
      x: 100,
      y: 80,
      width: 1200,
      height: 800,
    });
    h.dispose();
  });
  it('matches installed Electron adapter types without treating types as native runtime proof', () => {
    expectTypeOf<BrowserWindow>().toExtend<NativeWindowPort>();
    expectTypeOf<IpcRenderer>().toExtend<WindowIpcRendererPort>();
  });
  it('rechecks the current display work area when restoring after fullscreen', async () => {
    const h = harness();
    const enter = h.invoke(WINDOW_IPC_CHANNELS.fullscreen);
    await Promise.resolve();
    h.change({ fullscreen: true }, 'enter-full-screen');
    await enter;
    h.setWorkAreas([{ x: 0, y: 0, width: 960, height: 540 }]);
    const leave = h.invoke(WINDOW_IPC_CHANNELS.fullscreen);
    await Promise.resolve();
    h.change({ fullscreen: false }, 'leave-full-screen');
    await leave;
    expect(h.native.setBounds).toHaveBeenLastCalledWith({
      x: 0,
      y: 0,
      width: 960,
      height: 540,
    });
    h.dispose();
  });
  it('preserves pre-fullscreen bounds when a native enter event arrives after the timeout', async () => {
    vi.useFakeTimers();
    const h = harness();
    const enter = h.invoke(WINDOW_IPC_CHANNELS.fullscreen);
    const failed = expect(enter).rejects.toThrow(
      'Native fullscreen transition timed out',
    );
    await vi.advanceTimersByTimeAsync(5000);
    await failed;
    h.change({ fullscreen: true }, 'enter-full-screen');
    const leave = h.invoke(WINDOW_IPC_CHANNELS.fullscreen);
    await Promise.resolve();
    h.change({ fullscreen: false }, 'leave-full-screen');
    await leave;
    expect(h.native.setBounds).toHaveBeenLastCalledWith({
      x: 100,
      y: 80,
      width: 1200,
      height: 800,
    });
    h.dispose();
    vi.useRealTimers();
  });
  it('keeps native commands and state readback coherent when the renderer notification transport fails', async () => {
    const h = harness();
    h.notify.mockImplementation(() => {
      throw new Error('renderer disappeared');
    });
    const enter = h.invoke(WINDOW_IPC_CHANNELS.fullscreen);
    const result = expect(enter).resolves.toBeUndefined();
    await Promise.resolve();
    h.change({ fullscreen: true }, 'enter-full-screen');
    await result;
    expect(h.controls.snapshot()).toMatchObject({
      fullscreen: true,
      fullscreenTransitioning: false,
    });
    h.dispose();
  });
  it('survives external native fullscreen events without fabricating bounds or state', () => {
    const h = harness();
    h.change({ fullscreen: true }, 'enter-full-screen');
    expect(h.controls.snapshot()).toMatchObject({
      fullscreen: true,
      fullscreenTransitioning: false,
    });
    h.change({ fullscreen: false }, 'leave-full-screen');
    expect(h.native.setBounds).not.toHaveBeenCalled();
    expect(h.controls.snapshot()).toMatchObject({ fullscreen: false });
    h.dispose();
  });
  it('registers only the six named channels and reads main-owned state without writes', async () => {
    const h = harness();
    expect([...h.handlers.keys()].sort()).toEqual(
      Object.values(WINDOW_IPC_CHANNELS).sort(),
    );
    await expect(h.invoke(WINDOW_IPC_CHANNELS.state)).resolves.toEqual({
      focused: true,
      minimized: false,
      maximized: false,
      fullscreen: false,
      fullscreenTransitioning: false,
      closeBlockedReason: null,
    });
    h.failTray();
    expect(await h.invoke(WINDOW_IPC_CHANNELS.state)).toMatchObject({
      closeBlockedReason: 'tray-unavailable',
    });
    expect(h.native.close).not.toHaveBeenCalled();
    h.dispose();
  });
  it.each(Object.values(WINDOW_IPC_CHANNELS))(
    'rejects arguments and foreign / child-frame / wrong-URL senders before effects on %s',
    async (channel) => {
      const h = harness();
      await expect(
        h.invoke(channel, [{ method: 'destroy', args: ['C:/data'] }]),
      ).rejects.toThrow('Invalid window request');
      const handler = h.handlers.get(channel);
      if (!handler) throw new Error('Window handler missing');
      const foreign = { ...h.event, sender: { ...h.event.sender, id: 43 } };
      await expect(handler(foreign)).rejects.toThrow('Untrusted IPC sender');
      await expect(
        handler({ ...h.event, senderFrame: { url: h.frame.url } }),
      ).rejects.toThrow('Untrusted IPC sender');
      await expect(handler({ ...h.event, senderFrame: null })).rejects.toThrow(
        'Untrusted IPC sender',
      );
      h.frame.url = 'file:///C:/Pioneer/other.html';
      await expect(handler(h.event)).rejects.toThrow('Untrusted IPC sender');
      h.runDeferred();
      expect(h.native.close).not.toHaveBeenCalled();
      expect(h.native.minimize).not.toHaveBeenCalled();
      expect(h.native.maximize).not.toHaveBeenCalled();
      expect(h.native.setFullScreen).not.toHaveBeenCalled();
      expect(h.requestQuit).not.toHaveBeenCalled();
      h.dispose();
    },
  );
  it('settles close and quit invokes before entering native close or app intent', async () => {
    const h = harness();
    await h.invoke(WINDOW_IPC_CHANNELS.close);
    await h.invoke(WINDOW_IPC_CHANNELS.quit);
    expect(h.native.close).not.toHaveBeenCalled();
    expect(h.requestQuit).not.toHaveBeenCalled();
    h.runDeferred();
    expect(h.native.close).toHaveBeenCalledTimes(1);
    expect(h.requestQuit).toHaveBeenCalledTimes(1);
    h.dispose();
  });
  it('does not infer native state from a requested minimize or maximize; publishes native event readback', async () => {
    const h = harness();
    await h.invoke(WINDOW_IPC_CHANNELS.minimize);
    await h.invoke(WINDOW_IPC_CHANNELS.maximize);
    expect(h.native.minimize).toHaveBeenCalledTimes(1);
    expect(h.native.maximize).toHaveBeenCalledTimes(1);
    expect(h.controls.snapshot()).toMatchObject({
      minimized: false,
      maximized: false,
    });
    h.change({ minimized: true, focused: false }, 'minimize');
    expect(h.notify).toHaveBeenLastCalledWith(
      expect.objectContaining({ minimized: true, focused: false }),
    );
    h.change({ maximized: true }, 'maximize');
    await h.invoke(WINDOW_IPC_CHANNELS.maximize);
    expect(h.native.unmaximize).toHaveBeenCalledTimes(1);
    h.dispose();
  });
  it('coalesces native fullscreen transitions and restores normal bounds without confusing maximize', async () => {
    const h = harness();
    const first = h.invoke(WINDOW_IPC_CHANNELS.fullscreen),
      repeated = h.invoke(WINDOW_IPC_CHANNELS.fullscreen);
    await Promise.resolve();
    expect(h.native.setFullScreen).toHaveBeenCalledTimes(1);
    expect(h.controls.snapshot()).toMatchObject({
      fullscreen: false,
      fullscreenTransitioning: true,
    });
    await expect(h.invoke(WINDOW_IPC_CHANNELS.maximize)).rejects.toThrow(
      'Maximize is unavailable during fullscreen',
    );
    h.change({ fullscreen: true }, 'enter-full-screen');
    await first;
    await repeated;
    const leave = h.invoke(WINDOW_IPC_CHANNELS.fullscreen);
    await Promise.resolve();
    h.change({ fullscreen: false }, 'leave-full-screen');
    await leave;
    expect(h.native.setBounds).toHaveBeenLastCalledWith({
      x: 100,
      y: 80,
      width: 1200,
      height: 800,
    });
    expect(h.controls.snapshot()).toMatchObject({
      fullscreen: false,
      fullscreenTransitioning: false,
    });
    h.dispose();
  });
  it('restores a previously maximized window after native fullscreen exit', async () => {
    const h = harness();
    h.change({ maximized: true }, 'maximize');
    const enter = h.invoke(WINDOW_IPC_CHANNELS.fullscreen);
    await Promise.resolve();
    h.change({ fullscreen: true, maximized: false }, 'enter-full-screen');
    await enter;
    const leave = h.invoke(WINDOW_IPC_CHANNELS.fullscreen);
    await Promise.resolve();
    h.change({ fullscreen: false }, 'leave-full-screen');
    await leave;
    expect(h.native.maximize).toHaveBeenCalledTimes(1);
    h.dispose();
  });
  it('removes old IPC/listeners and rejects stale invokes before a reopened writer is bound', async () => {
    const h = harness();
    const stale = h.handlers.get(WINDOW_IPC_CHANNELS.close);
    if (!stale) throw new Error('Window handler missing');
    expect(h.listeners()).toBeGreaterThan(0);
    h.dispose();
    h.dispose();
    expect(h.listeners()).toBe(0);
    expect(h.handlers.size).toBe(0);
    expect(h.removeHandler).toHaveBeenCalledTimes(6);
    await expect(stale(h.event)).rejects.toThrow('Window unavailable');
    h.runDeferred();
    expect(h.native.close).not.toHaveBeenCalled();
  });
  it('cancels a deferred window close after disposal but preserves an already accepted app quit intent', async () => {
    const h = harness();
    await h.invoke(WINDOW_IPC_CHANNELS.close);
    await h.invoke(WINDOW_IPC_CHANNELS.quit);
    h.dispose();
    h.runDeferred();
    expect(h.native.close).not.toHaveBeenCalled();
    expect(h.requestQuit).toHaveBeenCalledTimes(1);
    const notifications = h.notify.mock.calls.length;
    h.change({ focused: false }, 'blur');
    expect(h.notify).toHaveBeenCalledTimes(notifications);
  });
  it('rejects destroyed-window senders and clears pending fullscreen on disposal', async () => {
    const h = harness();
    const transition = h.invoke(WINDOW_IPC_CHANNELS.fullscreen);
    const outcome = expect(transition).rejects.toThrow('Window unavailable');
    await Promise.resolve();
    h.destroy();
    await expect(h.invoke(WINDOW_IPC_CHANNELS.minimize)).rejects.toThrow(
      'Window unavailable',
    );
    h.dispose();
    await outcome;
  });
  it('reports a missing native fullscreen event as failure, not permanent busy or fabricated success', async () => {
    vi.useFakeTimers();
    const h = harness();
    const transition = h.invoke(WINDOW_IPC_CHANNELS.fullscreen);
    const outcome = expect(transition).rejects.toThrow(
      'Native fullscreen transition timed out',
    );
    await vi.advanceTimersByTimeAsync(5000);
    await outcome;
    expect(h.controls.snapshot()).toMatchObject({
      fullscreen: false,
      fullscreenTransitioning: false,
    });
    h.dispose();
    vi.useRealTimers();
  });
});

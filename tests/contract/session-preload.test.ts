import { describe, expect, it, vi } from 'vitest';
import { createSessionApi } from '../../apps/desktop/src/preload/session-api';
import {
  SESSION_CLOSE_REQUESTED_CHANNEL,
  SESSION_IPC_CHANNELS,
} from '../../apps/desktop/src/shared/contracts/session-ipc';
import { initialSessionWorkspaceState } from '../../apps/desktop/src/renderer/state/session-workspace-reducer';

describe('session preload facade', () => {
  it('supports empty first launch, validates activity, and returns no native close result', async () => {
    const invoke = vi.fn().mockResolvedValue(null);
    const api = createSessionApi({
      invoke,
      on: vi.fn(),
      removeListener: vi.fn(),
    });
    await expect(api.loadSessionState()).resolves.toBeNull();
    invoke.mockResolvedValue({ sessions: [], workspaces: [] });
    await expect(api.getSessionActivity()).resolves.toEqual({
      sessions: [],
      workspaces: [],
    });
    invoke.mockResolvedValue({ sessions: [], workspaces: [], execute: true });
    await expect(api.getSessionActivity()).rejects.toThrow();
    invoke.mockResolvedValue({ secret: 'main object' });
    await expect(api.finishClose('saved')).resolves.toBeUndefined();
    expect(invoke.mock.calls.at(-1)).toEqual([
      SESSION_IPC_CHANNELS.closeResult,
      'saved',
    ]);
  });
  it('uses fixed validated channels and never exposes the Electron event', async () => {
    const invoke = vi.fn().mockResolvedValue(initialSessionWorkspaceState);
    const on = vi.fn();
    const removeListener = vi.fn();
    const api = createSessionApi({ invoke, on, removeListener });
    await expect(api.loadSessionState()).resolves.toEqual(
      initialSessionWorkspaceState,
    );
    await api.saveSessionState(initialSessionWorkspaceState);
    expect(invoke.mock.calls).toEqual([
      [SESSION_IPC_CHANNELS.load],
      [SESSION_IPC_CHANNELS.save, initialSessionWorkspaceState],
    ]);
    const callback = vi.fn();
    const unsubscribe = api.onCloseRequested(callback);
    expect(on.mock.calls[0]?.[0]).toBe(SESSION_CLOSE_REQUESTED_CHANNEL);
    const listener = on.mock.calls[0]?.[1] as (
      event: unknown,
      ...args: unknown[]
    ) => void;
    listener({ secret: 'native capability' });
    listener({}, 'unexpected payload');
    expect(callback.mock.calls).toEqual([[]]);
    unsubscribe();
    unsubscribe();
    listener({});
    expect(callback).toHaveBeenCalledTimes(1);
    expect(removeListener).toHaveBeenCalledTimes(1);
  });
  it('rejects corrupt data and invalid close decisions before invoking main', async () => {
    const invoke = vi
      .fn()
      .mockResolvedValue({ ...initialSessionWorkspaceState, command: 'exec' });
    const api = createSessionApi({
      invoke,
      on: vi.fn(),
      removeListener: vi.fn(),
    });
    await expect(api.loadSessionState()).rejects.toThrow();
    invoke.mockClear();
    await expect(api.finishClose('execute' as never)).rejects.toThrow();
    expect(invoke).not.toHaveBeenCalled();
    invoke.mockRejectedValue(new Error('disk failure'));
    await expect(
      api.saveSessionState(initialSessionWorkspaceState),
    ).rejects.toThrow('disk failure');
  });
});

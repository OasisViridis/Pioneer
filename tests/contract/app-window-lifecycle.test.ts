import { describe, expect, it, vi } from 'vitest';
import { createAppWindowCoordinator } from '../../apps/desktop/src/main/app-window-lifecycle';

function harness() {
  let hasWindow = false;
  let trayAvailable = true;
  const actions = {
    hasWindow: () => hasWindow,
    trayAvailable: () => trayAvailable,
    open: vi.fn(() => {
      hasWindow = true;
    }),
    focus: vi.fn(),
    close: vi.fn(),
    quit: vi.fn(),
    reportTrayUnavailable: vi.fn(),
    reportOperationFailure: vi.fn(),
    settleAcceptedSaves: vi.fn().mockResolvedValue(undefined),
  };
  const coordinator = createAppWindowCoordinator(actions);
  return {
    actions,
    coordinator,
    removeWindow: () => {
      hasWindow = false;
    },
    failTray: () => {
      trayAvailable = false;
    },
  };
}

describe('app-owned close / quit / reopen intent', () => {
  it('distinguishes a system-ending intent from user quit while sharing the save gate, and clears both on cancellation', () => {
    const h = harness();
    h.coordinator.markReady();
    h.coordinator.requestReopen();
    expect(h.coordinator.getQuitReason()).toBeNull();
    h.coordinator.requestQuit();
    expect(h.coordinator.getQuitReason()).toBe('user');
    h.coordinator.requestQuit('system-ending');
    expect(h.coordinator.getQuitReason()).toBe('system-ending');
    expect(h.actions.close).toHaveBeenCalledTimes(1);
    h.coordinator.cancelQuit();
    expect(h.coordinator.getQuitReason()).toBeNull();
    expect(h.coordinator.isQuitting()).toBe(false);
  });
  it('reports a focus failure separately without opening a duplicate writer', () => {
    const h = harness();
    h.coordinator.markReady();
    h.coordinator.requestReopen();
    h.actions.focus.mockImplementationOnce(() => {
      throw new Error('focus failed');
    });
    h.coordinator.requestReopen();
    expect(h.actions.open).toHaveBeenCalledTimes(1);
    expect(h.actions.reportOperationFailure).toHaveBeenCalledWith(
      'focus-failed',
    );
  });
  it('clears explicit quit intent when requesting native close throws', () => {
    const h = harness();
    h.coordinator.markReady();
    h.coordinator.requestReopen();
    h.actions.close.mockImplementationOnce(() => {
      throw new Error('native close failed');
    });
    expect(() => {
      h.coordinator.requestQuit();
    }).not.toThrow();
    expect(h.coordinator.isQuitting()).toBe(false);
    expect(h.coordinator.allowFinalQuit()).toBe(false);
    expect(h.actions.reportOperationFailure).toHaveBeenCalledWith(
      'quit-failed',
    );
    expect(h.coordinator.allowWindowClose()).toBe(true);
    expect(h.actions.quit).not.toHaveBeenCalled();
  });
  it('clears the final quit gate and restores a window when app quit throws', async () => {
    const h = harness();
    h.actions.quit.mockImplementationOnce(() => {
      throw new Error('quit failed');
    });
    h.coordinator.markReady();
    h.coordinator.requestQuit();
    await Promise.resolve();
    await Promise.resolve();
    expect(h.coordinator.isQuitting()).toBe(false);
    expect(h.coordinator.allowFinalQuit()).toBe(false);
    expect(h.actions.reportOperationFailure).toHaveBeenCalledWith(
      'quit-failed',
    );
    expect(h.actions.open).toHaveBeenCalledTimes(1);
  });
  it('recovers a synchronous barrier failure instead of leaving a poisoned quit intent', () => {
    const h = harness();
    h.actions.settleAcceptedSaves.mockImplementationOnce(() => {
      throw new Error('barrier could not start');
    });
    h.coordinator.markReady();
    expect(() => {
      h.coordinator.requestQuit();
    }).not.toThrow();
    expect(h.coordinator.isQuitting()).toBe(false);
    expect(h.actions.reportOperationFailure).toHaveBeenCalledWith(
      'write-barrier-failed',
    );
    expect(h.actions.open).toHaveBeenCalledTimes(1);
    expect(h.actions.quit).not.toHaveBeenCalled();
  });
  it('defers early quit until initialization and suppresses conflicting early reopen requests', async () => {
    const h = harness();
    h.coordinator.requestReopen();
    h.coordinator.requestQuit();
    h.coordinator.requestQuit();
    h.coordinator.requestReopen();
    expect(h.actions.open).not.toHaveBeenCalled();
    expect(h.actions.settleAcceptedSaves).not.toHaveBeenCalled();
    h.coordinator.markReady();
    await Promise.resolve();
    await Promise.resolve();
    expect(h.actions.open).not.toHaveBeenCalled();
    expect(h.actions.quit).toHaveBeenCalledTimes(1);
  });
  it('ignores the old failed barrier when cancellation has allowed a new window', async () => {
    const h = harness();
    let reject!: (error: Error) => void;
    h.actions.settleAcceptedSaves.mockImplementation(
      () =>
        new Promise<void>((_resolve, fail) => {
          reject = fail;
        }),
    );
    h.coordinator.markReady();
    h.coordinator.requestQuit();
    h.coordinator.cancelQuit();
    h.coordinator.requestReopen();
    reject(new Error('stale failure'));
    await Promise.resolve();
    await Promise.resolve();
    expect(h.actions.reportOperationFailure).not.toHaveBeenCalled();
    expect(h.actions.open).toHaveBeenCalledTimes(1);
    expect(h.actions.quit).not.toHaveBeenCalled();
  });
  it('requires a fresh barrier for a new quit generation while the old barrier is still settling', async () => {
    const h = harness();
    const finishes: (() => void)[] = [];
    h.actions.settleAcceptedSaves.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishes.push(resolve);
        }),
    );
    h.coordinator.markReady();
    h.coordinator.requestQuit();
    h.coordinator.cancelQuit();
    h.coordinator.requestQuit();
    finishes[0]?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(h.actions.quit).not.toHaveBeenCalled();
    finishes[1]?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(h.actions.quit).toHaveBeenCalledTimes(1);
  });
  it('reports an open failure without an unhandled rejection and allows a later reopen retry', () => {
    const h = harness();
    h.actions.open.mockImplementationOnce(() => {
      throw new Error('native open failed');
    });
    h.coordinator.markReady();
    expect(() => {
      h.coordinator.requestReopen();
    }).not.toThrow();
    expect(h.actions.reportOperationFailure).toHaveBeenCalledWith(
      'open-failed',
    );
    h.coordinator.requestReopen();
    expect(h.actions.open).toHaveBeenCalledTimes(2);
  });
  it('does not strand a quit if an external native window appeared during the barrier', async () => {
    const h = harness();
    let settle!: () => void;
    h.actions.settleAcceptedSaves.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          settle = resolve;
        }),
    );
    h.coordinator.markReady();
    h.coordinator.requestQuit();
    h.actions.open();
    settle();
    await Promise.resolve();
    await Promise.resolve();
    expect(h.actions.close).toHaveBeenCalledTimes(1);
    h.removeWindow();
    h.coordinator.windowClosed();
    settle();
    await Promise.resolve();
    await Promise.resolve();
    expect(h.actions.quit).toHaveBeenCalledTimes(1);
  });
  it('coalesces early second-instance requests until readiness, then reuses one writer', () => {
    const h = harness();
    h.coordinator.requestReopen();
    h.coordinator.requestReopen();
    expect(h.actions.open).not.toHaveBeenCalled();
    h.coordinator.markReady();
    expect(h.actions.open).toHaveBeenCalledTimes(1);
    h.coordinator.requestReopen();
    expect(h.actions.open).toHaveBeenCalledTimes(1);
    expect(h.actions.focus).toHaveBeenCalled();
  });
  it('keeps the app alive after ordinary last-window close, and reopens', () => {
    const h = harness();
    h.coordinator.markReady();
    h.coordinator.requestReopen();
    expect(h.coordinator.allowWindowClose()).toBe(true);
    h.removeWindow();
    h.coordinator.windowClosed();
    expect(h.actions.quit).not.toHaveBeenCalled();
    h.coordinator.requestReopen();
    expect(h.actions.open).toHaveBeenCalledTimes(2);
  });
  it('retains an actionable window when tray is unavailable, without changing close into quit', () => {
    const h = harness();
    h.coordinator.markReady();
    h.coordinator.requestReopen();
    h.failTray();
    expect(h.coordinator.allowWindowClose()).toBe(false);
    expect(h.actions.reportTrayUnavailable).toHaveBeenCalledTimes(1);
    expect(h.actions.quit).not.toHaveBeenCalled();
    expect(h.coordinator.isQuitting()).toBe(false);
    h.coordinator.requestQuit();
    expect(h.coordinator.allowWindowClose()).toBe(true);
    expect(h.actions.close).toHaveBeenCalledTimes(1);
  });
  it('coalesces explicit quit through the existing close gate and rejects reopen until cancellation', () => {
    const h = harness();
    h.coordinator.markReady();
    h.coordinator.requestReopen();
    h.coordinator.requestQuit();
    h.coordinator.requestQuit();
    h.coordinator.requestReopen();
    expect(h.actions.close).toHaveBeenCalledTimes(1);
    expect(h.actions.quit).not.toHaveBeenCalled();
    expect(h.actions.open).toHaveBeenCalledTimes(1);
    h.coordinator.cancelQuit();
    expect(h.coordinator.isQuitting()).toBe(false);
    expect(h.coordinator.allowWindowClose()).toBe(true);
    h.removeWindow();
    h.coordinator.windowClosed();
    expect(h.actions.quit).not.toHaveBeenCalled();
  });
  it('waits for accepted writes before an explicit no-window quit and only then allows before-quit', async () => {
    const h = harness();
    let settle: (() => void) | undefined;
    h.actions.settleAcceptedSaves.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          settle = resolve;
        }),
    );
    h.coordinator.markReady();
    h.coordinator.requestQuit();
    expect(h.coordinator.allowFinalQuit()).toBe(false);
    h.coordinator.requestReopen();
    expect(h.actions.open).not.toHaveBeenCalled();
    settle?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(h.actions.quit).toHaveBeenCalledTimes(1);
    expect(h.coordinator.allowFinalQuit()).toBe(true);
  });
  it('does not let a stale settling quit race terminate a canceled / reopened application', async () => {
    const h = harness();
    let settle: (() => void) | undefined;
    h.actions.settleAcceptedSaves.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          settle = resolve;
        }),
    );
    h.coordinator.markReady();
    h.coordinator.requestQuit();
    h.coordinator.cancelQuit();
    h.coordinator.requestReopen();
    settle?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(h.actions.open).toHaveBeenCalledTimes(1);
    expect(h.actions.quit).not.toHaveBeenCalled();
    expect(h.coordinator.allowFinalQuit()).toBe(false);
  });
  it('quits only after the saved or explicitly discarded window actually closed', async () => {
    const h = harness();
    h.coordinator.markReady();
    h.coordinator.requestReopen();
    h.coordinator.requestQuit();
    expect(h.actions.settleAcceptedSaves).not.toHaveBeenCalled();
    h.removeWindow();
    h.coordinator.windowClosed();
    await Promise.resolve();
    await Promise.resolve();
    expect(h.actions.settleAcceptedSaves).toHaveBeenCalledTimes(1);
    expect(h.actions.quit).toHaveBeenCalledTimes(1);
  });
  it('returns to actionable state on a rejected final-settle barrier', async () => {
    const h = harness();
    h.actions.settleAcceptedSaves.mockRejectedValue(
      new Error('write barrier failed'),
    );
    h.coordinator.markReady();
    h.coordinator.requestQuit();
    await Promise.resolve();
    await Promise.resolve();
    expect(h.coordinator.isQuitting()).toBe(false);
    expect(h.actions.quit).not.toHaveBeenCalled();
    expect(h.actions.open).toHaveBeenCalledTimes(1);
  });
});

export interface AppWindowActions {
  hasWindow(): boolean;
  trayAvailable(): boolean;
  open(): void;
  focus(): void;
  close(): void;
  quit(): void;
  reportTrayUnavailable(): void;
  reportOperationFailure(
    reason:
      'open-failed' | 'focus-failed' | 'quit-failed' | 'write-barrier-failed',
  ): void;
  settleAcceptedSaves(): Promise<void>;
}

/** App intent only. Never replaces the window's renderer flush / close gate. */
export function createAppWindowCoordinator(actions: AppWindowActions) {
  let ready = false;
  let reopenPending = false;
  let quitting = false;
  let quitReason: 'user' | 'system-ending' | null = null;
  let finalQuitAllowed = false;
  let generation = 0;
  let settlingGeneration: number | null = null;

  const focus = (): void => {
    try {
      actions.focus();
    } catch {
      actions.reportOperationFailure('focus-failed');
    }
  };

  const reopen = (): void => {
    if (quitting || finalQuitAllowed) return;
    if (!ready) {
      reopenPending = true;
      return;
    }
    reopenPending = false;
    try {
      if (!actions.hasWindow()) actions.open();
    } catch {
      actions.reportOperationFailure('open-failed');
      return;
    }
    focus();
  };
  const cancelQuit = (): void => {
    quitting = false;
    quitReason = null;
    finalQuitAllowed = false;
    generation += 1;
    settlingGeneration = null;
  };
  const finishQuit = (): void => {
    if (
      !ready ||
      !quitting ||
      actions.hasWindow() ||
      settlingGeneration === generation
    )
      return;
    const acceptedGeneration = generation;
    settlingGeneration = acceptedGeneration;
    let writes: Promise<void>;
    try {
      writes = actions.settleAcceptedSaves();
    } catch {
      cancelQuit();
      actions.reportOperationFailure('write-barrier-failed');
      reopen();
      return;
    }
    void writes.then(
      () => {
        if (!quitting || generation !== acceptedGeneration) return;
        if (actions.hasWindow()) {
          // Defensive: an external open must not strand a completed barrier.
          settlingGeneration = null;
          try {
            actions.close();
          } catch {
            cancelQuit();
            actions.reportOperationFailure('quit-failed');
          }
          return;
        }
        finalQuitAllowed = true;
        try {
          actions.quit();
        } catch {
          cancelQuit();
          actions.reportOperationFailure('quit-failed');
          reopen();
        }
      },
      () => {
        if (!quitting || generation !== acceptedGeneration) return;
        cancelQuit();
        actions.reportOperationFailure('write-barrier-failed');
        reopen();
      },
    );
  };

  return {
    markReady(): void {
      ready = true;
      if (quitting) finishQuit();
      else if (reopenPending) reopen();
    },
    requestReopen: reopen,
    requestQuit(reason: 'user' | 'system-ending' = 'user'): void {
      if (finalQuitAllowed) return;
      if (quitting) {
        if (reason === 'system-ending') quitReason = reason;
        return;
      }
      quitting = true;
      quitReason = reason;
      reopenPending = false;
      generation += 1;
      if (actions.hasWindow()) {
        try {
          actions.close();
        } catch {
          cancelQuit();
          actions.reportOperationFailure('quit-failed');
        }
      } else finishQuit();
    },
    cancelQuit,
    windowClosed: finishQuit,
    allowWindowClose(): boolean {
      if (quitting || actions.trayAvailable()) return true;
      actions.reportTrayUnavailable();
      focus();
      return false;
    },
    isQuitting: (): boolean => quitting,
    getQuitReason: (): 'user' | 'system-ending' | null => quitReason,
    allowFinalQuit: (): boolean => finalQuitAllowed,
  };
}

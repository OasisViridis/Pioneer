import type { CloseDecision } from '../shared/contracts/session-ipc';

/** Waits for accepted main-process saves, including work queued before hydration. */
export function createPendingSaveTracker() {
  const pending = new Set<Promise<unknown>>();
  return {
    track<T>(operation: Promise<T>): Promise<T> {
      pending.add(operation);
      void operation.then(
        () => pending.delete(operation),
        () => pending.delete(operation),
      );
      return operation;
    },
    hasPending(): boolean {
      return pending.size > 0;
    },
    async settle(): Promise<void> {
      while (pending.size > 0) await Promise.allSettled([...pending]);
    },
  };
}

/** A close barrier belongs to one renderer lifetime, not a replacement page. */
export function createWindowCloseBarrier(actions: {
  settle(): Promise<void>;
  close(): void;
}) {
  let generation = 0;
  let waiting = false;
  return {
    wait(): void {
      if (waiting) return;
      waiting = true;
      const current = generation;
      void actions.settle().then(() => {
        if (generation !== current) return;
        waiting = false;
        actions.close();
      });
    },
    invalidate(): void {
      generation += 1;
      waiting = false;
    },
  };
}

/** Main owns the close gate. Renderer cannot close another window or bypass a pending flush implicitly. */
export function createCloseCoordinator(actions: {
  notify(): void;
  close(): void;
}) {
  let connected = false;
  let pending = false;
  let requestedAgain = false;
  let permitted = false;
  return {
    connect(): void {
      connected = true;
      if (pending) actions.notify();
    },
    disconnect(): void {
      connected = false;
      pending = false;
      requestedAgain = false;
      permitted = false;
    },
    request(): boolean {
      if (!connected || permitted) return true;
      if (!pending) {
        pending = true;
        actions.notify();
      } else requestedAgain = true;
      return false;
    },
    finish(decision: CloseDecision): void {
      if (!pending) return;
      if (decision === 'failed') {
        requestedAgain = false;
        return;
      }
      if (decision === 'cancel' && requestedAgain) {
        requestedAgain = false;
        actions.notify();
        return;
      }
      pending = false;
      requestedAgain = false;
      if (decision === 'cancel') return;
      permitted = true;
      actions.close();
    },
  };
}

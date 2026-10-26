import type { SessionWorkspaceState } from '../../shared/contracts/session-workspace';

export interface SessionSaveStatus {
  status: 'saved' | 'saving' | 'error';
  error: string | null;
}

/** One write at a time. Intermediate snapshots may coalesce, but the latest never disappears on failure. */
export function createSessionSaveQueue(
  save: (state: SessionWorkspaceState) => Promise<void>,
  changed: (status: SessionSaveStatus) => void,
) {
  let pending: SessionWorkspaceState | null = null;
  let active: Promise<void> | null = null;
  let failure: Error | null = null;
  const drain = async (): Promise<void> => {
    while (pending) {
      const snapshot = pending;
      pending = null;
      try {
        await save(snapshot);
      } catch (error) {
        pending ??= snapshot;
        failure = error instanceof Error ? error : new Error('会话保存失败');
        changed({ status: 'error', error: failure.message });
        return;
      }
    }
    changed({ status: 'saved', error: null });
  };
  const start = (): void => {
    if (active || failure || !pending) return;
    changed({ status: 'saving', error: null });
    active = drain().finally(() => {
      active = null;
      start();
    });
  };
  const flush = async (): Promise<void> => {
    start();
    while (active) await active;
    if (failure) throw failure;
  };
  return {
    enqueue(state: SessionWorkspaceState): void {
      pending = state;
      start();
    },
    isDirty: (): boolean => pending !== null || active !== null,
    flush,
    retry: async (): Promise<void> => {
      failure = null;
      await flush();
    },
  };
}

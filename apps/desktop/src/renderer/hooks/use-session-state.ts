import { useCallback, useEffect, useRef, useState } from 'react';
import type { SessionDesktopApi } from '../../shared/contracts/session-ipc';
import type { SessionWorkspaceState } from '../../shared/contracts/session-workspace';
import { SessionStateSchema } from '../../shared/session-state';
import { awaitCloseFlush } from '../state/close-deadline';
import {
  initialSessionWorkspaceState,
  sessionWorkspaceReducer,
  type SessionWorkspaceAction,
} from '../state/session-workspace-reducer';
import {
  createSessionSaveQueue,
  type SessionSaveStatus,
} from '../state/session-save-queue';

/** Hydrates before accepting actions; UI snapshots never authorize workspace operations. */
export function useSessionState(initialApi: SessionDesktopApi) {
  // One host port per hook lifetime; remount when changing hosts.
  const [api] = useState(() => initialApi);
  const [state, setState] = useState<SessionWorkspaceState>(
    initialSessionWorkspaceState,
  );
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SessionSaveStatus>({
    status: 'saved',
    error: null,
  });
  const [retryLoad, setRetryLoad] = useState(0);
  const latest = useRef(initialSessionWorkspaceState);
  const ready = useRef(false);
  const closing = useRef(false);
  const closeAttempt = useRef(0);
  const allowUnload = useRef(false);
  const [closePhase, setClosePhase] = useState<'saving' | 'error' | null>(null);
  const [reloadHeld, setReloadHeld] = useState(false);
  const [queue] = useState(() =>
    createSessionSaveQueue(
      (snapshot) => api.saveSessionState(snapshot),
      setSaveStatus,
    ),
  );
  const completeClose = useCallback(
    async (retrySave = false): Promise<void> => {
      const attempt = ++closeAttempt.current;
      closing.current = true;
      setClosePhase('saving');
      try {
        await awaitCloseFlush(retrySave ? queue.retry() : queue.flush());
        if (closeAttempt.current !== attempt) return;
        allowUnload.current = true;
        await api.finishClose('saved');
      } catch {
        if (closeAttempt.current !== attempt) return;
        allowUnload.current = false;
        setClosePhase('error');
        // Failed persistence clears app-quit intent, not the actionable close
        // dialog. Retrying later must not silently inherit that old quit intent.
        try {
          await api.finishClose('failed');
        } catch {
          /* Visible persistence error remains actionable. */
        }
      }
    },
    [api, queue],
  );
  // Subscribe before asking main to load; main does not wait for a renderer that
  // has not connected yet. No close request can fall between load and subscription.
  useEffect(
    () =>
      api.onCloseRequested(() => {
        void completeClose();
      }),
    [api, completeClose],
  );
  useEffect(() => {
    let current = true;
    ready.current = false;
    void api
      .loadSessionState()
      .then((saved) => {
        if (!current) return;
        const restored =
          saved === null
            ? initialSessionWorkspaceState
            : SessionStateSchema.parse(saved);
        latest.current = restored;
        setState(restored);
        ready.current = true;
        setPhase('ready');
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (!current) return;
        setLoadError(
          error instanceof Error ? error.message : '无法读取会话记录',
        );
        setPhase('error');
      });
    return () => {
      current = false;
    };
  }, [api, retryLoad]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent): void => {
      if (allowUnload.current || !queue.isDirty()) return;
      event.preventDefault();
      // Electron requires returnValue to cancel native unload, including reload.
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      event.returnValue = '';
      setReloadHeld(true);
      // Reload is deliberately not converted into window.close(). The user may
      // retry it once the queue is saved; failed writes stay in this renderer.
      void queue.flush().catch(() => {
        /* Visible save error remains actionable. */
      });
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [api, queue]);
  const dispatch = useCallback(
    (action: SessionWorkspaceAction): boolean => {
      if (!ready.current || closing.current) return false;
      const next = sessionWorkspaceReducer(latest.current, {
        ...action,
        occurredAt: Date.now(),
      });
      if (next === latest.current) return false;
      latest.current = next;
      setState(next);
      queue.enqueue(next);
      return true;
    },
    [queue],
  );
  const retry = (): void => {
    if (phase === 'error') {
      setPhase('loading');
      setRetryLoad((value) => value + 1);
    } else
      void queue.retry().catch(() => {
        /* The queue publishes the failure. */
      });
  };
  const cancelClose = (): void => {
    const attempt = ++closeAttempt.current;
    allowUnload.current = false;
    void api
      .finishClose('cancel')
      .then(() => {
        if (closeAttempt.current !== attempt) return;
        closing.current = false;
        setClosePhase(null);
      })
      .catch(() => {
        if (closeAttempt.current !== attempt) return;
        setClosePhase('error');
      });
  };
  const discardAndClose = (): void => {
    if (closePhase !== 'error') return;
    allowUnload.current = true;
    void api.finishClose('discard').catch(() => {
      allowUnload.current = false;
      setClosePhase('error');
    });
  };
  return {
    state,
    dispatch,
    phase,
    loadError,
    saveStatus,
    retry,
    closePhase,
    cancelClose,
    discardAndClose,
    retryClose: () => {
      void completeClose(true);
    },
    reloadHeld,
  };
}

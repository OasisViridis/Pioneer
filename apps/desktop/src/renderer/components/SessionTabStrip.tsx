import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import type {
  SessionTabId,
  SessionWorkspaceState,
} from '../../shared/contracts/session-workspace';
import type { SessionWorkspaceAction } from '../state/session-workspace-reducer';
import {
  resolveBranchOrigin,
  type BranchOriginView,
} from '../state/session-branch-origin';

export function SessionTabStrip({
  state,
  dispatch,
}: {
  state: SessionWorkspaceState;
  dispatch: Dispatch<SessionWorkspaceAction>;
}): React.JSX.Element {
  const elements = useRef(new Map<string, HTMLButtonElement>());
  const restoreFocus = useRef(false);
  const hintElement = useRef<HTMLDivElement>(null);
  const [focusedOrigin, setFocusedOrigin] = useState<SessionTabId | null>(null);
  const [hoveredOrigin, setHoveredOrigin] = useState<SessionTabId | null>(null);
  const [dismissedOrigin, setDismissedOrigin] = useState<SessionTabId | null>(
    null,
  );
  const tabs: {
    id: SessionTabId;
    label: string;
    project?: string;
    origin?: BranchOriginView | null;
  }[] = [
    { id: 'library', label: 'Library' },
    { id: 'settings', label: 'Settings' },
    ...state.openSessionIds.flatMap((id) => {
      const session = state.sessions.find((item) => item.id === id);
      return session
        ? [
            {
              id,
              label: session.title,
              project: session.project.name,
              origin: resolveBranchOrigin(
                session.branchOrigin,
                state.sessions.find(
                  (item) => item.id === session.branchOrigin?.sessionId,
                ),
              ),
            },
          ]
        : [];
    }),
  ];
  useLayoutEffect(() => {
    if (!restoreFocus.current) return;
    restoreFocus.current = false;
    elements.current.get(state.activeTabId)?.focus();
  }, [state.activeTabId, state.openSessionIds]);
  useEffect(() => {
    const dismiss = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape')
        setDismissedOrigin(hoveredOrigin ?? focusedOrigin);
    };
    window.addEventListener('keydown', dismiss);
    return () => {
      window.removeEventListener('keydown', dismiss);
    };
  }, [hoveredOrigin, focusedOrigin]);
  const activate = (id: SessionTabId): void => {
    dispatch({ type: 'ACTIVATE_TAB', tabId: id });
    elements.current.get(id)?.focus();
  };
  const keydown = (
    event: KeyboardEvent<HTMLButtonElement>,
    id: SessionTabId,
  ): void => {
    const index = tabs.findIndex((tab) => tab.id === id);
    let target: number | undefined;
    if (event.key === 'Home') target = 0;
    if (event.key === 'End') target = tabs.length - 1;
    if (event.key === 'ArrowLeft')
      target = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'ArrowRight') target = (index + 1) % tabs.length;
    const tab = target === undefined ? undefined : tabs[target];
    if (!tab) return;
    event.preventDefault();
    activate(tab.id);
  };
  const hintId = hoveredOrigin ?? focusedOrigin;
  const hintTab = tabs.find((tab) => tab.id === hintId);
  const hintText =
    hintTab?.origin?.kind === 'available'
      ? `来源：${hintTab.origin.title} · 第 ${String(hintTab.origin.messageIndex + 1)} 条消息`
      : '来源不可用';
  useLayoutEffect(() => {
    if (!hintId || hintId === dismissedOrigin) return;
    const position = () => {
      const hint = hintElement.current;
      const anchor = elements.current.get(hintId);
      if (!hint) return;
      const strip = anchor?.closest('[role=tablist]');
      if (
        !anchor?.isConnected ||
        !strip ||
        !(
          document.activeElement === anchor ||
          anchor.matches(':hover') ||
          hint.matches(':hover')
        )
      ) {
        hint.style.visibility = 'hidden';
        return;
      }
      const rect = anchor.getBoundingClientRect();
      const stripRect = strip.getBoundingClientRect();
      if (
        rect.right <= stripRect.left ||
        rect.left >= stripRect.right ||
        rect.bottom <= 0 ||
        rect.top >= window.innerHeight
      ) {
        hint.style.visibility = 'hidden';
        return;
      }
      const width = Math.min(320, Math.max(0, window.innerWidth - 16));
      hint.style.width = `${String(width)}px`;
      const height = hint.getBoundingClientRect().height;
      const left = Math.max(
        8,
        Math.min(rect.left, window.innerWidth - width - 8),
      );
      const top =
        rect.bottom + height <= window.innerHeight - 8
          ? rect.bottom
          : Math.max(8, rect.top - height);
      hint.style.left = `${String(left)}px`;
      hint.style.top = `${String(top)}px`;
      hint.style.visibility = 'visible';
    };
    position();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    };
  }, [hintId, hintText, dismissedOrigin]);
  return (
    <>
      <nav
        aria-label="Workspace sections"
        className="tab-strip session-tab-strip"
        role="tablist"
      >
        {tabs.map((tab) => {
          const selected = state.activeTabId === tab.id;
          const hint =
            tab.origin?.kind === 'available'
              ? `来源：${tab.origin.title} · 第 ${String(tab.origin.messageIndex + 1)} 条消息`
              : '来源不可用';
          const originDescriptionId = `tab-${tab.id}-branch-description`;
          return (
            <div className="tab-strip__item" key={tab.id} role="presentation">
              <button
                aria-controls={`panel-${tab.id}`}
                aria-selected={selected}
                aria-label={tab.label}
                aria-description={tab.origin ? undefined : tab.project}
                aria-describedby={tab.origin ? originDescriptionId : undefined}
                className="tab-strip__tab"
                id={`tab-${tab.id}`}
                role="tab"
                tabIndex={selected ? 0 : -1}
                type="button"
                onClick={() => {
                  activate(tab.id);
                }}
                onFocus={(event) => {
                  if (tab.origin) {
                    event.currentTarget.parentElement?.scrollIntoView({
                      block: 'nearest',
                      inline: 'nearest',
                    });
                    setDismissedOrigin(null);
                    setFocusedOrigin(tab.id);
                  }
                }}
                onBlur={() => {
                  setFocusedOrigin((current) =>
                    current === tab.id ? null : current,
                  );
                }}
                onMouseEnter={() => {
                  if (tab.origin) {
                    setDismissedOrigin(null);
                    setHoveredOrigin(tab.id);
                  }
                }}
                onMouseLeave={(event) => {
                  const target = event.relatedTarget;
                  if (!(
                    target instanceof Element &&
                    target.closest('[data-session-branch-hint]')
                  ))
                    setHoveredOrigin((current) =>
                      current === tab.id ? null : current,
                    );
                }}
                onKeyDown={(event) => {
                  keydown(event, tab.id);
                }}
                ref={(node) => {
                  if (node) elements.current.set(tab.id, node);
                  else elements.current.delete(tab.id);
                }}
              >
                <span className="session-tab-label">
                  <span className="session-tab-label__text">{tab.label}</span>
                  {tab.origin ? (
                    <span className="session-branch-badge" aria-hidden="true">
                      分支
                    </span>
                  ) : null}
                </span>
                {tab.project ? <small>{tab.project}</small> : null}
                {tab.origin ? (
                  <>
                    <span id={originDescriptionId} className="sr-only">
                      {tab.project} · 分支 · {hint}
                    </span>
                  </>
                ) : null}
              </button>
              {tab.id !== 'library' && tab.id !== 'settings' ? (
                <button
                  aria-label={`Close ${tab.label}`}
                  className="tab-strip__close"
                  type="button"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => {
                    restoreFocus.current = selected;
                    setFocusedOrigin((current) =>
                      current === tab.id ? null : current,
                    );
                    setHoveredOrigin((current) =>
                      current === tab.id ? null : current,
                    );
                    setDismissedOrigin((current) =>
                      current === tab.id ? null : current,
                    );
                    dispatch({ type: 'CLOSE_TAB', tabId: tab.id });
                  }}
                >
                  ×
                </button>
              ) : null}
            </div>
          );
        })}
      </nav>
      {hintId && hintId !== dismissedOrigin && hintTab?.origin
        ? createPortal(
            <div
              aria-hidden="true"
              className="session-branch-hint"
              data-session-branch-hint={hintId}
              ref={hintElement}
              onMouseEnter={() => {
                setHoveredOrigin(hintId);
              }}
              onMouseLeave={(event) => {
                if (!(
                  event.relatedTarget instanceof Node &&
                  elements.current.get(hintId)?.contains(event.relatedTarget)
                ))
                  setHoveredOrigin((current) =>
                    current === hintId ? null : current,
                  );
              }}
            >
              {hintText}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

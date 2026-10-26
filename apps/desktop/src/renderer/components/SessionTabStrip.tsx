import {
  useLayoutEffect,
  useRef,
  type Dispatch,
  type KeyboardEvent,
} from 'react';
import type {
  SessionTabId,
  SessionWorkspaceState,
} from '../../shared/contracts/session-workspace';
import type { SessionWorkspaceAction } from '../state/session-workspace-reducer';

export function SessionTabStrip({
  state,
  dispatch,
}: {
  state: SessionWorkspaceState;
  dispatch: Dispatch<SessionWorkspaceAction>;
}): React.JSX.Element {
  const elements = useRef(new Map<string, HTMLButtonElement>());
  const restoreFocus = useRef(false);
  const tabs: { id: SessionTabId; label: string; project?: string }[] = [
    { id: 'library', label: 'Library' },
    { id: 'settings', label: 'Settings' },
    ...state.openSessionIds.flatMap((id) => {
      const session = state.sessions.find((item) => item.id === id);
      return session
        ? [{ id, label: session.title, project: session.project.name }]
        : [];
    }),
  ];
  useLayoutEffect(() => {
    if (!restoreFocus.current) return;
    restoreFocus.current = false;
    elements.current.get(state.activeTabId)?.focus();
  }, [state.activeTabId, state.openSessionIds]);
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
  return (
    <nav
      aria-label="Workspace sections"
      className="tab-strip session-tab-strip"
      role="tablist"
    >
      {tabs.map((tab) => {
        const selected = state.activeTabId === tab.id;
        return (
          <div className="tab-strip__item" key={tab.id} role="presentation">
            <button
              aria-controls={`panel-${tab.id}`}
              aria-selected={selected}
              aria-label={tab.label}
              aria-description={tab.project}
              className="tab-strip__tab"
              id={`tab-${tab.id}`}
              role="tab"
              tabIndex={selected ? 0 : -1}
              type="button"
              onClick={() => {
                activate(tab.id);
              }}
              onKeyDown={(event) => {
                keydown(event, tab.id);
              }}
              ref={(node) => {
                if (node) elements.current.set(tab.id, node);
                else elements.current.delete(tab.id);
              }}
            >
              <span>{tab.label}</span>
              {tab.project ? <small>{tab.project}</small> : null}
            </button>
            {tab.id !== 'library' && tab.id !== 'settings' ? (
              <button
                aria-label={`Close ${tab.label}`}
                className="tab-strip__close"
                type="button"
                tabIndex={selected ? 0 : -1}
                onClick={() => {
                  restoreFocus.current = selected;
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
  );
}

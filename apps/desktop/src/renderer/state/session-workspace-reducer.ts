import type { ProjectSummary } from '../../shared/contracts/catalog';
import {
  LIBRARY_TAB_ID,
  SETTINGS_TAB_ID,
  type Session,
  type SessionId,
  type SessionTabId,
  type SessionWorkspaceState,
  type DockPanelId,
  type DockColumn,
  type DockLayout,
  type OutputTab,
} from '../../shared/contracts/session-workspace';
import {
  cloneDockLayout,
  createDockLayout,
  dockPanel,
  hideDockPanel,
  showDockPanel,
  visibleDockPanels,
} from '../../shared/docking';
import { advanceActivityAt } from '../../shared/session-activity';
import {
  MAX_SESSION_RUN_HISTORY,
  type SessionRunRecord,
} from '../../shared/contracts/session-run-history';
import type { RunSnapshot } from '../../shared/contracts/run-context';
import {
  MAX_SESSION_STATE_BYTES,
  SESSION_STATE_VERSION,
  SessionStateSchema,
} from '../../shared/session-state';

type SessionOperation =
  | { type: 'UPDATE_DRAFT'; id: SessionId; value: string }
  | { type: 'SAVE_MESSAGE'; id: SessionId }
  | { type: 'RECORD_RUN'; id: SessionId; record: SessionRunRecord }
  | { type: 'RECORD_RUN_SNAPSHOT'; id: SessionId; snapshot: RunSnapshot }
  | { type: 'BUMP_RUN_REVISION'; id: SessionId; revision: number }
  | { type: 'RENAME_SESSION'; id: SessionId; title: string }
  | { type: 'TOGGLE_PANEL'; id: SessionId; panel: DockPanelId }
  | { type: 'SHOW_PANEL'; id: SessionId; panel: DockPanelId }
  | {
      type: 'DOCK_PANEL';
      id: SessionId;
      panel: DockPanelId;
      column: DockColumn;
      before?: DockPanelId;
    }
  | {
      type: 'MOVE_PANEL';
      id: SessionId;
      panel: DockPanelId;
      direction: 'earlier' | 'later';
    }
  | { type: 'SET_DOCK_RATIO'; id: SessionId; ratio: number }
  | {
      type: 'SET_DOCK_WEIGHTS';
      id: SessionId;
      weights: Partial<Record<DockPanelId, number>>;
    }
  | {
      type: 'SAVE_LAYOUT' | 'RESET_LAYOUT' | 'RESTORE_SAVED_LAYOUT';
      id: SessionId;
    }
  | { type: 'SET_OUTPUT_TAB'; id: SessionId; tab: OutputTab };
export type SessionWorkspaceAction = (
  | { type: 'CREATE_SESSION'; id: SessionId; project: ProjectSummary }
  | {
      type: 'BRANCH_FROM_MESSAGE';
      id: SessionId;
      sourceId: SessionId;
      messageIndex: number;
    }
  | { type: 'OPEN_SESSION'; id: SessionId }
  | { type: 'ACTIVATE_TAB' | 'CLOSE_TAB'; tabId: SessionTabId }
  | SessionOperation
) & { occurredAt?: number };

export const initialSessionWorkspaceState: SessionWorkspaceState = {
  sessions: [],
  openSessionIds: [],
  activeTabId: LIBRARY_TAB_ID,
  mruTabIds: [LIBRARY_TAB_ID],
};

function highWater(state: SessionWorkspaceState): number | null {
  return state.sessions.reduce<number | null>(
    (latest, session) =>
      session.lastActivityAt === null
        ? latest
        : Math.max(latest ?? 0, session.lastActivityAt),
    null,
  );
}
function activity(
  session: Session,
  state: SessionWorkspaceState,
  occurredAt?: number,
): Session {
  const time = advanceActivityAt(highWater(state), occurredAt);
  return time === null ? session : { ...session, lastActivityAt: time };
}
function activate(
  state: SessionWorkspaceState,
  tabId: SessionTabId,
): SessionWorkspaceState {
  return {
    ...state,
    activeTabId: tabId,
    mruTabIds: [tabId, ...state.mruTabIds.filter((id) => id !== tabId)],
  };
}
function changeDock(session: Session, dock: DockLayout): Session {
  return dock === session.dock ? session : { ...session, dock };
}
function editSession(session: Session, action: SessionOperation): Session {
  const dock = session.dock;
  switch (action.type) {
    case 'UPDATE_DRAFT':
      return session.draft === action.value
        ? session
        : { ...session, draft: action.value };
    case 'SAVE_MESSAGE': {
      const text = session.draft.trim();
      if (!text || session.messages.length >= 100) return session;
      return {
        ...session,
        draft: '',
        messages: [...session.messages, text],
        title:
          !session.customTitle && session.messages.length === 0
            ? text.slice(0, 48)
            : session.title,
      };
    }
    case 'RECORD_RUN': {
      if (session.runHistory.some((item) => item.runId === action.record.runId))
        return session;
      const history = [...session.runHistory, action.record];
      if (history.length > MAX_SESSION_RUN_HISTORY)
        history.splice(0, history.length - MAX_SESSION_RUN_HISTORY);
      return { ...session, runHistory: history };
    }
    case 'RECORD_RUN_SNAPSHOT': {
      const existing = session.lastRunView;
      // The terminal capture may race an earlier, less complete context read;
      // a newer capture of the same run must be able to replace it.
      if (
        existing !== null &&
        existing.identity.runId === action.snapshot.identity.runId &&
        existing.recordedAt >= action.snapshot.recordedAt
      )
        return session;
      return { ...session, lastRunView: action.snapshot };
    }
    case 'BUMP_RUN_REVISION': {
      if (action.revision <= session.runRevision) return session;
      return { ...session, runRevision: action.revision };
    }
    case 'RENAME_SESSION': {
      const title = action.title.trim();
      if (
        !title ||
        title.length > 48 ||
        (title === session.title && session.customTitle)
      )
        return session;
      return { ...session, title, customTitle: true };
    }
    case 'TOGGLE_PANEL':
      return changeDock(
        session,
        dock.hidden.includes(action.panel)
          ? showDockPanel(dock, action.panel)
          : hideDockPanel(dock, action.panel),
      );
    case 'SHOW_PANEL':
      return changeDock(session, showDockPanel(dock, action.panel));
    case 'DOCK_PANEL':
      return changeDock(
        session,
        dockPanel(dock, action.panel, action.column, action.before),
      );
    case 'MOVE_PANEL': {
      const column: DockColumn = dock.columns[0].includes(action.panel) ? 0 : 1;
      const visible = visibleDockPanels(dock, column);
      const index = visible.indexOf(action.panel);
      if (
        index < 0 ||
        (action.direction === 'earlier'
          ? index === 0
          : index === visible.length - 1)
      )
        return session;
      return changeDock(
        session,
        dockPanel(
          dock,
          action.panel,
          column,
          visible[index + (action.direction === 'earlier' ? -1 : 2)],
        ),
      );
    }
    case 'SET_DOCK_RATIO':
      return action.ratio === dock.ratio
        ? session
        : changeDock(session, { ...dock, ratio: action.ratio });
    case 'SET_DOCK_WEIGHTS':
      return changeDock(session, {
        ...dock,
        weights: { ...dock.weights, ...action.weights },
      });
    case 'SAVE_LAYOUT':
      return { ...session, savedDock: cloneDockLayout(dock) };
    case 'RESET_LAYOUT':
      return changeDock(session, createDockLayout('focus'));
    case 'RESTORE_SAVED_LAYOUT':
      return session.savedDock
        ? changeDock(session, cloneDockLayout(session.savedDock))
        : session;
    case 'SET_OUTPUT_TAB':
      return session.outputTab === action.tab
        ? session
        : { ...session, outputTab: action.tab };
  }
}

function reduce(
  state: SessionWorkspaceState,
  action: SessionWorkspaceAction,
): SessionWorkspaceState {
  switch (action.type) {
    case 'CREATE_SESSION': {
      if (state.sessions.some((session) => session.id === action.id))
        return state;
      const session: Session = {
        id: action.id,
        project: action.project,
        title: '新会话',
        customTitle: false,
        draft: '',
        messages: [],
        lastActivityAt: null,
        dock: createDockLayout('focus'),
        savedDock: null,
        layoutHistory: null,
        outputTab: 'preview',
        runHistory: [],
        runRevision: 0,
        lastRunView: null,
        branchOrigin: null,
      };
      return activate(
        {
          ...state,
          sessions: [
            ...state.sessions,
            activity(session, state, action.occurredAt),
          ],
          openSessionIds: [...state.openSessionIds, action.id],
        },
        action.id,
      );
    }
    case 'BRANCH_FROM_MESSAGE': {
      const source = state.sessions.find(
        (session) => session.id === action.sourceId,
      );
      if (
        !source ||
        state.sessions.some((session) => session.id === action.id) ||
        !Number.isInteger(action.messageIndex) ||
        action.messageIndex < 0 ||
        action.messageIndex >= source.messages.length
      )
        return state;
      const message = source.messages[action.messageIndex];
      if (message === undefined) return state;
      const session: Session = {
        id: action.id,
        project: source.project,
        title: `${source.title.slice(0, 44)} 分支`,
        customTitle: false,
        draft: '',
        messages: source.messages.slice(0, action.messageIndex + 1),
        lastActivityAt: null,
        dock: createDockLayout('focus'),
        savedDock: null,
        layoutHistory: null,
        outputTab: 'preview',
        runHistory: [],
        runRevision: 0,
        lastRunView: null,
        branchOrigin: {
          sessionId: source.id,
          messageIndex: action.messageIndex,
          messageText: message,
        },
      };
      return activate(
        {
          ...state,
          sessions: [
            ...state.sessions,
            activity(session, state, action.occurredAt),
          ],
          openSessionIds: [...state.openSessionIds, action.id],
        },
        action.id,
      );
    }
    case 'OPEN_SESSION': {
      const stored = state.sessions.find((session) => session.id === action.id);
      if (
        !stored ||
        (state.openSessionIds.includes(action.id) &&
          state.activeTabId === action.id)
      )
        return state;
      return activate(
        {
          ...state,
          openSessionIds: state.openSessionIds.includes(action.id)
            ? state.openSessionIds
            : [...state.openSessionIds, action.id],
          sessions: state.sessions.map((session) =>
            session === stored
              ? activity(session, state, action.occurredAt)
              : session,
          ),
        },
        action.id,
      );
    }
    case 'ACTIVATE_TAB': {
      if (
        state.activeTabId === action.tabId ||
        (action.tabId !== LIBRARY_TAB_ID &&
          action.tabId !== SETTINGS_TAB_ID &&
          !state.openSessionIds.includes(action.tabId))
      )
        return state;
      return activate(
        {
          ...state,
          sessions: state.sessions.map((session) =>
            session.id === action.tabId
              ? activity(session, state, action.occurredAt)
              : session,
          ),
        },
        action.tabId,
      );
    }
    case 'CLOSE_TAB': {
      if (
        action.tabId === LIBRARY_TAB_ID ||
        action.tabId === SETTINGS_TAB_ID ||
        !state.openSessionIds.includes(action.tabId)
      )
        return state;
      const mruTabIds = state.mruTabIds.filter((id) => id !== action.tabId);
      return {
        ...state,
        openSessionIds: state.openSessionIds.filter(
          (id) => id !== action.tabId,
        ),
        mruTabIds,
        activeTabId:
          state.activeTabId === action.tabId
            ? (mruTabIds[0] ?? LIBRARY_TAB_ID)
            : state.activeTabId,
      };
    }
    default: {
      const sessions = state.sessions.map((session) => {
        if (session.id !== action.id) return session;
        let next = editSession(session, action);
        if (next === session) return session;
        if (
          [
            'UPDATE_DRAFT',
            'SAVE_MESSAGE',
            'RECORD_RUN',
            'RENAME_SESSION',
          ].includes(action.type)
        )
          next = activity(next, state, action.occurredAt);
        return next;
      });
      return sessions.some(
        (session, index) => session !== state.sessions[index],
      )
        ? { ...state, sessions }
        : state;
    }
  }
}

/** Pure local state only. Invalid edits cannot break persistence or grant execution. */
export function sessionWorkspaceReducer(
  state: SessionWorkspaceState,
  action: SessionWorkspaceAction,
): SessionWorkspaceState {
  const next = reduce(state, action);
  if (
    action.type === 'BRANCH_FROM_MESSAGE' &&
    next !== state &&
    new TextEncoder().encode(
      JSON.stringify({ version: SESSION_STATE_VERSION, state: next }),
    ).byteLength > MAX_SESSION_STATE_BYTES
  )
    return state;
  return next === state || SessionStateSchema.safeParse(next).success
    ? next
    : state;
}

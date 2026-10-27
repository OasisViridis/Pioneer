import { describe, expect, it } from 'vitest';
import {
  initialTabsState,
  tabsReducer,
} from '../../apps/desktop/src/renderer/state/tabs-reducer';
import {
  initialSessionWorkspaceState,
  sessionWorkspaceReducer,
} from '../../apps/desktop/src/renderer/state/session-workspace-reducer';
import { SessionStateSchema } from '../../apps/desktop/src/shared/session-state';

const project = {
  id: 'alpha',
  name: 'Alpha',
  absolutePath: 'C:/Projects/alpha',
  description: null,
  technologies: [],
  hasGitRepository: false,
  lastModifiedAt: '2026-10-03T00:00:00.000Z',
  coverSeed: 'alpha',
};

describe('separate project and session workspaces', () => {
  it('preserves project tabs while sessions close and reopen without losing drafts', () => {
    const projects = tabsReducer(initialTabsState, {
      type: 'OPEN_PROJECT',
      project,
    });
    let state = sessionWorkspaceReducer(initialSessionWorkspaceState, {
      type: 'CREATE_SESSION',
      id: 'session:a',
      project,
    });
    state = sessionWorkspaceReducer(state, {
      type: 'UPDATE_DRAFT',
      id: 'session:a',
      value: 'retain me',
    });
    state = sessionWorkspaceReducer(state, {
      type: 'CLOSE_TAB',
      tabId: 'session:a',
    });
    expect(state.activeTabId).toBe('library');
    expect(state.sessions[0]?.draft).toBe('retain me');
    state = sessionWorkspaceReducer(state, {
      type: 'OPEN_SESSION',
      id: 'session:a',
    });
    expect(state.openSessionIds).toEqual(['session:a']);
    expect(state.sessions[0]?.draft).toBe('retain me');
    expect(projects.tabs.map((tab) => tab.id)).toEqual([
      'library',
      'settings',
      'project:alpha',
    ]);
    expect(SessionStateSchema.safeParse(state).success).toBe(true);
    expect(SessionStateSchema.safeParse(projects).success).toBe(false);
  });

  it('rejects invalid identifiers and oversized edits without changing state', () => {
    expect(
      sessionWorkspaceReducer(initialSessionWorkspaceState, {
        type: 'CREATE_SESSION',
        id: 'session: ',
        project,
      }),
    ).toBe(initialSessionWorkspaceState);
    const state = sessionWorkspaceReducer(initialSessionWorkspaceState, {
      type: 'CREATE_SESSION',
      id: 'session:a',
      project,
    });
    expect(
      sessionWorkspaceReducer(state, {
        type: 'UPDATE_DRAFT',
        id: 'session:a',
        value: 'x'.repeat(8001),
      }),
    ).toBe(state);
    expect(
      sessionWorkspaceReducer(state, {
        type: 'RENAME_SESSION',
        id: 'session:a',
        title: ' ',
      }),
    ).toBe(state);
    expect(
      sessionWorkspaceReducer(state, {
        type: 'SET_DOCK_RATIO',
        id: 'session:a',
        ratio: NaN,
      }),
    ).toBe(state);
    expect(
      sessionWorkspaceReducer(state, { type: 'CLOSE_TAB', tabId: 'library' }),
    ).toBe(state);
  });
});

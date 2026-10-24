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
  it('persists conversation-local intent revisions and initialized snapshots without granting capabilities', () => {
    let state = sessionWorkspaceReducer(initialSessionWorkspaceState, {
      type: 'CREATE_SESSION',
      id: 'session:a',
      project,
    });
    state = sessionWorkspaceReducer(state, {
      type: 'CREATE_SESSION',
      id: 'session:b',
      project,
    });
    const other = state.sessions[1];
    state = sessionWorkspaceReducer(state, {
      type: 'INTENT_ACTION',
      id: 'session:a',
      action: { type: 'SET_INSTRUCTION', instruction: '修复重复请求' },
    });
    state = sessionWorkspaceReducer(state, {
      type: 'INTENT_ACTION',
      id: 'session:a',
      action: { type: 'SUBMIT' },
    });
    state = sessionWorkspaceReducer(state, {
      type: 'INTENT_ACTION',
      id: 'session:a',
      action: { type: 'EDIT' },
    });
    state = sessionWorkspaceReducer(state, {
      type: 'INTENT_ACTION',
      id: 'session:a',
      action: {
        type: 'SET_INSTRUCTION',
        instruction: '修复重复请求并增加测试',
      },
    });
    state = sessionWorkspaceReducer(state, {
      type: 'INTENT_ACTION',
      id: 'session:a',
      action: { type: 'SUBMIT' },
    });
    state = sessionWorkspaceReducer(state, {
      type: 'INTENT_ACTION',
      id: 'session:a',
      action: { type: 'CONFIRM' },
    });
    state = sessionWorkspaceReducer(state, {
      type: 'INTENT_ACTION',
      id: 'session:a',
      action: { type: 'BOOTSTRAP_SESSION' },
    });
    expect(state.sessions[0]?.intentState).toMatchObject({
      phase: 'session',
      intent: { id: 'intent:session:a', projectId: 'alpha', revision: 2 },
      runtime: {
        status: 'initialized',
        session: {
          capabilities: {
            modelAccess: false,
            toolExecution: false,
            fileMutation: false,
          },
        },
      },
    });
    expect(SessionStateSchema.parse(JSON.parse(JSON.stringify(state)))).toEqual(
      state,
    );
    expect(state.sessions[1]).toBe(other);
    expect(state.sessions[0]).not.toHaveProperty('layout');
    const initialized = state.sessions[0];
    if (!initialized?.intentState.runtime)
      throw new Error('Expected initialized snapshot');
    const forged = structuredClone(state);
    const target = forged.sessions[0];
    if (!target?.intentState.intent) throw new Error('Expected intent');
    target.intentState.intent.projectId = 'another-project';
    expect(SessionStateSchema.safeParse(forged).success).toBe(false);
    target.intentState.intent.projectId = 'alpha';
    target.intentState.intent.id = 'intent:session:b';
    expect(SessionStateSchema.safeParse(forged).success).toBe(false);
    const wrongRevision = structuredClone(state);
    if (!wrongRevision.sessions[0]?.intentState.runtime)
      throw new Error('Expected runtime');
    wrongRevision.sessions[0].intentState.runtime.session.approvedIntent.revision = 3;
    expect(SessionStateSchema.safeParse(wrongRevision).success).toBe(false);
  });
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

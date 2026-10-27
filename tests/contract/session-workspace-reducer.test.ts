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
import type { RunSnapshot } from '../../apps/desktop/src/shared/contracts/run-context';

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

  it('records per-session run history, dedupes by runId, and trims to 20', () => {
    const record = (index: number) => ({
      runId: `run:${String(index)}`,
      task: `task ${String(index)}`,
      status: 'completed' as const,
      failureCode: null,
      startedAt: '2026-10-25T00:00:00.000Z',
      endedAt: '2026-10-25T00:00:01.000Z',
      stopRequestedAt: null,
      resultText: `result ${String(index)}`,
      truncated: false,
    });
    let state = sessionWorkspaceReducer(initialSessionWorkspaceState, {
      type: 'CREATE_SESSION',
      id: 'session:a',
      project,
    });
    for (let index = 0; index < 21; index += 1) {
      state = sessionWorkspaceReducer(state, {
        type: 'RECORD_RUN',
        id: 'session:a',
        record: record(index),
      });
    }
    const history = state.sessions[0]?.runHistory ?? [];
    expect(history).toHaveLength(20);
    expect(history[0]?.runId).toBe('run:1');
    expect(history.at(-1)?.runId).toBe('run:20');
    const before = state;
    expect(
      sessionWorkspaceReducer(state, {
        type: 'RECORD_RUN',
        id: 'session:a',
        record: record(20),
      }),
    ).toBe(before);
  });
});

describe('P3-A run revision and persisted summary (#17)', () => {
  const snapshotOf = (
    runId: string,
    revision: number,
    recordedAt = '2026-10-27T10:00:01.000Z',
    state: 'read' | 'approved' = 'read',
  ): RunSnapshot => ({
    identity: {
      sessionId: 'session:a' as const,
      projectId: 'alpha',
      runId,
      revision,
    },
    status: 'completed' as const,
    tools: ['read_file'],
    materials: [
      {
        path: 'README.md',
        bytes: 12,
        sha256: 'd'.repeat(64),
        state,
        reason: null,
        readAt: state === 'read' ? '2026-10-27T10:00:00.000Z' : null,
      },
    ],
    calls: [],
    recordedAt,
  });

  it('increments the session revision monotonically and keeps the newest snapshot', () => {
    let state = sessionWorkspaceReducer(initialSessionWorkspaceState, {
      type: 'CREATE_SESSION',
      id: 'session:a',
      project,
    });
    expect(state.sessions[0]?.runRevision).toBe(0);
    expect(state.sessions[0]?.lastRunView).toBeNull();

    state = sessionWorkspaceReducer(state, {
      type: 'BUMP_RUN_REVISION',
      id: 'session:a',
      revision: 1,
    });
    expect(state.sessions[0]?.runRevision).toBe(1);
    const afterFirst = state;
    state = sessionWorkspaceReducer(state, {
      type: 'BUMP_RUN_REVISION',
      id: 'session:a',
      revision: 1,
    });
    expect(state).toBe(afterFirst);
    state = sessionWorkspaceReducer(state, {
      type: 'BUMP_RUN_REVISION',
      id: 'session:a',
      revision: 2,
    });
    expect(state.sessions[0]?.runRevision).toBe(2);

    state = sessionWorkspaceReducer(state, {
      type: 'RECORD_RUN_SNAPSHOT',
      id: 'session:a',
      snapshot: snapshotOf('run:2', 2),
    });
    expect(state.sessions[0]?.lastRunView?.identity.runId).toBe('run:2');
    const recorded = state;
    state = sessionWorkspaceReducer(state, {
      type: 'RECORD_RUN_SNAPSHOT',
      id: 'session:a',
      snapshot: snapshotOf('run:2', 2),
    });
    expect(state).toBe(recorded);
    // A newer capture of the same run replaces an earlier, less complete one.
    state = sessionWorkspaceReducer(state, {
      type: 'RECORD_RUN_SNAPSHOT',
      id: 'session:a',
      snapshot: snapshotOf('run:2', 2, '2026-10-27T10:00:05.000Z', 'approved'),
    });
    expect(state.sessions[0]?.lastRunView?.recordedAt).toBe(
      '2026-10-27T10:00:05.000Z',
    );
    expect(state.sessions[0]?.lastRunView?.materials[0]?.state).toBe(
      'approved',
    );
    // An older capture must not roll the summary back.
    const newest = state;
    state = sessionWorkspaceReducer(state, {
      type: 'RECORD_RUN_SNAPSHOT',
      id: 'session:a',
      snapshot: snapshotOf('run:2', 2, '2026-10-27T09:00:00.000Z'),
    });
    expect(state).toBe(newest);
    state = sessionWorkspaceReducer(state, {
      type: 'RECORD_RUN_SNAPSHOT',
      id: 'session:a',
      snapshot: snapshotOf('run:3', 3),
    });
    expect(state.sessions[0]?.lastRunView?.identity.runId).toBe('run:3');
    expect(SessionStateSchema.safeParse(state).success).toBe(true);
  });

  it('shows the RunLog panel without hiding an already visible panel', () => {
    let state = sessionWorkspaceReducer(initialSessionWorkspaceState, {
      type: 'CREATE_SESSION',
      id: 'session:a',
      project,
    });
    expect(state.sessions[0]?.dock.hidden).toContain('runlog');
    state = sessionWorkspaceReducer(state, {
      type: 'SHOW_PANEL',
      id: 'session:a',
      panel: 'runlog',
    });
    expect(state.sessions[0]?.dock.hidden).not.toContain('runlog');
    const shown = state;
    state = sessionWorkspaceReducer(state, {
      type: 'SHOW_PANEL',
      id: 'session:a',
      panel: 'runlog',
    });
    expect(state).toBe(shown);
    expect(state.sessions[0]?.dock.columns.flat()).toContain('runlog');
  });
});

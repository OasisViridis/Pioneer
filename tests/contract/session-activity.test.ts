import { describe, expect, it } from 'vitest';
import {
  MAX_ACTIVITY_TIMESTAMP,
  advanceActivityAt,
  querySessionActivity,
} from '../../apps/desktop/src/shared/session-activity';
import {
  initialSessionWorkspaceState,
  sessionWorkspaceReducer,
} from '../../apps/desktop/src/renderer/state/session-workspace-reducer';

const alpha = {
  id: 'alpha',
  name: 'Alpha',
  absolutePath: 'C:\\workspace\\alpha',
  description: null,
  technologies: [],
  hasGitRepository: false,
  lastModifiedAt: '2099-01-01T00:00:00.000Z',
  coverSeed: 'alpha',
};

describe('local session activity clock', () => {
  it('uses host time, advances ties and rollback, rejects invalid time, and saturates safely', () => {
    expect(advanceActivityAt(null, 1_000)).toBe(1_000);
    expect(advanceActivityAt(1_000, 1_000)).toBe(1_001);
    expect(advanceActivityAt(1_000, 900)).toBe(1_001);
    expect(advanceActivityAt(1_000, 2_000)).toBe(2_000);
    expect(advanceActivityAt(MAX_ACTIVITY_TIMESTAMP, 900)).toBe(
      MAX_ACTIVITY_TIMESTAMP,
    );
    for (const invalid of [
      undefined,
      NaN,
      Infinity,
      -1,
      1.5,
      Number.MAX_SAFE_INTEGER,
    ]) {
      expect(advanceActivityAt(1_000, invalid)).toBeNull();
    }
  });
});

describe('activity summary query', () => {
  it('breaks both known and unknown ties by Unicode code points rather than UTF-16 units', () => {
    let state = initialSessionWorkspaceState;
    for (const id of ['session:\u{10000}', 'session:\uE000'] as const) {
      state = sessionWorkspaceReducer(state, {
        type: 'CREATE_SESSION',
        id,
        project: alpha,
      });
    }
    for (const lastActivityAt of [null, 1_000]) {
      const tied = {
        ...state,
        sessions: state.sessions.map((s) => ({ ...s, lastActivityAt })),
      };
      expect(querySessionActivity(tied).sessions.map((s) => s.id)).toEqual([
        'session:\uE000',
        'session:\u{10000}',
      ]);
    }
  });

  it('orders known times, stable ties and unknown records without directory mtime or open-tab bias', () => {
    let state = initialSessionWorkspaceState;
    for (const id of [
      'session:b',
      'session:a',
      'session:c',
      'session:z',
    ] as const) {
      state = sessionWorkspaceReducer(state, {
        type: 'CREATE_SESSION',
        id,
        project: alpha,
      });
    }
    const times = [1_000, 1_000, 2_000, null];
    state = {
      ...state,
      sessions: state.sessions.map((s, i) => ({
        ...s,
        lastActivityAt: times[i] ?? null,
        project:
          s.id === 'session:z' ? { ...s.project, id: 'beta' } : s.project,
      })),
      openSessionIds: [],
    };
    const before = structuredClone(state);
    expect(querySessionActivity(state)).toEqual({
      sessions: [
        { id: 'session:c', projectId: 'alpha', lastActivityAt: 2_000 },
        { id: 'session:a', projectId: 'alpha', lastActivityAt: 1_000 },
        { id: 'session:b', projectId: 'alpha', lastActivityAt: 1_000 },
        { id: 'session:z', projectId: 'beta', lastActivityAt: null },
      ],
      workspaces: [
        {
          projectId: 'alpha',
          lastActivityAt: 2_000,
          mostRecentSessionId: 'session:c',
        },
        {
          projectId: 'beta',
          lastActivityAt: null,
          mostRecentSessionId: 'session:z',
        },
      ],
    });
    expect(state).toEqual(before);
    expect(querySessionActivity(initialSessionWorkspaceState)).toEqual({
      sessions: [],
      workspaces: [],
    });
  });
});

describe('activity events through the public reducer', () => {
  it('records real edits and opens with a global high water, but not no-ops, close or layout changes', () => {
    let state = sessionWorkspaceReducer(initialSessionWorkspaceState, {
      type: 'CREATE_SESSION',
      id: 'session:a',
      project: alpha,
      occurredAt: 1_000,
    });
    const activity = (): number | null | undefined =>
      state.sessions.find((s) => s.id === 'session:a')?.lastActivityAt;
    expect(activity()).toBe(1_000);
    const created = state;
    expect(
      sessionWorkspaceReducer(state, {
        type: 'CREATE_SESSION',
        id: 'session:a',
        project: alpha,
        occurredAt: 9_000,
      }),
    ).toBe(created);
    state = sessionWorkspaceReducer(state, {
      type: 'CREATE_SESSION',
      id: 'session:b',
      project: alpha,
      occurredAt: 900,
    });
    expect(state.sessions[1]?.lastActivityAt).toBe(1_001);
    state = sessionWorkspaceReducer(state, {
      type: 'ACTIVATE_TAB',
      tabId: 'session:a',
      occurredAt: 900,
    });
    expect(activity()).toBe(1_002);
    state = sessionWorkspaceReducer(state, {
      type: 'ACTIVATE_TAB',
      tabId: 'session:a',
      occurredAt: 9_000,
    });
    expect(activity()).toBe(1_002);
    state = sessionWorkspaceReducer(state, {
      type: 'UPDATE_DRAFT',
      id: 'session:a',
      value: 'draft',
      occurredAt: 900,
    });
    expect(activity()).toBe(1_003);
    state = sessionWorkspaceReducer(state, {
      type: 'UPDATE_DRAFT',
      id: 'session:a',
      value: 'draft',
      occurredAt: 9_000,
    });
    expect(activity()).toBe(1_003);
    state = sessionWorkspaceReducer(state, {
      type: 'SAVE_MESSAGE',
      id: 'session:a',
      occurredAt: 900,
    });
    expect(activity()).toBe(1_004);
    state = sessionWorkspaceReducer(state, {
      type: 'SAVE_MESSAGE',
      id: 'session:a',
      occurredAt: 9_000,
    });
    expect(activity()).toBe(1_004);
    state = sessionWorkspaceReducer(state, {
      type: 'RENAME_SESSION',
      id: 'session:a',
      title: 'Renamed',
      occurredAt: 900,
    });
    expect(activity()).toBe(1_005);
    const beforeLayout = structuredClone(state);
    state = sessionWorkspaceReducer(state, {
      type: 'TOGGLE_PANEL',
      id: 'session:a',
      panel: 'context',
      occurredAt: 9_000,
    });
    state = sessionWorkspaceReducer(state, {
      type: 'SAVE_LAYOUT',
      id: 'session:a',
      occurredAt: 9_000,
    });
    state = sessionWorkspaceReducer(state, {
      type: 'CLOSE_TAB',
      tabId: 'session:a',
      occurredAt: 9_000,
    });
    expect(activity()).toBe(1_005);
    state = sessionWorkspaceReducer(state, {
      type: 'OPEN_SESSION',
      id: 'session:a',
      occurredAt: 900,
    });
    expect(activity()).toBe(1_006);
    expect(beforeLayout.sessions[0]?.lastActivityAt).toBe(1_005);
    state = sessionWorkspaceReducer(state, {
      type: 'UPDATE_DRAFT',
      id: 'session:a',
      value: 'clock invalid but draft retained',
      occurredAt: NaN,
    });
    expect(activity()).toBe(1_006);
    expect(state.sessions[0]?.draft).toBe('clock invalid but draft retained');
  });
});

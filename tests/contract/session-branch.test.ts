import { describe, expect, it } from 'vitest';
import {
  initialSessionWorkspaceState,
  sessionWorkspaceReducer,
} from '../../apps/desktop/src/renderer/state/session-workspace-reducer';
import {
  loadRecord,
  SESSION_STATE_VERSION,
  SessionStateSchema,
} from '../../apps/desktop/src/shared/session-state';

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

function withMessages() {
  let state = sessionWorkspaceReducer(initialSessionWorkspaceState, {
    type: 'CREATE_SESSION',
    id: 'session:source',
    project,
  });
  for (const value of ['first message', 'second message']) {
    state = sessionWorkspaceReducer(state, {
      type: 'UPDATE_DRAFT',
      id: 'session:source',
      value,
    });
    state = sessionWorkspaceReducer(state, {
      type: 'SAVE_MESSAGE',
      id: 'session:source',
    });
  }
  return sessionWorkspaceReducer(state, {
    type: 'UPDATE_DRAFT',
    id: 'session:source',
    value: 'private draft',
  });
}

describe('branching a saved conversation', () => {
  it('copies only the history through the selected point into an independent session', () => {
    let sourceState = withMessages();
    sourceState = sessionWorkspaceReducer(sourceState, {
      type: 'RECORD_RUN',
      id: 'session:source',
      record: {
        runId: 'run:old',
        task: 'old task',
        status: 'completed',
        failureCode: null,
        startedAt: '2026-10-25T00:00:00.000Z',
        endedAt: '2026-10-25T00:00:01.000Z',
        stopRequestedAt: null,
        resultText: 'old result',
        truncated: false,
      },
    });
    sourceState = sessionWorkspaceReducer(sourceState, {
      type: 'BUMP_RUN_REVISION',
      id: 'session:source',
      revision: 4,
    });
    const source = sourceState.sessions[0];
    const result = sessionWorkspaceReducer(sourceState, {
      type: 'BRANCH_FROM_MESSAGE',
      sourceId: 'session:source',
      messageIndex: 0,
      id: 'session:branch',
      occurredAt: 123,
    });
    const child = result.sessions.find(
      (session) => session.id === 'session:branch',
    );
    expect(result.activeTabId).toBe('session:branch');
    expect(result.sessions[0]).toBe(source);
    expect(child?.messages).toEqual(['first message']);
    expect(child?.messages).not.toBe(source?.messages);
    expect(child?.lastActivityAt).toBe(123);
    expect(child?.draft).toBe('');
    expect(child?.runHistory).toEqual([]);
    expect(child?.runRevision).toBe(0);
    expect(child?.lastRunView).toBeNull();
    expect(child?.branchOrigin).toEqual({
      sessionId: 'session:source',
      messageIndex: 0,
      messageText: 'first message',
    });
    expect(source?.draft).toBe('private draft');
    expect(source?.messages).toEqual(['first message', 'second message']);
    expect(source?.runHistory).toHaveLength(1);
    expect(source?.runRevision).toBe(4);
  });

  it('refuses a branch that would exceed the persisted state byte limit', () => {
    const initial = withMessages();
    const source = initial.sessions[0];
    if (!source) throw new Error('Expected source session');
    const messages = Array.from({ length: 100 }, () => '汉'.repeat(2500));
    const sessions = Array.from({ length: 11 }, (_, index) => ({
      ...source,
      id: `session:large-${String(index)}` as const,
      messages: [...messages],
    }));
    const first = sessions[0];
    if (!first) throw new Error('Expected source');
    const state = {
      sessions,
      openSessionIds: [first.id],
      activeTabId: first.id,
      mruTabIds: [first.id, 'library' as const],
    };
    expect(SessionStateSchema.safeParse(state).success).toBe(true);
    expect(
      sessionWorkspaceReducer(state, {
        type: 'BRANCH_FROM_MESSAGE',
        sourceId: first.id,
        messageIndex: 99,
        id: 'session:overflow',
      }),
    ).toBe(state);
  });

  it('rejects missing source, out-of-range point, and duplicate identifiers', () => {
    const state = withMessages();
    for (const action of [
      {
        type: 'BRANCH_FROM_MESSAGE',
        sourceId: 'session:missing',
        messageIndex: 0,
        id: 'session:new',
      },
      {
        type: 'BRANCH_FROM_MESSAGE',
        sourceId: 'session:source',
        messageIndex: 2,
        id: 'session:new',
      },
      {
        type: 'BRANCH_FROM_MESSAGE',
        sourceId: 'session:source',
        messageIndex: -1,
        id: 'session:new',
      },
      {
        type: 'BRANCH_FROM_MESSAGE',
        sourceId: 'session:source',
        messageIndex: 0,
        id: 'session:source',
      },
    ] as const)
      expect(sessionWorkspaceReducer(state, action)).toBe(state);
  });

  it('loads v7 without rewriting it and preserves the absent origin', () => {
    const state = withMessages();
    const old = {
      version: 7,
      state: {
        ...state,
        sessions: state.sessions.map(({ branchOrigin, ...session }) => {
          expect(branchOrigin).toBeNull();
          return session;
        }),
      },
    };
    const bytes = JSON.stringify(old);
    const restored = loadRecord(old);
    expect(SESSION_STATE_VERSION).toBe(8);
    expect(restored.state.sessions[0]?.branchOrigin).toBeUndefined();
    expect(restored.state.sessions[0]?.messages).toEqual([
      'first message',
      'second message',
    ]);
    expect(JSON.stringify(old)).toBe(bytes);
  });
});

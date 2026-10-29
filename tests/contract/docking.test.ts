import { describe, expect, it } from 'vitest';
import {
  addRunlogPanel,
  createDockLayout,
  dockPanel,
  visibleDockPanels,
  hideDockPanel,
} from '../../apps/desktop/src/shared/docking';
import {
  initialSessionWorkspaceState,
  sessionWorkspaceReducer,
} from '../../apps/desktop/src/renderer/state/session-workspace-reducer';
import type { ProjectSummary } from '../../apps/desktop/src/shared/contracts/catalog';
const project: ProjectSummary = {
  id: 'project',
  name: 'Project',
  absolutePath: 'C:/Projects/Test',
  description: null,
  technologies: [],
  hasGitRepository: false,
  lastModifiedAt: '2026-09-16T00:00:00.000Z',
  coverSeed: 'project',
};

describe('session docking layout', () => {
  it('upgrades a v6 five-panel default layout to the canonical v7 layout', () => {
    const upgraded = addRunlogPanel({
      columns: [
        ['context', 'capabilities', 'diff', 'outputs'],
        ['conversation'],
      ],
      hidden: ['context', 'capabilities', 'diff', 'outputs'],
      ratio: 60,
      weights: {
        conversation: 2,
        context: 1,
        capabilities: 1,
        diff: 1,
        outputs: 1,
      },
    });
    // Equal to the fresh v7 default, so the workbench must not announce a
    // layout adjustment for an untouched v6 default.
    expect(upgraded).toEqual(createDockLayout('focus'));
    expect(addRunlogPanel(upgraded)).toEqual(upgraded);
    expect(upgraded.hidden).toEqual([
      'context',
      'capabilities',
      'runlog',
      'diff',
      'outputs',
    ]);
  });

  it('moves conversation beside the artifact without duplicating or removing other modules', () => {
    const initial = createDockLayout('review');
    const moved = dockPanel(initial, 'conversation', 0, 'diff');
    expect(visibleDockPanels(moved, 0)).toEqual(['conversation', 'diff']);
    expect(visibleDockPanels(moved, 1)).toEqual([]);
    expect(visibleDockPanels(initial, 0)).toEqual(['diff']);
    expect(visibleDockPanels(initial, 1)).toEqual(['conversation']);
    expect(new Set(moved.columns.flat()).size).toBe(6);
    const hidden = hideDockPanel(moved, 'conversation');
    expect(visibleDockPanels(hidden, 0)).toEqual(['diff']);
    expect(hideDockPanel(hidden, 'diff')).toBe(hidden);
  });
  it('saves and restores independent custom layouts, never changing drafts or local output tabs', () => {
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
      type: 'UPDATE_DRAFT',
      id: 'session:a',
      value: 'keep me',
    });
    state = sessionWorkspaceReducer(state, {
      type: 'TOGGLE_PANEL',
      id: 'session:a',
      panel: 'diff',
    });
    state = sessionWorkspaceReducer(state, {
      type: 'DOCK_PANEL',
      id: 'session:a',
      panel: 'conversation',
      column: 0,
      before: 'diff',
    });
    state = sessionWorkspaceReducer(state, {
      type: 'SET_DOCK_RATIO',
      id: 'session:a',
      ratio: 38,
    });
    state = sessionWorkspaceReducer(state, {
      type: 'SAVE_LAYOUT',
      id: 'session:a',
    });
    state = sessionWorkspaceReducer(state, {
      type: 'RESET_LAYOUT',
      id: 'session:a',
    });
    state = sessionWorkspaceReducer(state, {
      type: 'RESTORE_SAVED_LAYOUT',
      id: 'session:a',
    });
    const session = state.sessions[0];
    expect(session?.dock.ratio).toBe(38);
    expect(session && visibleDockPanels(session.dock, 0)).toEqual([
      'conversation',
      'diff',
    ]);
    expect(session?.draft).toBe('keep me');
    expect(session?.outputTab).toBe('preview');
    expect(state.sessions[1]).toBe(other);
    state = sessionWorkspaceReducer(state, {
      type: 'RESET_LAYOUT',
      id: 'session:a',
    });
    expect(state.sessions[0]?.dock).toEqual(createDockLayout('focus'));
    expect(state.sessions[0]?.savedDock?.ratio).toBe(38);
  });
});

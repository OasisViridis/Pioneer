import { describe, expect, it } from 'vitest';
import { createDockLayout } from '../../apps/desktop/src/shared/docking';
import { loadRecord } from '../../apps/desktop/src/shared/session-state';

const project = {
  id: 'alpha',
  name: 'Alpha',
  absolutePath: 'C:\\workspace\\alpha',
  description: null,
  technologies: ['TypeScript'],
  hasGitRepository: true,
  lastModifiedAt: '2026-09-16T00:00:00.000Z',
  coverSeed: 'alpha',
};

describe('single-layout session migration', () => {
  it('selects the active v3 dock and preserves every old layout without sharing references', () => {
    const dockLayouts = {
      focus: createDockLayout('focus'),
      review: { ...createDockLayout('review'), ratio: 38 },
      delivery: createDockLayout('delivery'),
    };
    const savedLayouts = {
      delivery: { ...createDockLayout('delivery'), ratio: 42 },
    };
    const input = {
      version: 3,
      state: {
        sessions: [
          {
            id: 'session:alpha',
            project,
            title: 'Alpha',
            customTitle: false,
            draft: '修复重复请求',
            messages: ['读取请求缓存模块'],
            lastActivityAt: 123,
            layout: 'review',
            dockLayouts,
            savedLayouts,
            outputTab: 'files',
          },
        ],
        openSessionIds: ['session:alpha'],
        activeTabId: 'session:alpha',
        mruTabIds: ['session:alpha', 'library'],
      },
    };
    const result = loadRecord(input);
    expect(result.version).toBe(8);
    expect(result.state.sessions[0]).toMatchObject({
      draft: '修复重复请求',
      messages: ['读取请求缓存模块'],
      lastActivityAt: 123,
      dock: dockLayouts.review,
      savedDock: null,
      layoutHistory: { layout: 'review', dockLayouts, savedLayouts },
      runHistory: [],
    });
    expect(result.state.sessions[0]).not.toHaveProperty('intentState');
    expect(result.state.sessions[0]).not.toHaveProperty('layout');
    expect(result.state.sessions[0]).not.toHaveProperty('dockLayouts');
    expect(result.state.sessions[0]).not.toHaveProperty('savedLayouts');
    expect(JSON.stringify(input)).toContain('"version":3');
    expect(loadRecord(result)).toEqual(result);
    const migrated = result.state.sessions[0];
    if (!migrated) throw new Error('Expected migrated session');
    migrated.dock.ratio = 61;
    expect(migrated.layoutHistory?.dockLayouts.review.ratio).toBe(38);
    expect(dockLayouts.review.ratio).toBe(38);
  });
});

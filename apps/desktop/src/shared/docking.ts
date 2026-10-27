import type {
  DockColumn,
  DockLayout,
  DockPanelId,
  Layout,
  PanelId,
  Session,
} from './contracts/session-workspace';

export const DOCK_PANELS: readonly DockPanelId[] = [
  'conversation',
  'context',
  'capabilities',
  'runlog',
  'diff',
  'outputs',
];
/**
 * v6 layouts predate the RunLog panel. Loading one upgrades it through
 * `addRunlogPanel`; the legacy schema keeps accepting these five-panel docks.
 */
export const LEGACY_DOCK_PANELS: readonly DockPanelId[] = [
  'conversation',
  'context',
  'capabilities',
  'diff',
  'outputs',
];
const optionalPanels: PanelId[] = [
  'context',
  'capabilities',
  'runlog',
  'diff',
  'outputs',
];

export function createDockLayout(
  layout: Layout,
  panels?: PanelId[],
): DockLayout {
  const visible =
    panels ??
    (layout === 'review' ? ['diff'] : layout === 'delivery' ? ['outputs'] : []);
  return {
    columns: [
      [
        ...visible,
        ...optionalPanels.filter((panel) => !visible.includes(panel)),
      ],
      ['conversation'],
    ],
    hidden: optionalPanels.filter((panel) => !visible.includes(panel)),
    ratio: 60,
    weights: {
      conversation: 2,
      context: 1,
      capabilities: 1,
      runlog: 1,
      diff: 1,
      outputs: 1,
    },
  };
}

interface LegacyDockShape {
  columns: [DockPanelId[], DockPanelId[]];
  hidden: DockPanelId[];
  ratio: number;
  weights: Partial<Record<DockPanelId, number>>;
}

/**
 * v6 → v7 layout upgrade: add the RunLog panel beside the capability panel,
 * hidden until the user opens it. Hidden order is normalized to the canonical
 * panel order so a migrated default layout still equals `createDockLayout`
 * (otherwise the workbench would falsely announce an adjusted layout).
 * Running it twice is a no-op, so migrated and already-current records share
 * one path.
 */
export function addRunlogPanel(dock: LegacyDockShape): DockLayout {
  const weights = {
    conversation: 2,
    context: 1,
    capabilities: 1,
    runlog: 1,
    diff: 1,
    outputs: 1,
    ...dock.weights,
  } as Record<DockPanelId, number>;
  const canonicalHidden = (hidden: DockPanelId[]): DockPanelId[] =>
    DOCK_PANELS.filter((panel) => hidden.includes(panel));
  if (dock.columns.flat().includes('runlog')) {
    return {
      columns: [[...dock.columns[0]], [...dock.columns[1]]],
      hidden: canonicalHidden(dock.hidden),
      ratio: dock.ratio,
      weights,
    };
  }
  const columns: [DockPanelId[], DockPanelId[]] = [
    [...dock.columns[0]],
    [...dock.columns[1]],
  ];
  const column = columns.findIndex((entry) => entry.includes('capabilities'));
  const target = columns[column === -1 ? 0 : column];
  if (target === undefined) return dock as DockLayout;
  const at = target.indexOf('capabilities');
  target.splice(at === -1 ? target.length : at + 1, 0, 'runlog');
  return {
    columns,
    hidden: canonicalHidden([...dock.hidden, 'runlog']),
    ratio: dock.ratio,
    weights,
  };
}

export function visibleDockPanels(
  dock: DockLayout,
  column?: DockColumn,
): DockPanelId[] {
  return (
    column === undefined ? dock.columns.flat() : dock.columns[column]
  ).filter((panel) => !dock.hidden.includes(panel));
}
export function cloneDockLayout(dock: DockLayout): DockLayout {
  return {
    ...dock,
    columns: [[...dock.columns[0]], [...dock.columns[1]]],
    hidden: [...dock.hidden],
    weights: { ...dock.weights },
  };
}
export function dockPanel(
  dock: DockLayout,
  panel: DockPanelId,
  column: DockColumn,
  before?: DockPanelId,
): DockLayout {
  if (panel === before || (before && !dock.columns[column].includes(before)))
    return dock;
  const next = cloneDockLayout(dock);
  next.columns = [
    next.columns[0].filter((id) => id !== panel),
    next.columns[1].filter((id) => id !== panel),
  ];
  const target = next.columns[column];
  target.splice(before ? target.indexOf(before) : target.length, 0, panel);
  next.hidden = next.hidden.filter((id) => id !== panel);
  return next;
}
export function hideDockPanel(
  dock: DockLayout,
  panel: DockPanelId,
): DockLayout {
  if (dock.hidden.includes(panel) || visibleDockPanels(dock).length === 1)
    return dock;
  return { ...dock, hidden: [...dock.hidden, panel] };
}
export function showDockPanel(
  dock: DockLayout,
  panel: DockPanelId,
): DockLayout {
  return dock.hidden.includes(panel)
    ? { ...dock, hidden: dock.hidden.filter((id) => id !== panel) }
    : dock;
}
export function sessionPanels(session: Session): PanelId[] {
  return visibleDockPanels(session.dock).filter(
    (id): id is PanelId => id !== 'conversation',
  );
}
export function fitDockPanels(
  panels: DockPanelId[],
  height: number,
): DockPanelId[] {
  const kept: DockPanelId[] = panels.includes('conversation')
    ? ['conversation']
    : [];
  let used = kept.length ? 320 : 0;
  for (const panel of panels) {
    if (panel === 'conversation') continue;
    const needed = 170 + (kept.length ? 8 : 0);
    if (!kept.length || used + needed <= height) {
      kept.push(panel);
      used += needed;
    }
  }
  return panels.filter((panel) => kept.includes(panel));
}

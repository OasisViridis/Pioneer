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
  'diff',
  'outputs',
];
const optionalPanels: PanelId[] = [
  'context',
  'capabilities',
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
      diff: 1,
      outputs: 1,
    },
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

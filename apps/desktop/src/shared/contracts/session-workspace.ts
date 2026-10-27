import type { ProjectSummary } from './catalog';
import type { RunSnapshot } from './run-context';
import type { SessionRunRecord } from './session-run-history';
import { LIBRARY_TAB_ID, SETTINGS_TAB_ID } from './tabs';

export { LIBRARY_TAB_ID, SETTINGS_TAB_ID } from './tabs';
export type SessionId = `session:${string}`;
export type SessionTabId =
  typeof LIBRARY_TAB_ID | typeof SETTINGS_TAB_ID | SessionId;
/** v1-v3 persistence vocabulary only. P1 migrates this to one session layout. */
export type Layout = 'focus' | 'review' | 'delivery';
export type PanelId =
  'context' | 'capabilities' | 'runlog' | 'diff' | 'outputs';
export type DockPanelId = 'conversation' | PanelId;
export type DockColumn = 0 | 1;
export type OutputTab = 'preview' | 'files' | 'verification';
export interface DockLayout {
  columns: [DockPanelId[], DockPanelId[]];
  hidden: DockPanelId[];
  ratio: number;
  weights: Record<DockPanelId, number>;
}
export interface LegacySession {
  id: SessionId;
  project: ProjectSummary;
  title: string;
  customTitle: boolean;
  draft: string;
  messages: string[];
  lastActivityAt: number | null;
  layout: Layout;
  dockLayouts: Record<Layout, DockLayout>;
  savedLayouts: Partial<Record<Layout, DockLayout>>;
  outputTab: OutputTab;
}
export interface Session extends Omit<
  LegacySession,
  'layout' | 'dockLayouts' | 'savedLayouts'
> {
  dock: DockLayout;
  savedDock: DockLayout | null;
  layoutHistory: Pick<
    LegacySession,
    'layout' | 'dockLayouts' | 'savedLayouts'
  > | null;
  /** Bounded per-session run task/result history (Issue #13 item 1). */
  runHistory: SessionRunRecord[];
  /** Revision of the newest started run; edits never renumber past runs. */
  runRevision: number;
  /** Bounded summary of the newest run, kept across restarts (Issue #17). */
  lastRunView: RunSnapshot | null;
}
export interface LegacySessionWorkspaceState extends Omit<
  SessionWorkspaceState,
  'sessions'
> {
  sessions: LegacySession[];
}
/** Not the project-library TabsState: a session has an independent lifetime. */
export interface SessionWorkspaceState {
  sessions: Session[];
  openSessionIds: SessionId[];
  activeTabId: SessionTabId;
  mruTabIds: SessionTabId[];
}

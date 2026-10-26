import type { Dispatch, ReactNode } from 'react';
import type { ProjectSummary } from '../src/shared/contracts/catalog';
import type {
  DockPanelId,
  Session,
  SessionWorkspaceState,
} from '../src/shared/contracts/session-workspace';
import type { SessionWorkspaceAction } from '../src/renderer/state/session-workspace-reducer';
import { ProjectPoster } from '../src/renderer/components/ProjectPoster';
import { DockSurface } from '../src/renderer/components/DockSurface';
import { SessionTabStrip } from '../src/renderer/components/SessionTabStrip';

// Code/Map/Doc deliberately retain the existing seeded gradient. These
// examples do not classify a project by its name or fabricate catalog data.
export function WorkspacePosterExamples(
  project: ProjectSummary,
  onOpen: (project: ProjectSummary) => void,
) {
  return {
    'Cover=Code': <ProjectPoster project={project} onOpen={onOpen} />,
    'Cover=Map': <ProjectPoster project={project} onOpen={onOpen} />,
    'Cover=Doc': <ProjectPoster project={project} onOpen={onOpen} />,
    'Cover=Unavailable': (
      <ProjectPoster
        project={project}
        onOpen={onOpen}
        unavailableReason="目录状态已过期，请重新扫描后打开。"
      />
    ),
  };
}

// A Figma PanelTab maps to a header *inside* this composition. Its runtime
// active treatment follows :focus-within; panels remain visible side by side.
// renderPanel must supply the application's actual content, not example data.
export function PanelTabExamples(
  session: Session,
  dispatch: Dispatch<SessionWorkspaceAction>,
  renderPanel: (panel: DockPanelId) => ReactNode,
) {
  return {
    'State=Active': (
      <DockSurface
        session={session}
        dispatch={dispatch}
        renderPanel={renderPanel}
      />
    ),
    'State=Inactive': (
      <DockSurface
        session={session}
        dispatch={dispatch}
        renderPanel={renderPanel}
      />
    ),
  };
}

// The caller supplies a real open session in state. The strip owns activation
// and closing. Closing only dispatches CLOSE_TAB; it never stops a Run.
export function SessionTabExamples(
  state: SessionWorkspaceState,
  session: Session,
  dispatch: Dispatch<SessionWorkspaceAction>,
) {
  return {
    'State=Active': (
      <SessionTabStrip
        state={{ ...state, activeTabId: session.id }}
        dispatch={dispatch}
      />
    ),
    'State=Inactive': (
      <SessionTabStrip
        state={{ ...state, activeTabId: 'library' }}
        dispatch={dispatch}
      />
    ),
  };
}

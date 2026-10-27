import type { Dispatch } from 'react';
import type {
  PanelId,
  Session,
} from '../../shared/contracts/session-workspace';
import { createDockLayout } from '../../shared/docking';
import type { SessionWorkspaceAction } from '../state/session-workspace-reducer';
import type { SessionSaveStatus } from '../state/session-save-queue';
import { PanelMenu } from './PanelMenu';
import { SessionTitle } from './SessionTitle';
import { Conversation } from './Conversation';
import { DockSurface } from './DockSurface';
import { panelNames, WorkbenchPanel } from './WorkbenchPanels';
const panels: PanelId[] = [
  'context',
  'capabilities',
  'runlog',
  'diff',
  'outputs',
];
export function SessionWorkbench({
  session,
  dispatch,
  saveStatus,
}: {
  session: Session;
  dispatch: Dispatch<SessionWorkspaceAction>;
  saveStatus: SessionSaveStatus;
}): React.JSX.Element {
  const dock = session.dock;
  const saved = session.savedDock;
  const atSaved = !!saved && JSON.stringify(saved) === JSON.stringify(dock);
  const customized =
    JSON.stringify(dock) !== JSON.stringify(createDockLayout('focus'));
  const reset = (): void => {
    dispatch({ type: 'RESET_LAYOUT', id: session.id });
  };
  return (
    <div className="workbench">
      <header className="workbench-toolbar">
        <div className="workbench-identity">
          <SessionTitle
            title={session.title}
            onRename={(title) => {
              dispatch({ type: 'RENAME_SESSION', id: session.id, title });
            }}
          />
          <p>
            {session.project.name} <span aria-hidden="true">/</span> 本地工作区
          </p>
        </div>
        {dock.hidden.includes('conversation') ? (
          <button
            className="button"
            type="button"
            onClick={() => {
              dispatch({
                type: 'TOGGLE_PANEL',
                id: session.id,
                panel: 'conversation',
              });
            }}
          >
            恢复会话面板
          </button>
        ) : null}
        <PanelMenu label="模块" summary="模块" className="module-picker">
          {panels.map((panel) => (
            <button
              type="button"
              key={panel}
              aria-pressed={!dock.hidden.includes(panel)}
              onClick={() => {
                dispatch({ type: 'TOGGLE_PANEL', id: session.id, panel });
              }}
            >
              {dock.hidden.includes(panel) ? '+ ' : '✓ '}
              {panelNames[panel]}
            </button>
          ))}
        </PanelMenu>
        <PanelMenu label="布局操作" summary="布局">
          <button type="button" onClick={reset}>
            恢复默认布局
          </button>
          <button
            type="button"
            disabled={!saved}
            onClick={() => {
              dispatch({ type: 'RESTORE_SAVED_LAYOUT', id: session.id });
            }}
          >
            恢复已存布局
          </button>
        </PanelMenu>
      </header>
      <div
        className={
          'layout-notice ' +
          (atSaved && saveStatus.status === 'saved'
            ? 'layout-notice--saved'
            : '')
        }
        hidden={!customized && !saved}
      >
        <span>
          {atSaved
            ? saveStatus.status === 'saved'
              ? '布局已保存 · 下次回到此会话时恢复'
              : saveStatus.status === 'error'
                ? '布局尚未保存到本机，请重试。'
                : '正在保存布局…'
            : '布局已调整 · 仅影响当前会话，不改变上下文'}
        </span>
        <button
          type="button"
          className="button button--primary"
          disabled={atSaved}
          onClick={() => {
            dispatch({ type: 'SAVE_LAYOUT', id: session.id });
          }}
        >
          {atSaved ? '已记录布局' : '保存布局'}
        </button>
        <button type="button" className="button" onClick={reset}>
          恢复默认布局
        </button>
      </div>
      <DockSurface
        session={session}
        dispatch={dispatch}
        renderPanel={(panel) =>
          panel === 'conversation' ? (
            <Conversation
              session={session}
              dispatch={dispatch}
              allowDecoration={saveStatus.status !== 'error'}
            />
          ) : (
            <WorkbenchPanel
              session={session}
              dispatch={dispatch}
              panel={panel}
            />
          )
        }
      />
    </div>
  );
}

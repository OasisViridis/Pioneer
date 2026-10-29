import type { Dispatch } from 'react';
import type {
  OutputTab,
  PanelId,
  Session,
} from '../../shared/contracts/session-workspace';
import type { SessionWorkspaceAction } from '../state/session-workspace-reducer';
import { LocalTabs } from './LocalTabs';
import {
  RunCapabilitiesPanel,
  RunContextPanel,
  RunLogPanel,
} from './RunDetailPanels';

export const panelNames: Record<PanelId, string> = {
  context: '上下文',
  capabilities: '能力',
  runlog: '运行日志',
  diff: '改动',
  outputs: '产物',
};
const outputTabs: { id: OutputTab; label: string }[] = [
  { id: 'preview', label: '界面预览' },
  { id: 'files', label: '文件清单' },
  { id: 'verification', label: '验收记录' },
];

export function WorkbenchPanel({
  session,
  dispatch,
  panel,
}: {
  session: Session;
  dispatch: Dispatch<SessionWorkspaceAction>;
  panel: PanelId;
}): React.JSX.Element {
  if (panel === 'context') return <RunContextPanel session={session} />;
  if (panel === 'capabilities')
    return <RunCapabilitiesPanel session={session} />;
  if (panel === 'runlog') return <RunLogPanel session={session} />;
  return (
    <div className="module-content">
      {panel === 'diff' ? (
        <div className="module-empty">
          <span className="empty-symbol" aria-hidden="true">
            ±
          </span>
          <h3>还没有可审阅的改动</h3>
          <p>P2 只读运行不会写入文件，因此这里没有 Diff 可审阅。</p>
          <span className="metadata">实际 Diff 会在受控写入接入后显示。</span>
        </div>
      ) : (
        <>
          <LocalTabs
            items={outputTabs}
            value={session.outputTab}
            label="产物视图"
            className="local-tabs"
            panelId="output-panel"
            onChange={(tab) => {
              dispatch({ type: 'SET_OUTPUT_TAB', id: session.id, tab });
            }}
          />
          <div
            role="tabpanel"
            id="output-panel"
            aria-labelledby={`output-panel-tab-${session.outputTab}`}
            className="module-empty"
          >
            <span className="empty-symbol" aria-hidden="true">
              {session.outputTab === 'verification' ? '≡' : '▧'}
            </span>
            <h3>
              {session.outputTab === 'preview'
                ? '成果会出现在这里'
                : session.outputTab === 'files'
                  ? '尚未生成文件'
                  : '尚未执行验收'}
            </h3>
            <p>
              {session.outputTab === 'verification'
                ? '没有测试结果，不预先标记通过。'
                : '只读运行不产生文件或预览；这里不填入演示数据。'}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

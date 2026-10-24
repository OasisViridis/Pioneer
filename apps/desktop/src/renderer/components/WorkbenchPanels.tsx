import type { Dispatch } from 'react';
import type {
  OutputTab,
  PanelId,
  Session,
} from '../../shared/contracts/session-workspace';
import type { SessionWorkspaceAction } from '../state/session-workspace-reducer';
import { ProjectOverview } from './ProjectOverview';
import { LocalTabs } from './LocalTabs';

export const panelNames: Record<PanelId, string> = {
  context: '上下文',
  capabilities: '能力',
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
  return (
    <div className="module-content">
      {panel === 'context' ? (
        <>
          <p className="metadata">只包含此会话的工作区概览，不代表执行授权。</p>
          <ProjectOverview project={session.project} />
        </>
      ) : panel === 'capabilities' ? (
        <>
          <p className="eyebrow">已启用</p>
          <h3>只读工作区发现</h3>
          <p>扫描与元数据由现有受限接口提供。</p>
          <dl className="capability-list">
            <div>
              <dt>Agent 运行器</dt>
              <dd>未连接</dd>
            </div>
            <div>
              <dt>执行命令</dt>
              <dd>未提供</dd>
            </div>
            <div>
              <dt>写入工作区</dt>
              <dd>未授权</dd>
            </div>
          </dl>
          <p className="metadata">切换布局或打开模块不会授予权限。</p>
        </>
      ) : panel === 'diff' ? (
        <div className="module-empty">
          <span className="empty-symbol" aria-hidden="true">
            ±
          </span>
          <h3>还没有可审阅的改动</h3>
          <p>运行器尚未接入，没有执行命令或修改文件。</p>
          <span className="metadata">实际 Diff 会在运行器接入后显示。</span>
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
                : '此会话尚未连接运行器。预览与文件将以真实产物为准。'}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

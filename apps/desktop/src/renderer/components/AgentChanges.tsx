import { useSyncExternalStore } from 'react';
import { diffLines } from 'diff';
import type { Session } from '../../shared/contracts/session-workspace';
import { runViews } from '../state/run-view-instance';

export function AgentChanges({
  session,
}: {
  session: Session;
}): React.JSX.Element {
  const state = useSyncExternalStore(runViews.subscribe, () =>
    runViews.get(session.id),
  );
  const snapshot =
    session.lastRunView?.identity.revision === session.runRevision
      ? session.lastRunView
      : null;
  const current = state.runId !== null;
  const edit = current ? state.context?.edit : snapshot?.edit;
  const runId = current ? state.runId : snapshot?.identity.runId;
  const parts = edit
    ? diffLines(edit.before, edit.after, { timeout: 100, maxEditLength: 2000 })
    : undefined;
  return (
    <div className="module-content agent-changes">
      <h3>任务改动</h3>
      {edit ? (
        <>
          <p>{edit.path}</p>
          <p className="metadata">运行：{runId}</p>
          <p role="status">
            {edit.state === 'applied'
              ? '已写入并核对'
              : edit.state === 'not_applied'
                ? '未写入；下方仅为尝试的改动'
                : '写入结果尚未确认；下方为尝试的改动'}
          </p>
          {edit.code ? <p className="metadata">结果代码：{edit.code}</p> : null}
          <p className="metadata">
            这是本次执行时的记录，不代表文件此刻的内容。停止运行不会撤销已写入的改动。
          </p>
          {parts ? (
            <pre className="change-review__lines" aria-label="文本改动">
              {parts.map((part, index) => (
                <span
                  key={index}
                  className={`change-review__line change-review__line--${part.added ? 'added' : part.removed ? 'removed' : 'context'}`}
                >
                  {part.added ? '+ ' : part.removed ? '− ' : '  '}
                  {part.value}
                </span>
              ))}
            </pre>
          ) : (
            <>
              <p>改动较多，请对照前后内容。</p>
              <h4>修改前</h4>
              <pre className="change-review__lines">{edit.before}</pre>
              <h4>修改后（尝试内容）</h4>
              <pre className="change-review__lines">{edit.after}</pre>
            </>
          )}
        </>
      ) : (
        <p>本次运行没有可显示的文件修改记录。</p>
      )}
    </div>
  );
}

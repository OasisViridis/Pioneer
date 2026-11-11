import { useSyncExternalStore } from 'react';
import { structuredPatch } from 'diff';
import type { Session } from '../../shared/contracts/session-workspace';
import { runViews } from '../state/run-view-instance';
import '../styles/agent-changes.css';

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
  const view = current ? state.context : snapshot;
  if (!view?.edit) {
    return <div className="module-content">暂无改动可查看。</div>;
  }

  const { edit } = view;
  const showsVerifiedContent =
    edit.state === 'applied' ||
    view.calls.some(
      (call) => call.tool === 'edit_file' && call.state === 'succeeded',
    );
  const patch = structuredPatch(
    edit.path,
    edit.path,
    edit.before,
    edit.after,
    undefined,
    undefined,
    { context: 3, timeout: 100, maxEditLength: 2000 },
  );
  return (
    <div className="module-content agent-changes">
      <header className="agent-changes__file">
        <h3>{edit.path}</h3>
        <p className="metadata" role="status">
          本次运行 ·{' '}
          {edit.state === 'applied'
            ? '已写入并核对'
            : edit.state === 'not_applied'
              ? '未写入 · 尝试的改动'
              : showsVerifiedContent
                ? '最新写入待核对 · 显示此前已确认的改动'
                : '写入待核对 · 尝试的改动'}
        </p>
      </header>
      {patch === undefined ? (
        <>
          <h4>修改前</h4>
          <pre className="change-review__lines">{edit.before}</pre>
          <h4>{showsVerifiedContent ? '已核对的内容' : '尝试写入的内容'}</h4>
          <pre className="change-review__lines">{edit.after}</pre>
        </>
      ) : patch.hunks.length === 0 ? (
        <p className="metadata">修改前后内容相同。</p>
      ) : (
        <section className="change-review__lines" aria-label="文本改动">
          {patch.hunks.map((hunk) => (
            <section key={hunk.oldStart}>
              <h4 className="change-review__range">
                原文件第 {Math.max(1, hunk.oldStart)} 行起
              </h4>
              {hunk.lines.map((line, index) => (
                <div
                  key={index}
                  className={`change-review__line change-review__line--${line.startsWith('+') ? 'added' : line.startsWith('-') ? 'removed' : 'context'}`}
                >
                  {line[0]} {line.slice(1)}
                </div>
              ))}
            </section>
          ))}
        </section>
      )}
    </div>
  );
}

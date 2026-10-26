import { useEffect, useRef, useSyncExternalStore, type Dispatch } from 'react';
import type { Session } from '../../shared/contracts/session-workspace';
import type { SessionWorkspaceAction } from '../state/session-workspace-reducer';
import { workspaceIdentity } from './workspace-identity';
import { HazelCompanion } from './HazelCompanion';
import { RunPanel } from './RunPanel';
import { runViews } from '../state/run-view-instance';
export function Conversation({
  session,
  dispatch,
  allowDecoration,
}: {
  session: Session;
  dispatch: Dispatch<SessionWorkspaceAction>;
  allowDecoration: boolean;
}): React.JSX.Element {
  const transcript = useRef<HTMLDivElement>(null);
  const run = useSyncExternalStore(runViews.subscribe, () =>
    runViews.get(session.id),
  );
  const showDecoration = allowDecoration && run.phase === 'idle';
  useEffect(() => {
    if (transcript.current)
      transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [session.messages.length]);
  const save = (): void => {
    dispatch({ type: 'SAVE_MESSAGE', id: session.id });
  };
  const limited = session.messages.length >= 100;

  return (
    <section className="conversation" aria-label="Agent 对话">
      <div className="conversation__scroll" ref={transcript}>
        <div className="conversation__column">
          <div className="conversation-tools">
            <button
              type="button"
              className="quiet-button"
              onClick={() => {
                dispatch({
                  type: 'TOGGLE_PANEL',
                  id: session.id,
                  panel: 'context',
                });
              }}
            >
              上下文
            </button>
            <details className="run-log">
              <summary>运行日志</summary>
              <div>
                <h3>运行日志</h3>
                <RunPanel session={session} project={session.project} />
              </div>
            </details>
          </div>
          {session.messages.length === 0 ? (
            <div className="conversation-welcome">
              <span
                className="workspace-mark workspace-mark--large"
                style={workspaceIdentity(session.project.coverSeed)}
                aria-hidden="true"
              >
                {session.project.name.slice(0, 2).toUpperCase()}
              </span>
              <h2>从一个具体任务开始</h2>
              <p>描述你要完成什么。工作区与草稿留在这段会话里。</p>
              {showDecoration ? (
                <HazelCompanion sessionId={session.id} />
              ) : null}
              <div className="connection-notice">
                <span className="status-dot" aria-hidden="true" />
                <div>
                  <strong>运行器尚未连接</strong>
                  <p>
                    可以先整理任务。消息仅保存在本机，不会发送给模型或执行操作。
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              <ol className="message-list">
                {session.messages.map((message, index) => (
                  <li key={index}>
                    <span className="eyebrow">你</span>
                    <p>{message}</p>
                    <span className="metadata">已保留 · 尚未发送</span>
                  </li>
                ))}
              </ol>
              <p className="connection-notice" role="status">
                等待连接运行器。没有生成回复，也没有执行任何操作。
              </p>
            </>
          )}
        </div>
      </div>
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <label className="sr-only" htmlFor="session-message">
          给 Agent 的消息
        </label>
        <textarea
          id="session-message"
          aria-label="给 Agent 的消息"
          maxLength={8000}
          placeholder="描述任务，或补充要求…"
          value={session.draft}
          onChange={(event) => {
            dispatch({
              type: 'UPDATE_DRAFT',
              id: session.id,
              value: event.currentTarget.value,
            });
          }}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              (event.ctrlKey || event.metaKey) &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              save();
            }
          }}
        />
        <footer>
          <span className="metadata">
            {limited
              ? '当前会话已达 100 条，请新建会话。'
              : '仅本机保存 · Ctrl Enter'}
          </span>
          <button
            type="submit"
            className="button button--primary"
            disabled={!session.draft.trim() || limited}
          >
            保存到会话
          </button>
        </footer>
      </form>
    </section>
  );
}

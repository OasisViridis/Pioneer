import { useState, useSyncExternalStore } from 'react';

import type { ProjectSummary } from '../../shared/contracts/catalog';
import type { Session } from '../../shared/contracts/session-workspace';
import { runViews } from '../state/run-view-instance';
import { rejectionText, visibleStatus } from '../state/run-view';

/**
 * Run controls + live event log. The task typed here is what the model
 * receives; one click authorizes and starts it, with no intermediate summary
 * card. Visible outcomes are exactly five (运行中/正在停止/已停止/已完成/失败);
 * the stop button itself carries the immediate "停止中…" feedback while main
 * confirms real convergence.
 */
export function RunPanel({
  session,
  project,
}: {
  session: Session;
  project: ProjectSummary;
}): React.JSX.Element {
  const state = useSyncExternalStore(runViews.subscribe, () =>
    runViews.get(session.id),
  );
  const status = visibleStatus(state);
  const [task, setTask] = useState(
    () => session.messages.at(-1) ?? session.draft,
  );
  const active = state.phase === 'active' || state.phase === 'stopping';
  const authorizing = state.phase === 'authorizing';
  const stopping = state.phase === 'stopping' || state.status === 'stopping';
  const canStart = !active && !authorizing && task.trim().length > 0;

  const start = (): void => {
    const instruction = task.trim();
    if (instruction.length === 0) return;
    void runViews.launch({
      sessionId: session.id,
      projectId: project.id,
      revision: 1,
      task: instruction,
      summaryText: project.name,
    });
  };

  return (
    <div className="run-panel" aria-label="Agent 运行">
      <header className="run-panel__header">
        <span
          className={`run-status run-status--${state.status ?? 'idle'}`}
          aria-live="polite"
        >
          {status ?? '未运行'}
        </span>
        <span className="metadata">
          只读运行 · read_file / list_directory / search_in_files
        </span>
      </header>
      {state.rejectionCode !== null ? (
        <p role="alert" className="form-error">
          {rejectionText(state.rejectionCode)}
        </p>
      ) : null}
      <label className="run-panel__task">
        运行任务
        <textarea
          aria-label="运行任务"
          value={task}
          maxLength={8000}
          rows={3}
          disabled={active || authorizing}
          onChange={(event) => {
            setTask(event.currentTarget.value);
          }}
        />
      </label>
      {active ? (
        <button
          type="button"
          className="button"
          disabled={stopping}
          onClick={() => {
            void runViews.stop({
              sessionId: session.id,
              projectId: project.id,
              revision: 1,
            });
          }}
        >
          {stopping ? '停止中…' : '停止'}
        </button>
      ) : (
        <button
          type="button"
          className="button button--primary"
          disabled={!canStart}
          onClick={start}
        >
          {authorizing ? '正在授权…' : '启动运行'}
        </button>
      )}
      {state.events.length > 0 ? (
        <div className="run-log__list" aria-label="运行事件">
          {state.omittedHistory ? (
            <p className="metadata">部分历史已省略。</p>
          ) : null}
          <ol>
            {state.events.map((event) => (
              <li
                key={event.seq}
                className={`run-event run-event--${event.tone}`}
              >
                {event.kind === 'text' ? (
                  <p>{event.text}</p>
                ) : (
                  <span>
                    {event.kind === 'tool-requested'
                      ? `工具请求：${event.text}`
                      : event.kind === 'tool-result'
                        ? `工具结果：${event.text}`
                        : event.text}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      ) : state.phase === 'active' ? (
        <p className="metadata">运行中，等待第一批事件…</p>
      ) : null}
    </div>
  );
}

import { useSyncExternalStore } from 'react';

import type { ProjectSummary } from '../../shared/contracts/catalog';
import type { Session } from '../../shared/contracts/session-workspace';
import { runViews } from '../state/run-view-instance';
import { admissionText, visibleStatus } from '../state/run-view';

/**
 * Run controls + live event log. Visible outcomes are exactly five
 * (运行中/正在停止/已停止/已完成/失败); the stop button itself carries the
 * immediate "停止中…" feedback while main confirms real convergence.
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
  const intent = session.intentState.intent;
  const canLaunch =
    session.intentState.phase === 'session' &&
    session.intentState.runtime !== null &&
    intent !== null &&
    (state.phase === 'idle' ||
      state.phase === 'terminal' ||
      state.phase === 'error');
  const stopping = state.phase === 'stopping' || state.status === 'stopping';

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
      {state.admissionCode !== null ? (
        <p role="alert" className="form-error">
          {admissionText(state.admissionCode)}
        </p>
      ) : null}
      {canLaunch ? (
        <button
          type="button"
          className="button button--primary"
          disabled={state.phase === 'authorizing'}
          onClick={() => {
            void runViews.launch({
              sessionId: session.id,
              projectId: project.id,
              revision: intent.revision,
              task: intent.instruction,
              summaryText: `${project.name} · REV ${String(intent.revision)}`,
            });
          }}
        >
          {state.phase === 'authorizing' ? '正在授权…' : '启动运行'}
        </button>
      ) : null}
      {state.phase === 'active' || state.phase === 'stopping' ? (
        <button
          type="button"
          className="button"
          disabled={stopping}
          onClick={() => {
            void runViews.stop({
              sessionId: session.id,
              projectId: project.id,
              revision: session.intentState.intent?.revision ?? 1,
            });
          }}
        >
          {stopping ? '停止中…' : '停止'}
        </button>
      ) : null}
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

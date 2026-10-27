import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import type { ProjectSummary } from '../../shared/contracts/catalog';
import type { EgressCandidate } from '../../shared/contracts/egress';
import type { SessionRunRecord } from '../../shared/contracts/session-run-history';
import type { RunSnapshot } from '../../shared/contracts/run-context';
import type { Session } from '../../shared/contracts/session-workspace';
import { runViews } from '../state/run-view-instance';
import { failureText, rejectionText, visibleStatus } from '../state/run-view';

/**
 * Run controls + live event log. The task typed here is what the model
 * receives; one click authorizes and starts it, with no intermediate summary
 * card. Visible outcomes are exactly five (运行中/正在停止/已停止/已完成/失败);
 * the stop button itself carries the immediate "停止中…" feedback while main
 * confirms real convergence. Each terminal run is also stored in the session's
 * bounded run history (task + result), so it survives a restart.
 */
export function RunPanel({
  session,
  project,
  onRunTerminal,
  onRunSnapshot,
  onRunStarted,
  onOpenLog,
}: {
  session: Session;
  project: ProjectSummary;
  onRunTerminal: (record: SessionRunRecord) => void;
  onRunSnapshot: (snapshot: RunSnapshot) => void;
  onRunStarted: (revision: number) => void;
  onOpenLog: () => void;
}): React.JSX.Element {
  const state = useSyncExternalStore(runViews.subscribe, () =>
    runViews.get(session.id),
  );
  const status = visibleStatus(state);
  const [task, setTask] = useState(
    () => session.messages.at(-1) ?? session.draft,
  );
  const [selection, setSelection] = useState<{
    projectId: string;
    paths: string[];
  } | null>(null);
  const active = state.phase === 'active' || state.phase === 'stopping';
  const authorizing = state.phase === 'authorizing';
  const stopping = state.phase === 'stopping' || state.status === 'stopping';
  const materials =
    selection !== null && selection.projectId === project.id
      ? selection.paths
      : null;
  const canStart =
    !active && !authorizing && task.trim().length > 0 && materials !== null;
  const selectMaterials = useCallback(
    (paths: string[]): void => {
      setSelection({ projectId: project.id, paths });
    },
    [project.id],
  );

  const start = (): void => {
    const instruction = task.trim();
    if (instruction.length === 0) return;
    const revision = session.runRevision + 1;
    void runViews.launch({
      sessionId: session.id,
      projectId: project.id,
      revision,
      task: instruction,
      materials: materials ?? [],
      summaryText: project.name,
      onTerminal: onRunTerminal,
      onSnapshot: onRunSnapshot,
      onStarted: onRunStarted,
    });
  };

  const historyStatus = (record: SessionRunRecord): string =>
    record.status === 'completed'
      ? '已完成'
      : record.status === 'stopped'
        ? '已停止'
        : record.failureCode
          ? failureText(record.failureCode)
          : '失败';

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
      <MaterialPicker
        key={project.id}
        projectId={project.id}
        disabled={active || authorizing}
        onChange={selectMaterials}
      />
      {active ? (
        <button
          type="button"
          className="button"
          disabled={stopping}
          onClick={() => {
            void runViews.stop({
              sessionId: session.id,
              projectId: project.id,
              revision: state.revision ?? session.runRevision + 1,
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
      <p className="metadata">
        事件流在「运行日志」面板；打开面板不会停止运行、清除草稿或抢占焦点。
      </p>
      <button type="button" className="quiet-button" onClick={onOpenLog}>
        打开运行日志
      </button>
      {session.runHistory.length > 0 ? (
        <section className="run-history" aria-label="历史运行">
          <h4>历史运行</h4>
          <ol>
            {[...session.runHistory].reverse().map((record) => (
              <li key={record.runId} className="run-history__item">
                <div className="run-history__meta">
                  <span
                    className={`run-history__status run-history__status--${record.status}`}
                  >
                    {historyStatus(record)}
                  </span>
                  <span className="metadata">
                    {record.endedAt.replace('T', ' ').slice(0, 19)} UTC
                  </span>
                </div>
                <p className="run-history__task">{record.task}</p>
                {record.resultText.length > 0 ? (
                  <pre className="run-history__result">{record.resultText}</pre>
                ) : (
                  <p className="metadata">本次运行没有产生回答文本。</p>
                )}
                {record.truncated ? (
                  <p className="metadata">结果已截断。</p>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

/**
 * Bounded file picker for the egress manifest. The selected list is reported
 * to the parent after the async list arrives and on every toggle; the parent
 * only allows a launch when the list belongs to the current project.
 */
function MaterialPicker({
  projectId,
  disabled,
  onChange,
}: {
  projectId: string;
  disabled: boolean;
  onChange: (paths: string[]) => void;
}): React.JSX.Element {
  const [candidates, setCandidates] = useState<EgressCandidate[]>([]);
  const [selected, setSelected] = useState<string[] | null>(null);

  useEffect(() => {
    let current = true;
    void runViews.materials(projectId).then((next) => {
      if (!current) return;
      const paths = next.map((material) => material.path);
      setCandidates(next);
      setSelected(paths);
      onChange(paths);
    });
    return () => {
      current = false;
    };
  }, [projectId, onChange]);

  const toggle = (path: string, checked: boolean): void => {
    setSelected((current) => {
      if (current === null) return current;
      const next = checked
        ? [...current, path]
        : current.filter((item) => item !== path);
      onChange(next);
      return next;
    });
  };

  return (
    <fieldset
      className="run-materials"
      disabled={disabled}
      aria-label="外发材料"
    >
      <legend>外发材料</legend>
      <p className="metadata">
        只有勾选的文件内容可以进入模型请求；未勾选的文件结果会被拒绝。
      </p>
      {candidates.length === 0 ? (
        <p className="metadata">项目内没有可选的文本材料。</p>
      ) : (
        <ul>
          {candidates.map((candidate) => (
            <li key={candidate.path}>
              <label>
                <input
                  type="checkbox"
                  checked={selected?.includes(candidate.path) ?? false}
                  onChange={(event) => {
                    toggle(candidate.path, event.currentTarget.checked);
                  }}
                />
                <span>{candidate.path}</span>
                <span className="metadata">{candidate.bytes} B</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}

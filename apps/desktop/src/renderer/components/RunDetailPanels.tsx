import { useSyncExternalStore } from 'react';

import type { Session } from '../../shared/contracts/session-workspace';
import type {
  RunContextCall,
  RunContextMaterial,
} from '../../shared/contracts/run-context';
import type { SessionRunStatus } from '../../shared/contracts/session-run-history';
import { runViews } from '../state/run-view-instance';
import { describe, visibleStatus, type RunViewState } from '../state/run-view';
import {
  callStateText,
  capabilityCalls,
  materialReasonText,
  materialStateText,
  toolLabel,
  visibleMaterials,
} from '../state/run-panels';

/**
 * P3-A workbench panels: the current run's context, capability use and event
 * log. Every panel reads the per-session run view; with no live run it falls
 * back to the bounded summary persisted with that session, so the panel still
 * names the correct Session/Run after a restart. Result arrival only updates
 * data; it never opens a panel, moves focus or scrolls the conversation.
 */

interface PanelRun {
  runId: string | null;
  revision: number | null;
  status: string | null;
  tools: readonly string[];
  materials: RunContextMaterial[];
  calls: RunContextCall[];
  /** True when the data comes from the persisted terminal summary. */
  fromSnapshot: boolean;
  contextState: RunViewState['contextState'];
}

const SNAPSHOT_STATUS: Record<SessionRunStatus, string> = {
  completed: '已完成',
  stopped: '已停止',
  failed: '失败',
};

function panelRun(session: Session, state: RunViewState): PanelRun {
  if (state.runId !== null) {
    return {
      runId: state.runId,
      revision: state.revision,
      status: visibleStatus(state),
      tools: state.authorization?.tools ?? [],
      materials: visibleMaterials(state),
      calls:
        state.context?.calls ??
        capabilityCalls(state.events).map((call) => ({
          callId: call.callId,
          tool: call.tool as RunContextCall['tool'],
          target: null,
          state: call.state,
          code: call.code,
          at: call.at,
        })),
      fromSnapshot: false,
      contextState: state.contextState,
    };
  }
  const snapshot = session.lastRunView;
  if (snapshot === null) {
    return {
      runId: null,
      revision: null,
      status: null,
      tools: [],
      materials: [],
      calls: [],
      fromSnapshot: false,
      contextState: 'idle',
    };
  }
  return {
    runId: snapshot.identity.runId,
    revision: snapshot.identity.revision,
    status: SNAPSHOT_STATUS[snapshot.status],
    tools: snapshot.tools,
    materials: snapshot.materials,
    calls: snapshot.calls,
    fromSnapshot: true,
    contextState: 'ready',
  };
}

function RunIdentity({
  session,
  run,
}: {
  session: Session;
  run: PanelRun;
}): React.JSX.Element {
  return (
    <header className="module-run-identity">
      <p className="eyebrow">会话 · {session.title}</p>
      <p className="metadata">
        {run.runId === null
          ? '本会话尚未启动运行'
          : `运行 ${run.runId} · 修订 ${String(run.revision ?? '—')} · ${run.status ?? '未运行'}`}
      </p>
      {run.fromSnapshot ? (
        <p className="metadata">
          这是本机保存的上次运行摘要；事件流不持久化，重启后只显示摘要。
        </p>
      ) : null}
    </header>
  );
}

function useRun(session: Session): RunViewState {
  return useSyncExternalStore(runViews.subscribe, () =>
    runViews.get(session.id),
  );
}

export function RunContextPanel({
  session,
}: {
  session: Session;
}): React.JSX.Element {
  const state = useRun(session);
  const run = panelRun(session, state);
  const sourceNote = run.fromSnapshot
    ? '摘要来自本机保存的上次运行；没有补造未记录的材料。'
    : run.contextState === 'ready'
      ? '读取状态来自 main 对本次运行的实际记录。'
      : '尚未取得运行上下文；只显示已批准的清单，不推断已读取。';
  return (
    <div className="module-content run-detail">
      <RunIdentity session={session} run={run} />
      {run.runId === null ? (
        <div className="module-empty">
          <span className="empty-symbol" aria-hidden="true">
            ▤
          </span>
          <h3>还没有可查看的上下文</h3>
          <p>
            启动一次运行后，这里列出本次批准的材料和 main
            记录的实际读取状态；不会显示未批准的内容。
          </p>
        </div>
      ) : run.contextState === 'unavailable' ? (
        <p role="status" className="form-error">
          {state.contextError
            ? '读取运行上下文失败：主进程查询没有返回可用数据。面板没有补造材料清单。'
            : '本次运行的上下文已不可用：运行记录已过期，或只剩重启标注。没有伪造材料清单。'}
        </p>
      ) : run.contextState === 'loading' ? (
        <p className="metadata" role="status">
          正在读取 main 的运行上下文…
        </p>
      ) : null}
      {run.runId !== null && run.materials.length === 0 ? (
        <p className="metadata">本次运行没有批准任何外发材料。</p>
      ) : null}
      {run.materials.length > 0 ? (
        <ul className="run-material-list" aria-label="运行上下文材料">
          {run.materials.map((material) => {
            const reason = materialReasonText(material.reason);
            return (
              <li key={material.path} className="run-material">
                <div className="run-material__head">
                  <span className="run-material__path">{material.path}</span>
                  <span
                    className={`run-material__state run-material__state--${material.state}`}
                  >
                    {materialStateText(material.state)}
                  </span>
                </div>
                <p className="metadata">
                  {material.bytes} B · SHA-256 {material.sha256.slice(0, 12)}…
                  {material.readAt
                    ? ` · ${material.state === 'scanned' ? '扫描于' : '读取于'} ${material.readAt.replace('T', ' ').slice(11, 19)} UTC`
                    : ''}
                </p>
                {reason ? <p className="form-error">{reason}</p> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {run.runId !== null ? <p className="metadata">{sourceNote}</p> : null}
      {state.authorization !== null ? (
        <details className="run-authorization">
          <summary>本次授权摘要</summary>
          <dl className="metadata-list">
            <div>
              <dt>模型</dt>
              <dd>{state.authorization.model ?? '未配置（受控运行器）'}</dd>
            </div>
            <div>
              <dt>运行器</dt>
              <dd>{state.authorization.adapter}</dd>
            </div>
            <div>
              <dt>到期</dt>
              <dd>{state.authorization.expiresAt}</dd>
            </div>
            <div>
              <dt>任务摘要</dt>
              <dd className="path-text">{state.authorization.taskDigest}</dd>
            </div>
          </dl>
        </details>
      ) : null}
    </div>
  );
}

const TOOL_ROWS = ['read_file', 'list_directory', 'search_in_files'] as const;

export function RunCapabilitiesPanel({
  session,
}: {
  session: Session;
}): React.JSX.Element {
  const state = useRun(session);
  const run = panelRun(session, state);
  const authorized = run.tools;
  return (
    <div className="module-content run-detail">
      <RunIdentity session={session} run={run} />
      <h3 className="run-detail__heading">可用能力</h3>
      <dl className="capability-list">
        {TOOL_ROWS.map((tool) => (
          <div key={tool}>
            <dt>{toolLabel(tool)}</dt>
            <dd>
              {run.runId === null
                ? '尚未授权'
                : authorized.includes(tool)
                  ? '可用 · 只读'
                  : '未授权'}
            </dd>
          </div>
        ))}
        <div>
          <dt>写入工作区</dt>
          <dd>未提供（P2 只读边界）</dd>
        </div>
        <div>
          <dt>执行命令</dt>
          <dd>未提供（P2 只读边界）</dd>
        </div>
      </dl>
      {state.authorization !== null ? (
        <p className="metadata">
          {`授权于 ${state.authorization.expiresAt} 到期；授权不代表已经调用。`}
        </p>
      ) : null}
      <h3 className="run-detail__heading">本次调用的工具</h3>
      {run.calls.length === 0 ? (
        <p className="metadata">
          {run.runId === null
            ? '还没有运行，因此没有工具调用。'
            : '本次运行尚未请求工具。'}
        </p>
      ) : (
        <ol className="capability-calls" aria-label="工具调用记录">
          {run.calls.map((call) => (
            <li
              key={call.callId}
              className={`capability-call capability-call--${call.state}`}
            >
              <div className="capability-call__head">
                <span>{toolLabel(call.tool)}</span>
                <span
                  className={`capability-state capability-state--${call.state}`}
                >
                  {callStateText(call.state)}
                </span>
              </div>
              <p className="metadata">
                {call.callId}
                {call.target === null ? '' : ` · ${call.target}`}
                {call.code === null ? '' : ` · ${call.code}`}
              </p>
            </li>
          ))}
        </ol>
      )}
      <p className="metadata">
        拒绝、失败与取消分别标注，不会显示成空结果；未提供的写入与命令能力不会被猜测为可用。
      </p>
    </div>
  );
}

export function RunLogPanel({
  session,
}: {
  session: Session;
}): React.JSX.Element {
  const state = useRun(session);
  const run = panelRun(session, state);
  const entries = state.events
    .map((event) => ({ event, display: describe(event) }))
    .filter(
      (
        item,
      ): item is {
        event: (typeof state.events)[number];
        display: NonNullable<ReturnType<typeof describe>>;
      } => item.display !== null,
    );
  const live = run.runId !== null && !run.fromSnapshot;
  return (
    <div className="module-content run-detail">
      <RunIdentity session={session} run={run} />
      {state.ignoredEvents > 0 ? (
        <p role="alert" className="form-error">
          {`已忽略 ${String(state.ignoredEvents)} 条不属于当前运行身份的事件（来源或格式校验不通过）。`}
        </p>
      ) : null}
      {state.omittedHistory ? (
        <p className="metadata" role="status">
          部分较早事件已省略（保留上限），不拼接成完整输出。
        </p>
      ) : null}
      {live && entries.length > 0 ? (
        <ol className="run-log-entries" aria-label="运行事件">
          {entries.map(({ event, display }) => (
            <li
              key={event.seq}
              className={`run-event run-event--${display.tone}`}
            >
              <p className="run-event__meta metadata">
                {`#${String(event.seq)} · ${event.at.replace('T', ' ').slice(11, 19)} UTC · ${event.source}`}
                {event.body.type === 'tool.result'
                  ? ` · ${event.body.result.status}`
                  : ''}
              </p>
              {display.kind === 'text' ? (
                <p>{display.text}</p>
              ) : (
                <span>
                  {display.kind === 'tool-requested'
                    ? `工具请求：${display.text}`
                    : display.kind === 'tool-result'
                      ? `工具结果：${display.text}`
                      : display.text}
                </span>
              )}
            </li>
          ))}
        </ol>
      ) : run.fromSnapshot && run.calls.length > 0 ? (
        <>
          <h3 className="run-detail__heading">调用摘要</h3>
          <ol className="run-log-entries" aria-label="运行调用摘要">
            {run.calls.map((call) => (
              <li key={call.callId} className="run-event run-event--tool">
                <p className="run-event__meta metadata">
                  {`${call.callId} · ${call.at.replace('T', ' ').slice(11, 19)} UTC`}
                </p>
                <span>
                  {`${toolLabel(call.tool)} · ${callStateText(call.state)}`}
                  {call.code === null ? '' : ` · ${call.code}`}
                </span>
              </li>
            ))}
          </ol>
          <p className="metadata">
            事件流仅保存在运行期间；重启后这里显示有界调用摘要，不重放未保存的事件。
          </p>
        </>
      ) : (
        <div className="module-empty">
          <span className="empty-symbol" aria-hidden="true">
            ≡
          </span>
          <h3>
            {run.runId === null
              ? '还没有运行日志'
              : run.fromSnapshot
                ? '上次运行没有工具调用'
                : '等待第一批事件…'}
          </h3>
          <p>
            {run.runId === null
              ? '运行事件只在启动后产生；这里不填入演示数据。'
              : run.fromSnapshot
                ? '本机只保存了有界摘要，其中没有工具调用；事件流未持久化。'
                : '事件按 main 分配的序号显示；结果到达不会自动切换面板或抢焦点。'}
          </p>
        </div>
      )}
      <p className="metadata">
        日志仅覆盖当前运行；历史运行保留任务与结果摘要，事件流不无限保存。
      </p>
    </div>
  );
}

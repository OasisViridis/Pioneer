import { useReducer } from 'react';

import type { ProjectSummary } from '../../shared/contracts/catalog';
import {
  initialIntentWorkspaceState,
  intentWorkspaceReducer,
  type IntentWorkspaceError,
} from '../state/intent-workspace';

export interface ProjectWorkspaceProps {
  project: ProjectSummary;
}

const errorCopy: Record<IntentWorkspaceError, string> = {
  EMPTY_INSTRUCTION: '请输入任务说明后再生成意图计划。',
  INVALID_ACTION: '当前操作无效，请重新开始。',
  INVALID_INTENT: '当前任务状态无效，请重新开始。',
  INVALID_TRANSITION: '当前状态不能执行这个操作。',
  REVISION_OVERFLOW: '任务版本已达到上限，请重新开始。',
  STALE_REVISION: '任务版本已变化，请重新审阅。',
  INTENT_NOT_READY: '只有已批准的 READY 意图才能初始化运行会话。',
  INVALID_SESSION: '运行会话无效，无法建立生命周期。',
  INVALID_LIFECYCLE: '运行生命周期无效，请新建任务重新开始。',
  INVALID_LIFECYCLE_TRANSITION: '当前生命周期状态不能再次请求启动。',
};

function ProjectContext({
  project,
}: {
  project: ProjectSummary;
}): React.JSX.Element {
  return (
    <aside className="workspace-context" aria-label="Workspace context">
      <p className="eyebrow">WORKSPACE CONTEXT</p>
      <h2>当前上下文</h2>
      <dl className="workspace-context__list">
        <div>
          <dt>项目路径</dt>
          <dd className="path-text">{project.absolutePath}</dd>
        </div>
        <div>
          <dt>Git</dt>
          <dd>{project.hasGitRepository ? '已检测到仓库' : '未检测到仓库'}</dd>
        </div>
        <div>
          <dt>技术栈</dt>
          <dd>
            {project.technologies.length > 0
              ? project.technologies.slice(0, 8).join(' · ')
              : '暂无可用元数据'}
          </dd>
        </div>
      </dl>
      <div className="workspace-boundary">
        <strong>本轮边界</strong>
        <span>生成、审阅 TaskIntent，并记录受控 Runtime 生命周期事件</span>
        <span>不连接模型 · 不执行工具 · 不写文件 · 不启动进程</span>
      </div>
    </aside>
  );
}

function SceneBar(): React.JSX.Element {
  return (
    <nav aria-label="Workspace scenes" className="scene-bar">
      <button
        aria-current="page"
        className="scene-bar__item scene-bar__item--active"
        type="button"
      >
        输入
      </button>
      <button
        aria-disabled="true"
        className="scene-bar__item"
        disabled
        type="button"
      >
        审阅
      </button>
      <button
        aria-disabled="true"
        className="scene-bar__item"
        disabled
        type="button"
      >
        输出
      </button>
      <button
        aria-disabled="true"
        className="scene-bar__item"
        disabled
        type="button"
      >
        自定
      </button>
      <span className="scene-bar__hint">M3 · Lifecycle events</span>
    </nav>
  );
}

export function ProjectWorkspace({
  project,
}: ProjectWorkspaceProps): React.JSX.Element {
  const [state, dispatch] = useReducer(
    intentWorkspaceReducer,
    undefined,
    initialIntentWorkspaceState,
  );

  const error = state.error === null ? null : errorCopy[state.error];

  const submitInstruction = (): void => {
    dispatch({ type: 'SUBMIT', projectId: project.id });
  };

  return (
    <article className="project-workspace">
      <header className="project-workspace__header">
        <div>
          <h1>{project.name}</h1>
          <div className="project-workspace__meta">
            <span>桌面任务助理 Agent · 当前工作区</span>
            <span className="status-pill">
              {project.hasGitRepository ? 'GIT' : 'NO GIT'}
            </span>
            <span className="status-pill">READ ONLY</span>
          </div>
        </div>
        <div className="project-workspace__header-actions">
          <span className="status-pill">M3 · LIFECYCLE EVENTS</span>
          <button
            className="button"
            onClick={() => {
              dispatch({ type: 'RESET' });
            }}
            type="button"
          >
            ＋ 新任务
          </button>
        </div>
      </header>

      <SceneBar />

      {state.phase === 'compose' ? (
        <section className="input-compose-layout" aria-label="Task input">
          <form
            className="task-composer"
            onSubmit={(event) => {
              event.preventDefault();
              submitInstruction();
            }}
          >
            <div>
              <p className="eyebrow">任务</p>
              <h2>{state.intent === null ? '新建任务' : '调整任务'}</h2>
              <p className="surface-copy">
                描述目标与约束。提交后先进入 Intent Review，不会直接执行。
              </p>
            </div>

            <label className="task-composer__field">
              <span>任务说明</span>
              <textarea
                aria-label="任务说明"
                onChange={(event) => {
                  dispatch({
                    type: 'SET_INSTRUCTION',
                    instruction: event.target.value,
                  });
                }}
                placeholder="例如：检查当前工作区导航，先给出最小安全计划；批准前不要修改文件。"
                rows={8}
                value={state.draftInstruction}
              />
            </label>

            {error === null ? null : (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}

            <div className="task-composer__footer">
              <div className="context-chips" aria-label="Task boundaries">
                <span>@ 当前项目</span>
                <span>只读上下文</span>
                <span>批准前不执行</span>
              </div>
              <button className="button button--primary" type="submit">
                生成意图计划
              </button>
            </div>
          </form>

          <ProjectContext project={project} />
        </section>
      ) : null}

      {state.phase === 'review' && state.intent !== null ? (
        <section className="intent-review-layout" aria-label="Intent Review">
          <div className="intent-preflight">
            <header className="intent-preflight__header">
              <div>
                <p className="eyebrow">INPUT · INTENT REVIEW</p>
                <h2>意图审阅</h2>
              </div>
              <span className="pending-pill">等待批准</span>
            </header>

            <div className="conversation-card conversation-card--user">
              <span>你的任务</span>
              <p>{state.intent.instruction}</p>
            </div>

            <div className="preflight-card">
              <p className="eyebrow">LOCAL PREFLIGHT</p>
              <h3>已形成本地预览计划</h3>
              <p>
                当前计划由 Pioneer 本地确定性规则生成，用于验证
                Human-in-the-loop 流程。没有模型调用、工具执行、Token
                消耗或文件写入。
              </p>
              <dl>
                <div>
                  <dt>项目</dt>
                  <dd>{project.name}</dd>
                </div>
                <div>
                  <dt>范围</dt>
                  <dd>Intent-only · Read-only</dd>
                </div>
                <div>
                  <dt>下一状态</dt>
                  <dd>批准后仅进入 READY</dd>
                </div>
              </dl>
            </div>

            <div className="approval-handoff">
              <strong>执行尚未开始。</strong>
              <span>请在右侧核对意图与步骤，再决定批准、修改或取消。</span>
            </div>
          </div>

          <aside className="intent-card" aria-label="Intent card">
            <header className="intent-card__status">
              <span className="eyebrow">TASK INTENT</span>
              <span className="pending-pill">待批准</span>
            </header>
            <h2>{project.name} · 任务计划</h2>
            <p className="surface-copy">{state.intent.instruction}</p>
            <div className="intent-card__context">
              <span className="success-pill">零写入</span>
              <span className="status-pill">REV {state.intent.revision}</span>
              <span className="status-pill">LOCAL PREVIEW</span>
            </div>
            <hr />
            <p className="eyebrow">执行计划</p>
            <ol className="intent-steps">
              {state.intent.steps.map((step, index) => (
                <li key={step.id}>
                  <span className="intent-step__number">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <strong>{step.summary}</strong>
                    <span>
                      {index === 0
                        ? 'READY'
                        : index === 1
                          ? 'WAITING'
                          : 'PENDING'}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
            {error === null ? null : (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="intent-card__actions">
              <button
                className="button"
                onClick={() => {
                  dispatch({ type: 'EDIT' });
                }}
                type="button"
              >
                返回修改
              </button>
              <button
                className="button"
                onClick={() => {
                  dispatch({ type: 'CANCEL' });
                }}
                type="button"
              >
                取消任务
              </button>
              <button
                className="button button--approve"
                onClick={() => {
                  dispatch({ type: 'CONFIRM' });
                }}
                type="button"
              >
                批准计划
              </button>
            </div>
          </aside>
        </section>
      ) : null}

      {state.phase === 'ready' && state.intent !== null ? (
        <section className="intent-terminal-state" aria-label="Intent ready">
          <span className="ready-badge">READY</span>
          <p className="eyebrow">INPUT · APPROVAL COMPLETE</p>
          <h2>意图已批准</h2>
          <p>
            TaskIntent revision {state.intent.revision} 已进入 READY。现在可以
            初始化受控 Runtime Session；初始化只锁定已批准意图，不会启动模型、
            工具执行或文件修改。
          </p>
          <div className="intent-terminal-state__summary">
            <strong>{state.intent.instruction}</strong>
            <span>
              {state.intent.steps.length} 个计划步骤将原样锁定到 Runtime
              Session。
            </span>
          </div>
          {error === null ? null : (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="intent-terminal-state__actions">
            <button
              className="button button--primary"
              onClick={() => {
                dispatch({ type: 'BOOTSTRAP_SESSION' });
              }}
              type="button"
            >
              初始化运行会话
            </button>
            <button
              className="button"
              onClick={() => {
                dispatch({ type: 'RESET' });
              }}
              type="button"
            >
              新建任务
            </button>
          </div>
        </section>
      ) : null}

      {state.phase === 'session' && state.runtime !== null ? (
        <section
          className="intent-terminal-state"
          aria-label="Runtime lifecycle"
        >
          <span className="ready-badge">
            {state.runtime.status === 'initialized'
              ? 'SESSION INITIALIZED'
              : 'START REQUESTED'}
          </span>
          <p className="eyebrow">INPUT · RUNTIME LIFECYCLE</p>
          <h2>
            {state.runtime.status === 'initialized'
              ? '运行会话已初始化'
              : '启动请求已记录'}
          </h2>
          <p>
            Runtime Session 已锁定批准后的 TaskIntent revision{' '}
            {state.runtime.session.approvedIntent.revision}。
            {state.runtime.status === 'initialized'
              ? ' 你可以记录一次启动请求；执行仍未开始。'
              : ' 启动请求仅进入本地事件流；执行仍未开始。'}
          </p>
          <div className="runtime-session-grid">
            <div>
              <span>Session ID</span>
              <strong className="path-text">{state.runtime.session.id}</strong>
            </div>
            <div>
              <span>批准意图</span>
              <strong>
                REV {state.runtime.session.approvedIntent.revision}
              </strong>
            </div>
            <div>
              <span>生命周期</span>
              <strong>
                {state.runtime.status === 'initialized'
                  ? 'INITIALIZED'
                  : 'START REQUESTED'}
              </strong>
            </div>
          </div>
          <div
            className="runtime-capabilities"
            aria-label="Runtime capabilities"
          >
            <strong>模型接入：关闭</strong>
            <strong>工具执行：关闭</strong>
            <strong>文件写入：关闭</strong>
          </div>
          <section
            className="runtime-event-stream"
            aria-label="Runtime event stream"
          >
            <div className="runtime-event-stream__header">
              <p className="eyebrow">LOCAL EVENT STREAM</p>
              <span>{state.runtime.events.length} EVENT(S)</span>
            </div>
            <ol>
              {state.runtime.events.map((event) => (
                <li key={event.id}>
                  <span className="runtime-event__sequence">
                    {String(event.sequence).padStart(2, '0')}
                  </span>
                  <div>
                    <strong>{event.type}</strong>
                    <span>
                      {event.type === 'session.initialized'
                        ? `Approved intent REV ${String(
                            event.approvedIntentRevision,
                          )} locked`
                        : 'Local start request recorded · no execution'}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </section>
          <div className="intent-terminal-state__summary">
            <strong>{state.runtime.session.approvedIntent.instruction}</strong>
            <span>
              本地生命周期事件只表达状态边界，不代表模型、工具或 Agent Runtime
              已经运行。
            </span>
          </div>
          {error === null ? null : (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="intent-terminal-state__actions">
            <button
              className="button button--primary"
              disabled={state.runtime.status !== 'initialized'}
              onClick={() => {
                dispatch({ type: 'REQUEST_RUNTIME_START' });
              }}
              type="button"
            >
              {state.runtime.status === 'initialized'
                ? '请求启动 Runtime'
                : '启动请求已记录'}
            </button>
            <button
              className="button"
              onClick={() => {
                dispatch({ type: 'RESET' });
              }}
              type="button"
            >
              新建任务
            </button>
          </div>
        </section>
      ) : null}

      {state.phase === 'cancelled' ? (
        <section
          className="intent-terminal-state"
          aria-label="Intent cancelled"
        >
          <p className="eyebrow">INPUT · CANCELLED</p>
          <h2>任务已取消</h2>
          <p>没有启动执行，也没有修改项目文件。</p>
          <button
            className="button"
            onClick={() => {
              dispatch({ type: 'RESET' });
            }}
            type="button"
          >
            返回新任务
          </button>
        </section>
      ) : null}
    </article>
  );
}

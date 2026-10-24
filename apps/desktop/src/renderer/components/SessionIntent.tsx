import { useState, type Dispatch } from 'react';
import type { Session } from '../../shared/contracts/session-workspace';
import type { SessionWorkspaceAction } from '../state/session-workspace-reducer';

/** Optional conversation-local clarification, never a prerequisite for storing a message. */
export function SessionIntent({
  session,
  dispatch,
}: {
  session: Session;
  dispatch: Dispatch<SessionWorkspaceAction>;
}): React.JSX.Element {
  const state = session.intentState;
  const [expanded, setExpanded] = useState(
    state.intent !== null || state.draftInstruction.length > 0,
  );
  const act = (
    action: Extract<
      SessionWorkspaceAction,
      { type: 'INTENT_ACTION' }
    >['action'],
  ): void => {
    dispatch({ type: 'INTENT_ACTION', id: session.id, action });
  };
  return (
    <section className="session-intent" aria-label="任务澄清">
      <button
        type="button"
        className="quiet-button"
        aria-expanded={expanded}
        onClick={() => {
          setExpanded(!expanded);
        }}
      >
        澄清任务
      </button>
      {expanded ? (
        <div className="session-intent__body">
          <p className="metadata">需要时整理目标与约束，也可以直接保存消息。</p>
          {state.error ? (
            <p role="alert" className="form-error">
              {state.error === 'EMPTY_INSTRUCTION'
                ? '请先填写任务说明。'
                : '当前操作无法完成，请检查任务状态后重试。'}
            </p>
          ) : null}
          {state.phase === 'compose' ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                act({ type: 'SUBMIT' });
              }}
            >
              <label>
                任务说明
                <textarea
                  aria-label="任务说明"
                  value={state.draftInstruction}
                  maxLength={16384}
                  rows={4}
                  onChange={(event) => {
                    act({
                      type: 'SET_INSTRUCTION',
                      instruction: event.currentTarget.value,
                    });
                  }}
                />
              </label>
              <button type="submit" className="button">
                生成意图摘要
              </button>
            </form>
          ) : null}
          {state.intent ? (
            <div className="intent-summary">
              <header>
                <h3>意图摘要</h3>
                <span>REV {state.intent.revision}</span>
              </header>
              <p>{state.intent.instruction}</p>
              <p className="metadata">本地整理的摘要，尚未调用模型。</p>
              {state.phase === 'review' ? (
                <div className="intent-actions">
                  <button
                    className="button"
                    type="button"
                    onClick={() => {
                      act({ type: 'EDIT' });
                    }}
                  >
                    返回修改
                  </button>
                  <button
                    className="button"
                    type="button"
                    onClick={() => {
                      act({ type: 'CONFIRM' });
                    }}
                  >
                    确认摘要
                  </button>
                  <button
                    className="quiet-button"
                    type="button"
                    onClick={() => {
                      act({ type: 'CANCEL' });
                    }}
                  >
                    取消任务
                  </button>
                </div>
              ) : null}
              {state.phase === 'ready' ? (
                <>
                  <p>READY</p>
                  <button
                    className="button"
                    type="button"
                    onClick={() => {
                      act({ type: 'BOOTSTRAP_SESSION' });
                    }}
                  >
                    初始化运行会话
                  </button>
                </>
              ) : null}
              {state.phase === 'session' && state.runtime ? (
                <div className="runtime-snapshot">
                  <h3>运行会话已初始化</h3>
                  <p className="path-text">{state.runtime.session.id}</p>
                  <p>模型接入：按会话授权</p>
                  <p>工具执行：只读三件套</p>
                  <p>文件写入：关闭</p>
                  <p className="metadata">
                    在上方「运行日志」中启动只读任务、查看读取结果并随时停止。
                  </p>
                </div>
              ) : null}
              {state.phase === 'cancelled' ? (
                <p role="status">任务已取消</p>
              ) : null}
              {state.phase === 'ready' ||
              state.phase === 'session' ||
              state.phase === 'cancelled' ? (
                <button
                  type="button"
                  className="quiet-button"
                  onClick={() => {
                    act({ type: 'RESET' });
                  }}
                >
                  重新整理任务
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

import { useState } from 'react';

import type { Session } from '../../shared/contracts/session-workspace';
import type { PioneerDesktopApi } from '../../shared/contracts/ipc';
import type {
  WriteExecutionRequest,
  WriteExecutionResult,
  WriteReviewDenialCode,
  WriteReviewReply,
} from '../../shared/contracts/write-execution';
import { PermissionCard, type PermissionCardState } from './PermissionCard';

/**
 * #19 review entry: one prepared replacement, a real diff, the S2 permission
 * summary, and an explicit approve/deny pair. `approve` is the only path that
 * calls the write channel, and the panel only shows `applied` after main
 * returns a verified read-back. `deny` never crosses the bridge.
 */

const PREVIEW_TARGET = 'README.md';

const DENIAL_COPY: Record<WriteReviewDenialCode, string> = {
  INVALID_REQUEST: '请求没有通过校验；没有读取或写入任何文件。',
  UNTRUSTED_SENDER: '当前窗口不是受信任的发送方；没有执行。',
  BINDING_MISMATCH: '审阅记录与当前窗口或项目不一致；没有执行。',
  PROJECT_UNAVAILABLE: '当前项目不可用；先选择工作区并重新扫描。',
  CONTENT_MISMATCH: '内容与声明的哈希不一致；没有执行。',
  TARGET_MISSING:
    '项目里没有 README.md。受控写入只替换已有文本文件，不会创建新文件。',
  TARGET_NOT_REGULAR_FILE: '目标不是普通文件，不能写入。',
  TARGET_LINK_NOT_ALLOWED: '目标是链接或路径别名，不允许写入。',
  TARGET_TOO_LARGE: '目标超过 1 MiB 预算，不能进入批次。',
  TARGET_UNREADABLE: '目标无法按 UTF-8 文本完整读取，不能写入。',
  TARGET_UNSTABLE: '读取期间目标发生变化；请重新审阅。',
};

const RESULT_COPY: Record<WriteExecutionResult['status'], string> = {
  applied: '已应用并回读校验',
  rejected: '已拒绝，未写入',
  verification_failed: '回读校验失败',
  restored: '已恢复原内容',
  unchanged: '未改动',
  failed: '写入失败',
  unknown: '结果未知',
};

type Phase =
  | 'idle'
  | 'preparing'
  | 'reviewing'
  | 'executing'
  | 'applied'
  | 'denied'
  | 'failed';

type PreparedReview = Extract<WriteReviewReply, { ok: true }>;

interface DiffLine {
  kind: 'context' | 'added';
  text: string;
}

/** Bounded line preview for the prepared append; no full-file dump. */
function diffLines(
  before: string,
  after: string,
): { lines: DiffLine[]; complete: boolean } {
  const contextLimit = 10;
  const beforeLines = before.split('\n');
  const context = beforeLines
    .slice(Math.max(0, beforeLines.length - contextLimit))
    .map((text): DiffLine => ({ kind: 'context', text }));
  if (!after.startsWith(before)) {
    return {
      lines: after
        .split('\n')
        .slice(0, 20)
        .map((text): DiffLine => ({ kind: 'added', text })),
      complete: false,
    };
  }
  const addition = after.slice(before.length);
  const addedLines = addition
    .split('\n')
    .filter((line, index, all) => !(index === all.length - 1 && line === ''))
    .slice(0, 20)
    .map((text): DiffLine => ({ kind: 'added', text }));
  return { lines: [...context, ...addedLines], complete: true };
}

function shortHash(value: string | null): string {
  return value === null ? '—' : `${value.slice(0, 12)}…`;
}

function cardStateFor(phase: Phase): PermissionCardState {
  if (phase === 'denied') return 'Denied';
  if (phase === 'applied') return 'Approved';
  if (phase === 'failed') return 'Expired';
  return 'Awaiting';
}

function cardNoteFor(phase: Phase): string {
  switch (phase) {
    case 'reviewing':
      return '受控写入审阅 · 批准后由本机 main 校验并写入';
    case 'executing':
      return '正在写入并回读校验；完成前不会显示为已应用';
    case 'denied':
      return '你已拒绝 · 本次没有调用写入通道';
    case 'applied':
      return 'main 已回读校验，确认字节与后像哈希一致';
    case 'failed':
      return '未通过校验 · 本次不会显示为已应用';
    default:
      return '受控写入审阅';
  }
}

function targetOf(request: WriteExecutionRequest) {
  return request.targets[0];
}

/** A partial preload surface must be reported as unsupported, not assumed. */
function hasWriteApi(): boolean {
  const bridge: unknown = window.pioneer;
  return (
    typeof bridge === 'object' &&
    bridge !== null &&
    typeof (bridge as Partial<PioneerDesktopApi>).prepareWrite === 'function' &&
    typeof (bridge as Partial<PioneerDesktopApi>).executeWrite === 'function'
  );
}

export function ChangeApprovalReview({
  session,
}: {
  session: Session;
}): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('idle');
  const [review, setReview] = useState<PreparedReview | null>(null);
  const [denial, setDenial] = useState<WriteReviewDenialCode | null>(null);
  const [result, setResult] = useState<WriteExecutionResult | null>(null);
  const [bridgeError, setBridgeError] = useState<string | null>(null);

  const apiAvailable = hasWriteApi();

  const reset = (): void => {
    setPhase('idle');
    setReview(null);
    setDenial(null);
    setResult(null);
    setBridgeError(null);
  };

  const prepare = async (): Promise<void> => {
    setPhase('preparing');
    setReview(null);
    setDenial(null);
    setResult(null);
    setBridgeError(null);
    try {
      const reply = await window.pioneer.prepareWrite({
        action: 'prepare',
        sessionId: session.id,
        projectId: session.project.id,
        targetPath: PREVIEW_TARGET,
      });
      if (reply.ok) {
        setReview(reply);
        setPhase('reviewing');
        return;
      }
      setDenial(reply.code);
      setPhase('failed');
    } catch {
      setBridgeError(
        '审阅握手没有返回可用数据；没有写入任何文件。请重试或检查当前构建。',
      );
      setPhase('failed');
    }
  };

  const approve = async (): Promise<void> => {
    if (review === null) return;
    setPhase('executing');
    setResult(null);
    try {
      const execution = await window.pioneer.executeWrite({
        action: 'execute',
        request: review.request,
      });
      setResult(execution);
      const verified =
        execution.ok &&
        execution.status === 'applied' &&
        execution.verification === 'verified';
      setPhase(verified ? 'applied' : 'failed');
    } catch {
      setBridgeError(
        '执行通道没有返回可验证的结果；本次变更不会显示为已应用。',
      );
      setPhase('failed');
    }
  };

  // Deny is deliberately local: it records no grant and calls no write API.
  const deny = (): void => {
    setPhase('denied');
    setResult(null);
  };

  const target = review === null ? undefined : targetOf(review.request);
  const diff =
    review === null || target === undefined
      ? null
      : diffLines(review.beforePreview, target.content);

  return (
    <div className="module-content change-review" aria-label="受控变更审批">
      <header className="change-review__header">
        <p className="eyebrow">受控写入 · Issue #19</p>
        <h3>受控变更审批</h3>
        <p className="metadata">
          这个入口只处理一次受控替换：把项目里的已有文本文件追加一条审阅标记。
          预览、权限记录和后像哈希都由本机 main 生成；批准后 main 会重新核对当前
          字节再写入，并回读确认。
        </p>
      </header>

      {!apiAvailable ? (
        <p role="alert" className="form-error">
          当前运行时没有受控写入通道（unsupported）。没有读取或写入任何文件。
        </p>
      ) : null}

      {phase === 'idle' && apiAvailable ? (
        <button type="button" onClick={() => void prepare()}>
          审阅受控变更
        </button>
      ) : null}

      {phase === 'preparing' ? (
        <p className="metadata" role="status">
          正在由 main 读取目标并生成审阅请求…
        </p>
      ) : null}

      {denial !== null ? (
        <p role="alert" className="form-error">
          {`未准备成功（${denial}）：${DENIAL_COPY[denial]}`}
        </p>
      ) : null}

      {bridgeError !== null ? (
        <p role="alert" className="form-error">
          {bridgeError}
        </p>
      ) : null}

      {review !== null && target !== undefined ? (
        <>
          <section
            aria-label="变更预览"
            className="change-review__diff"
            data-target={target.path}
          >
            <header className="change-review__diff-header">
              <h4>{`变更预览 · ${session.project.name}/${target.path}`}</h4>
              <p className="metadata">
                {`${String(target.before.bytes)} B → ${String(target.after.bytes)} B · BEFORE ${shortHash(target.before.sha256)} · AFTER ${shortHash(target.after.sha256)}`}
              </p>
            </header>
            <ol className="change-review__lines" aria-label="变更行">
              {(diff?.lines ?? []).map((line, index) => (
                <li
                  key={`${line.kind}-${String(index)}`}
                  className={`change-review__line change-review__line--${line.kind}`}
                >
                  <span aria-hidden="true">
                    {line.kind === 'added' ? '+ ' : '  '}
                  </span>
                  {line.text === '' ? ' ' : line.text}
                </li>
              ))}
            </ol>
            {diff?.complete === false ? (
              <p className="metadata">
                无法显示逐行差异；上面是新内容的摘录，完整内容以预览请求携带的
                字节与哈希为准。
              </p>
            ) : null}
            <p className="metadata">
              {`项目相对路径：${target.path}；文件身份：${target.identity === null ? '平台未报告（只比内容）' : '已记录'}`}
            </p>
          </section>

          <PermissionCard
            disabled
            expiry="时效：仅此一次；执行一次后需重新审阅"
            note={cardNoteFor(phase)}
            onAction={undefined}
            operation={`对象：受控写入 · ${session.project.name}/${target.path}`}
            recipient="接收方：本机 main 进程；不外发"
            scope={`路径：${target.path}\n权限：工作区内修改；仅替换已有文本文件`}
            state={cardStateFor(phase)}
          />
          <p className="metadata">
            上面的卡片沿用 S2 设计里「读取」的文案，只作为权限摘要；真正调用写入
            通道的是下面的按钮。
          </p>

          {phase === 'reviewing' ? (
            <div className="change-review__actions">
              <button
                type="button"
                className="button button--primary"
                onClick={() => void approve()}
              >
                批准并写入
              </button>
              <button type="button" className="button" onClick={deny}>
                拒绝，不写入
              </button>
            </div>
          ) : null}

          {phase === 'executing' ? (
            <p className="metadata" role="status">
              正在写入并回读校验…
            </p>
          ) : null}

          {phase === 'denied' ? (
            <p role="status" className="change-review__status">
              已拒绝；没有写入任何文件。可以修改需求后重新审阅。
            </p>
          ) : null}

          {phase === 'applied' ? (
            <p
              role="status"
              className="change-review__status change-review__status--success"
            >
              已应用并回读校验：main 读到的字节与后像哈希一致。
            </p>
          ) : null}

          {phase === 'failed' ? (
            <p role="alert" className="form-error">
              本次没有显示为已应用；下面是 main 返回的逐目标结果。
            </p>
          ) : null}

          {result !== null ? (
            <section className="change-review__result" aria-label="执行结果">
              <h4>{`执行结果 · ${RESULT_COPY[result.status]}`}</h4>
              <p className="metadata">
                {`校验：${result.verification} · 恢复：${result.restore} · ${result.completedAt}`}
              </p>
              {result.code === null ? null : (
                <p className="metadata">{`结果码：${result.code}`}</p>
              )}
              {result.permissionCode === null ? null : (
                <p className="metadata">
                  {`权限拒绝码：${result.permissionCode}`}
                </p>
              )}
              <ul className="change-review__targets">
                {result.targets.map((outcome) => (
                  <li key={outcome.path}>
                    <span className="change-review__target-path">
                      {outcome.path}
                    </span>
                    <span
                      className={`change-review__target-status change-review__target-status--${outcome.status}`}
                    >
                      {RESULT_COPY[outcome.status]}
                    </span>
                    <span className="metadata">
                      {`${outcome.code ?? '无结果码'} · 回读 ${shortHash(outcome.observedSha256)}`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}

      {phase === 'denied' || phase === 'applied' || phase === 'failed' ? (
        <button type="button" onClick={reset}>
          重新审阅
        </button>
      ) : null}

      <p className="metadata">
        批准不等于已执行；只有 main 回读后像哈希一致时，这里才显示「已应用并回读
        校验」。拒绝不会产生写入请求，也不会被记成一次批准。
      </p>
    </div>
  );
}

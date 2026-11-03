import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import type { Session } from '../../shared/contracts/session-workspace';
import type {
  WriteApplyReport,
  WritePreview,
  WritePreviewState,
  WritePreviewSummary,
} from '../../shared/contracts/write-preview';
import type { WritePermissionMode } from '../../shared/contracts/write-permission';
import { runViews } from '../state/run-view-instance';
import { writePort } from '../state/write-port';
import {
  applySummaryText,
  previewStateText,
  targetStatusText,
  writeErrorText,
} from '../state/write-text';

/**
 * P4-A (#19) review panel for the 改动 dock module.
 *
 * It lists the previews main holds for this session, shows the complete Diff
 * of the selected one and lets the user reject or approve exactly the reviewed
 * `previewRevision`. Every action goes to main; the panel never writes a file,
 * never computes a Diff and never treats a model statement as state.
 */

const shortHash = (hash: string): string => `${hash.slice(0, 12)}…`;

function DiffText({
  target,
}: {
  target: WritePreview['targets'][number];
}): React.JSX.Element {
  return (
    <pre className="write-diff__text" aria-label={`${target.path} 的完整 Diff`}>
      {target.diff.split('\n').map((line, index) => {
        const className =
          line.startsWith('+') && !line.startsWith('+++')
            ? 'write-diff__line write-diff__line--add'
            : line.startsWith('-') && !line.startsWith('---')
              ? 'write-diff__line write-diff__line--remove'
              : line.startsWith('@@')
                ? 'write-diff__line write-diff__line--hunk'
                : 'write-diff__line';
        return (
          <span
            key={`${String(index)}:${line.slice(0, 16)}`}
            className={className}
          >
            {line}
            {'\n'}
          </span>
        );
      })}
    </pre>
  );
}

export function WriteReviewPanel({
  session,
}: {
  session: Session;
}): React.JSX.Element {
  const run = useSyncExternalStore(runViews.subscribe, () =>
    runViews.get(session.id),
  );
  const [previews, setPreviews] = useState<WritePreviewSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<WritePreview | null>(null);
  const [state, setState] = useState<WritePreviewState | null>(null);
  const [permissionMode, setPermissionMode] =
    useState<WritePermissionMode | null>(null);
  const [report, setReport] = useState<WriteApplyReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshPermission = useCallback(async (): Promise<void> => {
    const reply = await writePort.getPermission({
      sessionId: session.id,
      projectId: session.project.id,
    });
    if (reply.ok) setPermissionMode(reply.mode);
  }, [session.id, session.project.id]);

  /** Applies a fresh list and reselects the preview the user was reviewing. */
  const applyList = useCallback((list: WritePreviewSummary[]): void => {
    setPreviews(list);
    setSelectedId((previous) => {
      const keep = list.find((item) => item.proposalId === previous);
      const pending = list.find((item) => item.state === 'pending');
      const preferred =
        keep?.state === 'pending' ? keep : (pending ?? keep ?? list[0]);
      return preferred?.proposalId ?? null;
    });
  }, []);

  const reloadList = useCallback(async (): Promise<void> => {
    const reply = await writePort.listPreviews({
      sessionId: session.id,
      projectId: session.project.id,
    });
    if (!reply.ok) {
      setError(writeErrorText(reply.code));
      return;
    }
    applyList(reply.previews);
    await refreshPermission();
  }, [applyList, refreshPermission, session.id, session.project.id]);

  useEffect(() => {
    let current = true;
    // A proposal can arrive during the run; the terminal status opens the
    // review surface without stealing focus or changing the layout.
    void writePort
      .listPreviews({ sessionId: session.id, projectId: session.project.id })
      .then((reply) => {
        if (!current) return;
        if (!reply.ok) {
          setError(writeErrorText(reply.code));
          return;
        }
        applyList(reply.previews);
        return writePort
          .getPermission({
            sessionId: session.id,
            projectId: session.project.id,
          })
          .then((permission) => {
            if (current && permission.ok) setPermissionMode(permission.mode);
          });
      })
      .catch(() => {
        if (current) setError('无法读取修改预览');
      });
    return () => {
      current = false;
    };
  }, [applyList, run.runId, run.status, session.id, session.project.id]);

  useEffect(() => {
    if (selectedId === null) return;
    const summary = previews.find((item) => item.proposalId === selectedId);
    if (summary === undefined) return;
    let current = true;
    void writePort
      .getPreview({
        sessionId: session.id,
        projectId: session.project.id,
        proposalId: summary.proposalId,
        runId: summary.runId,
        revision: summary.revision,
      })
      .then((reply) => {
        if (!current) return;
        if (reply.ok) {
          setPreview(reply.preview);
          setState(reply.state);
        } else {
          setPreview(null);
          setState(null);
          setError(writeErrorText(reply.code));
        }
      })
      .catch(() => {
        if (current) setError('无法读取修改预览');
      });
    return () => {
      current = false;
    };
  }, [selectedId, previews, session.id, session.project.id]);

  const identity =
    preview === null
      ? null
      : {
          sessionId: session.id,
          projectId: session.project.id,
          proposalId: preview.proposalId,
          runId: preview.runId,
          revision: preview.revision,
          previewRevision: preview.previewRevision,
        };

  const apply = async (): Promise<void> => {
    if (identity === null) return;
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const reply = await writePort.applyPreview(identity);
      if (reply.ok) {
        setReport(reply.report);
        setState('applied');
      } else {
        setReport(reply.report);
        setError(writeErrorText(reply.code));
      }
    } catch {
      setError('写入请求失败');
    } finally {
      setBusy(false);
    }
    await reloadList();
  };

  const reject = async (): Promise<void> => {
    if (identity === null) return;
    setBusy(true);
    setError(null);
    try {
      const reply = await writePort.rejectPreview(identity);
      if (reply.ok) {
        setState('rejected');
      } else {
        setError(writeErrorText(reply.code));
      }
    } catch {
      setError('拒绝请求失败');
    } finally {
      setBusy(false);
    }
    await reloadList();
  };

  const refresh = async (): Promise<void> => {
    if (preview === null) return;
    setBusy(true);
    setError(null);
    try {
      const reply = await writePort.refreshPreview({
        sessionId: session.id,
        projectId: session.project.id,
        proposalId: preview.proposalId,
        runId: preview.runId,
        revision: preview.revision,
      });
      if (reply.ok) {
        setPreview(reply.preview);
        setState(reply.state);
      } else {
        setError(writeErrorText(reply.code));
      }
    } catch {
      setError('重新读取失败');
    } finally {
      setBusy(false);
    }
    await reloadList();
  };

  return (
    <div className="module-content write-review">
      <header className="write-review__header">
        <h3>改动审阅</h3>
        <p className="metadata">
          {run.runId === null
            ? '本会话尚未启动运行'
            : `当前运行 ${run.runId} · 修订 ${String(run.revision ?? '—')}`}
          {' · '}
          写入只替换已有普通文本文件；批准只作用于预览列出的目标。
        </p>
        <p className="metadata">
          当前写入权限：
          {permissionMode ?? '未选择（批准会被主进程拒绝）'}
        </p>
      </header>
      {error !== null ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : null}
      {previews.length === 0 ? (
        <div className="module-empty">
          <span className="empty-symbol" aria-hidden="true">
            ±
          </span>
          <h3>还没有可审阅的改动</h3>
          <p>
            运行提交文本替换提案后，主进程会在这里列出目标路径和完整
            Diff；没有提案时保持空态，不填入演示数据。
          </p>
          <span className="metadata">
            拒绝、批准或关闭窗口都不会在预览阶段改动文件。
          </span>
        </div>
      ) : (
        <>
          <ul className="write-preview-list" aria-label="待审阅修改">
            {previews.map((item) => (
              <li key={item.proposalId}>
                <button
                  type="button"
                  className="write-preview-list__item"
                  aria-pressed={item.proposalId === selectedId}
                  onClick={() => {
                    setSelectedId(item.proposalId);
                  }}
                >
                  <span className="write-preview-list__paths">
                    {item.paths.join('、')}
                  </span>
                  <span
                    className={`write-preview-list__state write-preview-list__state--${item.state}`}
                  >
                    {previewStateText(item.state)}
                  </span>
                  <span className="metadata">
                    运行 {item.runId} · 修订 {item.revision} · 预览{' '}
                    {item.previewRevision}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {preview === null && error === null ? (
            <p className="metadata" role="status">
              正在读取主进程的预览…
            </p>
          ) : null}
          {preview !== null ? (
            <section className="write-preview" aria-label="修改预览">
              <header className="write-preview__header">
                <p className="metadata">
                  运行 {preview.runId} · 修订 {preview.revision} · 预览{' '}
                  {preview.previewRevision} ·{' '}
                  {state === null ? '待审阅' : previewStateText(state)}
                </p>
              </header>
              {preview.targets.map((target) => (
                <article key={target.path} className="write-target">
                  <header className="write-target__header">
                    <strong className="path-text">{target.path}</strong>
                    <span className="metadata">
                      {target.before.bytes} B → {target.after.bytes} B · 写入前
                      SHA-256 {shortHash(target.before.sha256)} · 写入后{' '}
                      {shortHash(target.after.sha256)} ·{' '}
                      {target.identity === null
                        ? '文件身份未记录（只比较内容）'
                        : '已记录文件身份'}
                    </span>
                  </header>
                  <DiffText target={target} />
                </article>
              ))}
              {state === 'pending' ? (
                <div className="write-preview__actions">
                  <button
                    type="button"
                    className="button button--primary"
                    disabled={busy}
                    onClick={() => {
                      void apply();
                    }}
                  >
                    {busy ? '处理中…' : '批准写入'}
                  </button>
                  <button
                    type="button"
                    className="button"
                    disabled={busy}
                    onClick={() => {
                      void reject();
                    }}
                  >
                    拒绝修改
                  </button>
                  <button
                    type="button"
                    className="quiet-button"
                    disabled={busy}
                    onClick={() => {
                      void refresh();
                    }}
                  >
                    重新读取目标
                  </button>
                </div>
              ) : (
                <p className="metadata">
                  这份预览状态：
                  {state === null ? '待审阅' : previewStateText(state)}
                  ；不能再次批准。
                </p>
              )}
            </section>
          ) : null}
          {report !== null ? (
            <section className="write-report" aria-label="写入结果">
              <h4>{applySummaryText(report)}</h4>
              {report.partial ? (
                <p role="alert" className="form-error">
                  部分写入：已写入的目标保持实际结果，未自动回滚；未列出的目标没有被动过。
                </p>
              ) : null}
              <ul className="write-report__outcomes">
                {report.outcomes.map((outcome) => (
                  <li key={outcome.path}>
                    <span className="path-text">{outcome.path}</span>
                    <span>{targetStatusText(outcome.status)}</span>
                    {outcome.code === null ? null : <code>{outcome.code}</code>}
                  </li>
                ))}
              </ul>
              <p className="metadata">
                运行 {report.runId} · 修订 {report.revision} · 预览{' '}
                {report.previewRevision} · 应用时间 {report.appliedAt}
              </p>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

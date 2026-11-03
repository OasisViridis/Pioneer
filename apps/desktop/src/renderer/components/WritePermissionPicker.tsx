import { useEffect, useState } from 'react';

import type { WritePermissionMode } from '../../shared/contracts/write-permission';
import { writePort } from '../state/write-port';
import { writeErrorText } from '../state/write-text';

/**
 * Session-scoped write permission selector (#19). The choice is sent to main,
 * which stamps the window/project binding itself. Selecting a risky mode only
 * becomes a record after the explicit risk acknowledgement; lowering a mode
 * takes effect immediately.
 */

const MODES: {
  mode: WritePermissionMode;
  label: string;
  description: string;
  risky: boolean;
}[] = [
  {
    mode: 'read_only',
    label: '仅可查看',
    description: '任何写入请求都会被主进程拒绝。',
    risky: false,
  },
  {
    mode: 'workspace_write',
    label: '工作区内修改',
    description: '只替换项目内已有普通文本文件；.git 等保护路径拒绝。',
    risky: false,
  },
  {
    mode: 'full_access',
    label: '完全权限',
    description: '同上，且允许保护路径；仍不越过项目根，也不执行命令。',
    risky: true,
  },
  {
    mode: 'auto_review',
    label: '自动审查（EXP）',
    description:
      '通过写前检查后自动落盘，不再逐次确认；写前检查与写后回读仍会执行。',
    risky: true,
  },
];

export function WritePermissionPicker({
  sessionId,
  projectId,
  disabled,
}: {
  sessionId: string;
  projectId: string;
  disabled: boolean;
}): React.JSX.Element {
  const [mode, setMode] = useState<WritePermissionMode | null>(null);
  const [pendingMode, setPendingMode] = useState<WritePermissionMode | null>(
    null,
  );
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void writePort
      .getPermission({ sessionId, projectId })
      .then((reply) => {
        if (!current) return;
        if (reply.ok) {
          setMode(reply.mode);
          setRiskAcknowledged(reply.riskAcknowledged);
          setError(null);
        } else {
          setError(writeErrorText(reply.code));
        }
      })
      .catch(() => {
        if (current) setError('无法读取写入权限');
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [sessionId, projectId]);

  const save = async (
    next: WritePermissionMode,
    acknowledged: boolean,
  ): Promise<boolean> => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const reply = await writePort.setPermission({
        sessionId,
        projectId,
        mode: next,
        riskAcknowledged: acknowledged,
      });
      if (reply.ok) {
        setMode(reply.mode);
        setRiskAcknowledged(acknowledged);
        setPendingMode(null);
        setNotice('写入权限已保存到这个会话');
        return true;
      }
      setError(writeErrorText(reply.code));
      return false;
    } catch {
      setError('保存写入权限失败');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const choose = (next: WritePermissionMode): void => {
    const definition = MODES.find((item) => item.mode === next);
    if (definition === undefined) return;
    setError(null);
    setNotice(null);
    if (definition.risky) {
      // Every risky selection needs its own fresh acknowledgement; a previous
      // risky mode's check must not silently authorize this one.
      setRiskAcknowledged(false);
      setPendingMode(next);
      return;
    }
    // Reflect the choice immediately; the radio must stay checked while main
    // stores the record, and revert only if the request is refused.
    const previous = mode;
    setPendingMode(null);
    setMode(next);
    void save(next, false).then((accepted) => {
      if (!accepted) setMode(previous);
    });
  };

  const selected = pendingMode ?? mode;
  /** The mode main currently holds; a pending risky choice is not saved yet. */
  const saved = MODES.find((item) => item.mode === mode);
  const busy = disabled || saving || loading;

  return (
    <fieldset className="write-permission" disabled={busy}>
      <legend>写入权限</legend>
      <p className="metadata">
        会话级选择，作用于当前项目。批准只针对预览里列出的目标；切项目、关窗或重启后失效。
      </p>
      {loading ? <p className="metadata">正在读取写入权限…</p> : null}
      <ul className="write-permission__modes">
        {MODES.map((item) => (
          <li key={item.mode}>
            <label>
              <input
                type="radio"
                name={`write-permission-${sessionId}`}
                aria-label={item.label}
                checked={selected === item.mode}
                onChange={() => {
                  choose(item.mode);
                }}
              />
              <span className="write-permission__label">{item.label}</span>
              <span className="metadata">{item.description}</span>
            </label>
          </li>
        ))}
      </ul>
      {pendingMode !== null &&
      (pendingMode === 'full_access' || pendingMode === 'auto_review') ? (
        <label className="write-permission__risk">
          <input
            type="checkbox"
            checked={riskAcknowledged}
            onChange={(event) => {
              const checked = event.currentTarget.checked;
              setRiskAcknowledged(checked);
              if (checked) {
                void save(pendingMode, true);
              }
            }}
          />
          <span>
            我了解此模式的风险，并同意主进程按该模式检查与落盘（{pendingMode}
            ）。
          </span>
        </label>
      ) : null}
      <p className="metadata">
        当前：
        {saved === undefined
          ? '未选择（写入请求会被拒绝）'
          : `${saved.label} · 作用域：本次预览列出的全部目标`}
        {pendingMode !== null ? '（上方选择尚未保存）' : ''}
      </p>
      {error !== null ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : null}
      {notice !== null ? (
        <p role="status" className="metadata">
          {notice}
        </p>
      ) : null}
    </fieldset>
  );
}

import type {
  WriteApplyReport,
  WriteIpcErrorCode,
  WritePreviewState,
} from '../../shared/contracts/write-preview';
import type { WriteTargetStatus } from '../../shared/contracts/write-permission';

/**
 * User-facing copy for the P4-A review surface. Raw codes stay visible next to
 * the sentence so a refusal can never be mistaken for an empty result.
 */

const ERROR_TEXT: Record<string, string> = {
  INVALID_REQUEST: '请求无效',
  UNTRUSTED_SENDER: '来源不受信任',
  BINDING_MISMATCH: '窗口绑定不一致，请重试',
  PROJECT_UNAVAILABLE: '项目不可用或位置已变化',
  PROPOSAL_NOT_FOUND: '找不到这份修改预览',
  PREVIEW_EXPIRED: '批准已过期或目标已变化，请重新读取并审阅',
  PREVIEW_ALREADY_RESOLVED: '这份修改已经处理过，请重新运行生成新预览',
  WRITE_JOURNAL_UNAVAILABLE: '变更日志不可用，主进程拒绝写入',
  WRITE_UNAVAILABLE: '写入能力当前不可用',
  PERMISSION_REQUIRED: '请先在上方选择写入权限',
  PERMISSION_READ_ONLY: '当前权限为仅可查看，主进程拒绝了写入',
  PERMISSION_OUT_OF_SCOPE: '目标不在权限作用域内',
  PERMISSION_PROTECTED_PATH: '目标是保护路径，当前权限不允许写入',
  TARGET_CHANGED: '目标文件在预览后已被修改，请重新读取并审阅',
  TARGET_MISSING: '目标文件已不存在',
  TARGET_REPLACED: '目标文件被删除后重建，旧预览已失效',
  TARGET_IDENTITY_UNAVAILABLE: '无法确认目标文件身份',
  TARGET_NOT_REGULAR_FILE: '目标不是普通文件',
  TARGET_LINK_NOT_ALLOWED: '链接文件不允许写入',
  TARGET_TOO_LARGE: '目标超出字节预算',
  TARGET_UNREADABLE: '目标不可读取',
  TARGET_UNSTABLE: '读取期间目标发生变化',
  WRITE_FAILED: '写入失败，目标保持原样或状态未知',
  VERIFY_FAILED: '写入后回读不一致，不能视为成功',
  CANCELLED: '已取消',
  RECOVERY_CONFLICT: '恢复遇到冲突，保留现场',
  PERMISSION_DENIED: '权限拒绝了这次写入',
  UNKNOWN: '真实状态未知',
};

export const writeErrorText = (code: string): string =>
  ERROR_TEXT[code] ?? `写入请求被拒绝（${code}）`;

const STATE_TEXT: Record<WritePreviewState, string> = {
  pending: '待审阅',
  applied: '已应用',
  rejected: '已拒绝',
  expired: '已过期',
  failed: '已失败',
};

export const previewStateText = (state: WritePreviewState): string =>
  STATE_TEXT[state];

const STATUS_TEXT: Record<WriteTargetStatus, string> = {
  applied: '已写入',
  verification_failed: '写入未验证',
  restored: '已恢复',
  unchanged: '未改动',
  rejected: '已拒绝',
  failed: '失败',
  unknown: '结果未知',
};

export const targetStatusText = (status: WriteTargetStatus): string =>
  STATUS_TEXT[status];

/** One-line summary of an apply report; no report means nothing was written. */
export const applySummaryText = (report: WriteApplyReport): string => {
  if (report.failure === null && !report.partial) {
    return `已写入 ${String(report.applied.length)} 个目标`;
  }
  const failedPath = report.failure?.path ?? '未知目标';
  const failure = report.failure
    ? writeErrorText(report.failure.code)
    : '存在未完成的目标';
  return `${failure}（${failedPath}）；已写入 ${String(report.applied.length)} 个目标`;
};

export type { WriteIpcErrorCode };

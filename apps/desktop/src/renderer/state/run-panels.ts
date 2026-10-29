import type { RunEvent } from '../../shared/contracts/pioneer-run';
import type {
  RunContextCall,
  RunContextMaterial,
  RunMaterialReason,
  RunMaterialState,
  RunSnapshot,
  RunToolCallState,
} from '../../shared/contracts/run-context';
import type { RunAuthorizationSummary } from '../../shared/contracts/run-ipc';
import type { ReadOnlyToolName } from '../../shared/contracts/read-only-tools';
import type { RunViewState } from './run-view';

/**
 * Pure projections for the P3-A workbench panels. The panel components render
 * these results; contract tests exercise them without React or Electron.
 */

export interface CapabilityCallView {
  callId: string;
  tool: ReadOnlyToolName | null;
  state: RunToolCallState;
  code: string | null;
  seq: number;
  at: string;
}

/** Joins tool.requested / tool.result by main's callId, in seq order. */
export function capabilityCalls(events: RunEvent[]): CapabilityCallView[] {
  const calls = new Map<string, CapabilityCallView>();
  for (const event of events) {
    const body = event.body;
    if (body.type === 'tool.requested') {
      calls.set(body.callId, {
        callId: body.callId,
        tool: body.tool,
        state: 'requested',
        code: null,
        seq: event.seq,
        at: event.at,
      });
      continue;
    }
    if (body.type !== 'tool.result') continue;
    const existing = calls.get(body.callId);
    const code = body.result.status === 'succeeded' ? null : body.result.code;
    if (existing === undefined) {
      calls.set(body.callId, {
        callId: body.callId,
        tool: null,
        state: body.result.status,
        code,
        seq: event.seq,
        at: event.at,
      });
      continue;
    }
    existing.state = body.result.status;
    existing.code = code;
  }
  return [...calls.values()].sort((left, right) => left.seq - right.seq);
}

/**
 * Snapshot projection: the same call log without a target (targets live only
 * in main's context query and never enter the event wire).
 */
export function eventContextCalls(events: RunEvent[]): RunContextCall[] {
  return capabilityCalls(events).map((call) => ({
    callId: call.callId,
    tool: call.tool,
    target: null,
    state: call.state,
    code: call.code,
    at: call.at,
  }));
}

/**
 * Materials the panels may show. Main's context projection is authoritative
 * once it arrives; before that the authorization summary proves the approved
 * list, but nothing is presented as read.
 */
export function visibleMaterials(state: RunViewState): RunContextMaterial[] {
  if (state.context !== null) return state.context.materials;
  return approvedMaterials(state.authorization);
}

export function approvedMaterials(
  authorization: RunAuthorizationSummary | null,
): RunContextMaterial[] {
  if (authorization === null) return [];
  return authorization.materials.map((material) => ({
    path: material.path,
    bytes: material.bytes,
    sha256: material.sha256,
    state: 'approved' as const,
    reason: null,
    readAt: null,
  }));
}

const MATERIAL_STATE_TEXT: Record<RunMaterialState, string> = {
  approved: '已批准 · 未读取',
  read: '已读取',
  scanned: '已扫描',
  changed: '内容已变化',
  missing: '不可用',
};

export const materialStateText = (state: RunMaterialState): string =>
  MATERIAL_STATE_TEXT[state];

const MATERIAL_REASON_TEXT: Record<RunMaterialReason, string> = {
  CONTENT_NOT_ALLOWED: '读取前内容与批准时不一致，旧授权已失效',
  MATERIAL_NOT_ALLOWED: '请求的文件不在本次批准清单内，已拒绝',
  PATH_UNAVAILABLE: '路径不存在或不可读',
  PATH_TYPE_NOT_ALLOWED: '不是可读取的文本文件',
  LINK_NOT_ALLOWED: '链接文件不允许读取',
  SENSITIVE_PATH: '敏感路径已拒绝',
  PATH_OUTSIDE_PROJECT: '路径超出项目范围',
  INVALID_PATH: '路径无效',
  TRUNCATED: '超出单文件读取预算',
  READ_FAILED: '工具读取失败，内容不可用',
};

export const materialReasonText = (
  reason: RunMaterialReason | null,
): string | null => (reason === null ? null : MATERIAL_REASON_TEXT[reason]);

const CALL_STATE_TEXT: Record<RunToolCallState, string> = {
  requested: '请求中',
  succeeded: '已完成',
  rejected: '已拒绝',
  failed: '失败',
  cancelled: '已取消',
};

export const callStateText = (state: RunToolCallState): string =>
  CALL_STATE_TEXT[state];

/** Human copy for the fixed tool result codes; the raw code stays visible. */
const CALL_CODE_TEXT: Record<string, string> = {
  TOOL_NOT_ALLOWED: '工具不在允许清单内',
  INVALID_TOOL_REQUEST: '工具请求格式无效',
  INVALID_PATH: '路径无效',
  PROJECT_UNAVAILABLE: '项目不可用',
  PATH_UNAVAILABLE: '路径不存在或不可读',
  PATH_OUTSIDE_PROJECT: '路径超出项目范围',
  LINK_NOT_ALLOWED: '链接文件不允许读取',
  PATH_TYPE_NOT_ALLOWED: '不是可读取的文本文件',
  SENSITIVE_PATH: '敏感路径已拒绝',
  MATERIAL_NOT_ALLOWED: '材料不在本次批准清单内',
  CONTENT_NOT_ALLOWED: '内容与批准时不一致，旧授权已失效',
  BUDGET_EXCEEDED: '超出本次调用的预算',
  TOOL_FAILED: '工具执行失败',
  CANCELLED: '调用已取消',
};

export const callCodeText = (code: string): string =>
  CALL_CODE_TEXT[code] ?? code;

export const TOOL_LABELS: Record<ReadOnlyToolName, string> = {
  read_file: '读取文件',
  list_directory: '列目录',
  search_in_files: '搜索文本',
};

export const toolLabel = (tool: ReadOnlyToolName | null): string =>
  tool === null ? '未知工具' : TOOL_LABELS[tool];

/** `2026-10-27T10:00:00.000Z` -> `10:00:00`. */
export const formatUtcTime = (iso: string): string =>
  iso.replace('T', ' ').slice(11, 19);

/**
 * True when the session started a newer run than the one the persisted summary
 * describes. The summary then belongs to an earlier run, and the panel must say
 * so instead of presenting it as the latest result (Issue #17, restart).
 */
export function snapshotOutOfDate(session: {
  runRevision: number;
  lastRunView: RunSnapshot | null;
}): boolean {
  const snapshot = session.lastRunView;
  if (snapshot === null) return false;
  return session.runRevision > snapshot.identity.revision;
}

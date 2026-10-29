import { describe, expect, it } from 'vitest';

import type { RunEvent } from '../../apps/desktop/src/shared/contracts/pioneer-run';
import type { RunSnapshot } from '../../apps/desktop/src/shared/contracts/run-context';
import {
  callCodeText,
  callStateText,
  capabilityCalls,
  eventContextCalls,
  formatUtcTime,
  materialReasonText,
  materialStateText,
  snapshotOutOfDate,
  toolLabel,
  visibleMaterials,
} from '../../apps/desktop/src/renderer/state/run-panels';
import type { RunViewState } from '../../apps/desktop/src/renderer/state/run-view';

const identity = {
  sessionId: 'session:alpha',
  projectId: 'project:alpha',
  runId: 'run:alpha',
  revision: 1,
} as const;

function event(
  seq: number,
  body: RunEvent['body'],
  source: RunEvent['source'],
): RunEvent {
  return {
    ...identity,
    version: 1,
    seq,
    at: `2026-10-27T10:00:0${String(seq)}.000Z`,
    source,
    adapter: 'controlled',
    body,
  };
}

const requested = event(
  2,
  { type: 'tool.requested', callId: 'call:1', tool: 'read_file' },
  'tool',
);
const succeeded = event(
  3,
  {
    type: 'tool.result',
    callId: 'call:1',
    result: { status: 'succeeded', text: 'body', truncated: false },
  },
  'tool',
);
const rejected = event(
  4,
  {
    type: 'tool.result',
    callId: 'call:2',
    result: { status: 'rejected', code: 'MATERIAL_NOT_ALLOWED' },
  },
  'tool',
);
const cancelled = event(
  6,
  {
    type: 'tool.result',
    callId: 'call:3',
    result: { status: 'cancelled', code: 'CANCELLED' },
  },
  'tool',
);
const failed = event(
  8,
  {
    type: 'tool.result',
    callId: 'call:4',
    result: { status: 'failed', code: 'TOOL_FAILED' },
  },
  'tool',
);

const EMPTY_STATE: RunViewState = {
  phase: 'idle',
  runId: null,
  projectId: null,
  revision: null,
  status: null,
  failureCode: null,
  rejectionCode: null,
  summaryText: null,
  authorization: null,
  context: null,
  contextState: 'idle',
  contextError: false,
  events: [],
  omittedHistory: false,
  ignoredEvents: 0,
};

const snapshot: RunSnapshot = {
  identity,
  status: 'completed',
  tools: ['read_file'],
  materials: [
    {
      path: 'README.md',
      bytes: 10,
      sha256: 'b'.repeat(64),
      state: 'read',
      reason: null,
      readAt: '2026-10-27T10:00:02.000Z',
    },
  ],
  calls: [],
  recordedAt: '2026-10-27T10:00:03.000Z',
};

describe('run panel projections (#17)', () => {
  it('joins tool requests and results by callId and keeps refusal distinct', () => {
    const calls = capabilityCalls([
      requested,
      succeeded,
      rejected,
      cancelled,
      failed,
    ]);
    expect(calls).toEqual([
      {
        callId: 'call:1',
        tool: 'read_file',
        state: 'succeeded',
        code: null,
        seq: 2,
        at: '2026-10-27T10:00:02.000Z',
      },
      {
        callId: 'call:2',
        tool: null,
        state: 'rejected',
        code: 'MATERIAL_NOT_ALLOWED',
        seq: 4,
        at: '2026-10-27T10:00:04.000Z',
      },
      {
        callId: 'call:3',
        tool: null,
        state: 'cancelled',
        code: 'CANCELLED',
        seq: 6,
        at: '2026-10-27T10:00:06.000Z',
      },
      {
        callId: 'call:4',
        tool: null,
        state: 'failed',
        code: 'TOOL_FAILED',
        seq: 8,
        at: '2026-10-27T10:00:08.000Z',
      },
    ]);
  });

  it('shows a requested call without a result as still requested', () => {
    const calls = capabilityCalls([requested]);
    expect(calls[0]?.state).toBe('requested');
    expect(calls[0]?.code).toBeNull();
  });

  it('prefers main context over the approved-list fallback', () => {
    const authorized: RunViewState = {
      ...EMPTY_STATE,
      authorization: {
        grantId: 'grant:alpha',
        taskDigest: 'digest',
        projectName: 'Alpha',
        tools: ['read_file'],
        adapter: 'controlled',
        model: null,
        expiresAt: '2026-10-27T10:05:00.000Z',
        materials: [
          { path: 'README.md', bytes: 10, sha256: 'b'.repeat(64) },
          { path: 'package.json', bytes: 20, sha256: 'c'.repeat(64) },
        ],
      },
    };
    const fallback = visibleMaterials(authorized);
    expect(fallback.map((item) => item.state)).toEqual([
      'approved',
      'approved',
    ]);
    expect(fallback.map((item) => item.path)).toEqual([
      'README.md',
      'package.json',
    ]);

    const withContext: RunViewState = {
      ...authorized,
      context: {
        identity,
        status: 'completed',
        materials: snapshot.materials,
        calls: [],
      },
    };
    expect(visibleMaterials(withContext)).toEqual(snapshot.materials);
  });

  it('keeps fixed user-facing copy for states, reasons and tools', () => {
    expect(materialStateText('approved')).toBe('已批准 · 未读取');
    expect(materialStateText('scanned')).toBe('已扫描');
    expect(materialReasonText('CONTENT_NOT_ALLOWED')).toContain('不一致');
    expect(materialReasonText(null)).toBeNull();
    expect(callStateText('rejected')).toBe('已拒绝');
    expect(callStateText('failed')).toBe('失败');
    expect(callStateText('cancelled')).toBe('已取消');
    expect(materialReasonText('READ_FAILED')).toContain('失败');
    expect(toolLabel(null)).toBe('未知工具');
    expect(toolLabel('search_in_files')).toBe('搜索文本');
  });

  it('flags a persisted summary that is older than the session run revision', () => {
    expect(snapshotOutOfDate({ runRevision: 1, lastRunView: snapshot })).toBe(
      false,
    );
    expect(snapshotOutOfDate({ runRevision: 2, lastRunView: snapshot })).toBe(
      true,
    );
    expect(snapshotOutOfDate({ runRevision: 5, lastRunView: null })).toBe(
      false,
    );
  });

  it('projects event calls without targets and formats shared copy', () => {
    const calls = eventContextCalls([requested, succeeded]);
    expect(calls).toEqual([
      {
        callId: 'call:1',
        tool: 'read_file',
        target: null,
        state: 'succeeded',
        code: null,
        at: '2026-10-27T10:00:02.000Z',
      },
    ]);
    expect(callCodeText('MATERIAL_NOT_ALLOWED')).toContain('批准清单');
    expect(callCodeText('UNKNOWN_CODE')).toBe('UNKNOWN_CODE');
    expect(formatUtcTime('2026-10-27T10:00:02.000Z')).toBe('10:00:02');
  });
});

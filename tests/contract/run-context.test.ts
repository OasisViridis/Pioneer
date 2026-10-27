import { describe, expect, it } from 'vitest';

import {
  RunContextReplySchema,
  RunContextSchema,
  RunSnapshotSchema,
} from '../../apps/desktop/src/shared/contracts/run-context';

const identity = {
  sessionId: 'session:alpha',
  projectId: 'project:alpha',
  runId: 'run:alpha',
  revision: 2,
} as const;

const material = {
  path: 'README.md',
  bytes: 128,
  sha256: 'a'.repeat(64),
  state: 'read' as const,
  reason: null,
  readAt: '2026-10-27T10:00:00.000Z',
};

const call = {
  callId: 'call:1',
  tool: 'read_file' as const,
  target: 'README.md',
  state: 'succeeded' as const,
  code: null,
  at: '2026-10-27T10:00:00.000Z',
};

describe('run context contract (#17)', () => {
  it('accepts a bounded main projection with provenance and call states', () => {
    const parsed = RunContextSchema.parse({
      identity,
      status: 'completed',
      materials: [material],
      calls: [call],
    });
    expect(parsed.materials[0]?.state).toBe('read');
    expect(parsed.calls[0]?.target).toBe('README.md');
  });

  it('rejects unknown fields, unknown states and over-long lists', () => {
    expect(() =>
      RunContextSchema.parse({
        identity,
        status: 'completed',
        materials: [material],
        calls: [],
        extra: true,
      }),
    ).toThrow();
    expect(() =>
      RunContextSchema.parse({
        identity,
        status: 'completed',
        materials: [{ ...material, state: 'opened' }],
        calls: [],
      }),
    ).toThrow();
    expect(() =>
      RunContextSchema.parse({
        identity,
        status: 'completed',
        materials: [],
        calls: Array.from({ length: 33 }, (_, index) => ({
          ...call,
          callId: `call:${String(index + 1)}`,
        })),
      }),
    ).toThrow();
  });

  it('only answers RUN_NOT_FOUND when a run is gone', () => {
    expect(
      RunContextReplySchema.parse({ ok: false, code: 'RUN_NOT_FOUND' }),
    ).toEqual({ ok: false, code: 'RUN_NOT_FOUND' });
    expect(() =>
      RunContextReplySchema.parse({ ok: false, code: 'GONE' }),
    ).toThrow();
  });

  it('persists only a converged run summary, never a live status', () => {
    const snapshot = {
      identity,
      status: 'completed' as const,
      tools: ['read_file'],
      materials: [material],
      calls: [call],
      recordedAt: '2026-10-27T10:00:01.000Z',
    };
    expect(RunSnapshotSchema.parse(snapshot).status).toBe('completed');
    expect(() =>
      RunSnapshotSchema.parse({ ...snapshot, status: 'running' }),
    ).toThrow();
    expect(() =>
      RunSnapshotSchema.parse({
        ...snapshot,
        materials: Array.from({ length: 65 }, (_, index) => ({
          ...material,
          path: `file-${String(index)}.txt`,
        })),
      }),
    ).toThrow();
    expect(() =>
      RunSnapshotSchema.parse({ ...snapshot, unknown: 1 }),
    ).toThrow();
    expect(() =>
      RunContextSchema.parse({
        identity,
        status: 'completed',
        materials: Array.from({ length: 65 }, (_, index) => ({
          ...material,
          path: `file-${String(index)}.txt`,
        })),
        calls: [],
      }),
    ).toThrow();
  });
});

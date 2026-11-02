import { describe, expect, it } from 'vitest';

import { RunJournalRecordSchema } from '../../apps/desktop/src/main/harness/run-journal';
import {
  RunEventSchema,
  RunFailureCodeSchema,
  RunStatusSchema,
} from '../../apps/desktop/src/shared/contracts/pioneer-run';
import {
  DATASET_RUN_STATUSES,
  PRODUCT_RUN_STATUSES,
  RUN_FAILURE_CODES,
  TERMINAL_RUN_STATUSES,
  deriveUsage,
  validateJournalRecord,
  validateRunEvent,
} from '../../tools/experiments/lib/record.mjs';

function toolAcceptsJournal(value: unknown): boolean {
  try {
    validateJournalRecord(value);
    return true;
  } catch {
    return false;
  }
}

function zodAcceptsJournal(value: unknown): boolean {
  return RunJournalRecordSchema.safeParse(value).success;
}

const accept = {
  kind: 'accept',
  runId: 'run:1',
  sessionId: 'session:s',
  projectId: 'project:p',
  revision: 1,
  taskDigest: 'sha256:digest',
  adapter: 'pi',
  windowEpoch: 0,
  rootRevision: 0,
  requestId: 'request:1',
  at: '2026-11-03T00:00:00.000Z',
} as const;

const terminal = {
  kind: 'terminal',
  runId: 'run:1',
  status: 'failed',
  code: 'RUN_DEADLINE',
  at: '2026-11-03T00:02:00.000Z',
  lastSeq: 7,
} as const;

const tombstone = {
  kind: 'tombstone',
  runId: 'run:1',
  reason: 'host_restarted',
  at: '2026-11-03T00:03:00.000Z',
} as const;

const journalCases: { name: string; value: unknown }[] = [
  { name: 'accept', value: { ...accept } },
  { name: 'terminal without stopRequestedAt', value: { ...terminal } },
  {
    name: 'terminal with null stopRequestedAt',
    value: { ...terminal, stopRequestedAt: null },
  },
  {
    name: 'terminal with stopRequestedAt',
    value: {
      ...terminal,
      status: 'stopped',
      code: null,
      stopRequestedAt: '2026-11-03T00:01:55.000Z',
    },
  },
  { name: 'tombstone', value: { ...tombstone } },
  {
    name: 'accept with unknown field',
    value: { ...accept, extra: true },
  },
  {
    name: 'accept without requestId',
    value: (() => {
      const copy: Record<string, unknown> = { ...accept };
      delete copy.requestId;
      return copy;
    })(),
  },
  { name: 'accept with revision 0', value: { ...accept, revision: 0 } },
  {
    name: 'accept with fractional revision',
    value: { ...accept, revision: 1.5 },
  },
  {
    name: 'accept with offset timestamp (zod requires Z)',
    value: { ...accept, at: '2026-11-03T00:00:00+08:00' },
  },
  {
    name: 'accept with a timestamp without seconds',
    value: { ...accept, at: '2026-11-03T00:00Z' },
  },
  {
    name: 'accept with unknown adapter',
    value: { ...accept, adapter: 'nope' },
  },
  {
    name: 'terminal with running status',
    value: { ...terminal, status: 'running' },
  },
  { name: 'terminal with numeric code', value: { ...terminal, code: 7 } },
  {
    name: 'terminal with negative lastSeq',
    value: { ...terminal, lastSeq: -1 },
  },
  {
    name: 'tombstone with unknown reason',
    value: { ...tombstone, reason: 'crash' },
  },
  { name: 'tombstone with unknown field', value: { ...tombstone, extra: 1 } },
];

describe('experiment journal validation matches RunJournalRecordSchema', () => {
  it('accepts and rejects exactly the same journal records', () => {
    for (const testCase of journalCases) {
      expect(zodAcceptsJournal(testCase.value), testCase.name).toBe(
        toolAcceptsJournal(testCase.value),
      );
    }
  });

  it('accepts every record zod accepts among the valid cases', () => {
    for (const testCase of journalCases) {
      if (!zodAcceptsJournal(testCase.value)) continue;
      expect(toolAcceptsJournal(testCase.value), testCase.name).toBe(true);
    }
  });

  it('keeps the failure code enum identical', () => {
    expect([...RUN_FAILURE_CODES]).toEqual([...RunFailureCodeSchema.options]);
  });
});

describe('experiment run event usage derivation matches the contract', () => {
  const baseEvent = {
    sessionId: 'session:s',
    projectId: 'project:p',
    runId: 'run:1',
    revision: 1,
    version: 1,
    seq: 2,
    at: '2026-11-03T00:00:01.000Z',
    source: 'host',
    adapter: 'pi',
  } as const;

  it('marks a null usage event as missing without filling zero', () => {
    const event: Record<string, unknown> = {
      ...baseEvent,
      body: { type: 'run.completed', usage: null },
    };
    expect(RunEventSchema.safeParse(event).success).toBe(true);
    validateRunEvent(event);
    expect(deriveUsage([event])).toEqual({
      inputTokens: null,
      outputTokens: null,
      source: 'missing',
      estimated: null,
    });
  });

  it('marks reported numbers as reported', () => {
    const event: Record<string, unknown> = {
      ...baseEvent,
      body: {
        type: 'run.completed',
        usage: { inputTokens: 100, outputTokens: 20 },
      },
    };
    expect(RunEventSchema.safeParse(event).success).toBe(true);
    validateRunEvent(event);
    expect(deriveUsage([event])).toEqual({
      inputTokens: 100,
      outputTokens: 20,
      source: 'reported',
      estimated: null,
    });
  });

  it('falls back to missing when only one token is reported', () => {
    const event: Record<string, unknown> = {
      ...baseEvent,
      body: {
        type: 'run.completed',
        usage: { inputTokens: 100, outputTokens: null },
      },
    };
    expect(RunEventSchema.safeParse(event).success).toBe(true);
    validateRunEvent(event);
    expect(deriveUsage([event])).toEqual({
      inputTokens: null,
      outputTokens: null,
      source: 'missing',
      estimated: null,
    });
  });
});

describe('experiment status vocabulary stays aligned with the product contract', () => {
  it('keeps the product status mirror identical to RunStatusSchema', () => {
    expect([...PRODUCT_RUN_STATUSES]).toEqual([...RunStatusSchema.options]);
  });

  it('limits terminal statuses to the journal terminal enum', () => {
    expect([...TERMINAL_RUN_STATUSES]).toEqual([
      'completed',
      'failed',
      'stopped',
    ]);
    for (const status of TERMINAL_RUN_STATUSES) {
      expect(RunStatusSchema.options).toContain(status);
    }
  });

  it('keeps not_run as an experiment-layer status only', () => {
    // not_run is produced by capture.json when an attempt was never executed.
    // It is not a product RunStatus: the product never emits it, and the
    // experiment dataset adds it to keep the planned denominator honest.
    expect(RunStatusSchema.options).not.toContain('not_run');
    expect(DATASET_RUN_STATUSES).toContain('not_run');
    for (const status of DATASET_RUN_STATUSES) {
      if (status === 'not_run') continue;
      expect(RunStatusSchema.options).toContain(status);
    }
    for (const status of ['starting', 'running', 'stopping']) {
      expect(DATASET_RUN_STATUSES).not.toContain(status);
    }
  });
});

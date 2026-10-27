import { z } from 'zod';

/**
 * Bounded per-session run history (Issue #13 item 1): the task text and the
 * terminal result summary are stored with the session, not only in main's
 * digest-only run journal. The answer body is capped so a long stream cannot
 * grow the session record without bound (run contract §5).
 */

export const MAX_SESSION_RUN_HISTORY = 20;
export const MAX_SESSION_RUN_TASK = 8_000;
export const MAX_SESSION_RUN_RESULT = 16_384;

export const SessionRunStatusSchema = z.enum([
  'completed',
  'failed',
  'stopped',
]);

export const SessionRunRecordSchema = z
  .object({
    runId: z.string().min(1).max(512),
    task: z.string().min(1).max(MAX_SESSION_RUN_TASK),
    status: SessionRunStatusSchema,
    failureCode: z.string().min(1).max(64).nullable(),
    startedAt: z.iso.datetime(),
    endedAt: z.iso.datetime(),
    stopRequestedAt: z.iso.datetime().nullable(),
    resultText: z.string().max(MAX_SESSION_RUN_RESULT),
    truncated: z.boolean(),
  })
  .strict();

export type SessionRunStatus = z.infer<typeof SessionRunStatusSchema>;
export type SessionRunRecord = z.infer<typeof SessionRunRecordSchema>;

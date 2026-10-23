import { z } from 'zod';

import { RuntimeSessionSchema } from './runtime-session';

const MAX_EVENT_ID_LENGTH = 768;
const MAX_SESSION_ID_LENGTH = 512;
const MAX_EVENT_SEQUENCE = 1_000_000;

const nonBlankString = (maxLength: number) =>
  z
    .string()
    .max(maxLength)
    .superRefine((value, context) => {
      if (value.trim().length === 0) {
        context.addIssue({
          code: 'custom',
          message: 'Value must not be blank.',
        });
      }
    });

export const runtimeEventId = (sessionId: string, sequence: number): string =>
  `${sessionId}:event:${String(sequence)}`;

const RuntimeEventBaseSchema = z
  .object({
    id: nonBlankString(MAX_EVENT_ID_LENGTH),
    sessionId: nonBlankString(MAX_SESSION_ID_LENGTH),
    sequence: z.number().int().positive().max(MAX_EVENT_SEQUENCE),
  })
  .strict();

export const SessionInitializedEventSchema = RuntimeEventBaseSchema.extend({
  type: z.literal('session.initialized'),
  approvedIntentRevision: z.number().int().positive(),
}).strict();

export const RuntimeStartRequestedEventSchema = RuntimeEventBaseSchema.extend({
  type: z.literal('runtime.start_requested'),
}).strict();

export const RuntimeEventSchema = z.discriminatedUnion('type', [
  SessionInitializedEventSchema,
  RuntimeStartRequestedEventSchema,
]);

export const RuntimeLifecycleStatusSchema = z.enum([
  'initialized',
  'start_requested',
]);

export const RuntimeLifecycleSchema = z
  .object({
    session: RuntimeSessionSchema,
    status: RuntimeLifecycleStatusSchema,
    events: z.array(RuntimeEventSchema).min(1).max(2),
  })
  .strict()
  .superRefine((lifecycle, context) => {
    const { events, session } = lifecycle;

    events.forEach((event, index) => {
      const expectedSequence = index + 1;
      if (event.sequence !== expectedSequence) {
        context.addIssue({
          code: 'custom',
          path: ['events', index, 'sequence'],
          message: 'Runtime events must use contiguous sequence numbers.',
        });
      }

      if (event.sessionId !== session.id) {
        context.addIssue({
          code: 'custom',
          path: ['events', index, 'sessionId'],
          message: 'Runtime events must belong to the lifecycle session.',
        });
      }

      if (event.id !== runtimeEventId(session.id, expectedSequence)) {
        context.addIssue({
          code: 'custom',
          path: ['events', index, 'id'],
          message: 'Runtime event id must match its session and sequence.',
        });
      }
    });

    const first = events[0];
    if (
      first?.type !== 'session.initialized' ||
      first.approvedIntentRevision !== session.approvedIntent.revision
    ) {
      context.addIssue({
        code: 'custom',
        path: ['events', 0],
        message:
          'Runtime event stream must begin with the approved session initialization.',
      });
    }

    if (
      lifecycle.status === 'initialized' &&
      (events.length !== 1 || events[0]?.type !== 'session.initialized')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['status'],
        message:
          'Initialized lifecycle must contain only the initialization event.',
      });
    }

    if (
      lifecycle.status === 'start_requested' &&
      (events.length !== 2 || events[1]?.type !== 'runtime.start_requested')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['status'],
        message:
          'Start-requested lifecycle must end with a start-requested event.',
      });
    }
  });

export const RUNTIME_LIFECYCLE_ERROR_CODES = [
  'INVALID_SESSION',
  'INVALID_LIFECYCLE',
  'INVALID_LIFECYCLE_TRANSITION',
] as const;

export const RuntimeLifecycleErrorCodeSchema = z.enum(
  RUNTIME_LIFECYCLE_ERROR_CODES,
);

export type RuntimeEvent = z.infer<typeof RuntimeEventSchema>;
export type RuntimeLifecycleStatus = z.infer<
  typeof RuntimeLifecycleStatusSchema
>;
export type RuntimeLifecycle = z.infer<typeof RuntimeLifecycleSchema>;
export type RuntimeLifecycleErrorCode = z.infer<
  typeof RuntimeLifecycleErrorCodeSchema
>;

export type RuntimeLifecycleResult =
  | { ok: true; value: RuntimeLifecycle }
  | { ok: false; error: RuntimeLifecycleErrorCode };

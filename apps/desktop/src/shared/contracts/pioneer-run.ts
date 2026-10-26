import { z } from 'zod';

import {
  ReadOnlyToolNameSchema,
  ReadOnlyToolRejectionSchema,
} from './read-only-tools';

/** Protocol v1 limits. Enforcement by the main host is required in #13. */
export const RUN_LIMITS = Object.freeze({
  activePerSession: 1,
  activePerWindow: 2,
  activePerHost: 4,
  toolConcurrency: 1,
  toolCalls: 32,
  runMs: 120_000,
  stopGraceMs: 5_000,
  grantMs: 300_000,
  eventBytes: 16_384,
  textChunkBytes: 4_096,
  outputBytes: 262_144,
  retainedEvents: 512,
  retainedBytes: 1_048_576,
  subscriberBatch: 32,
  subscriberAckMs: 2_000,
  terminalRetentionMs: 600_000,
  terminalRuns: 32,
  inputBytes: 65_536,
  modelOutputTokens: 4_096,
});

const id = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[a-zA-Z0-9:_-]+$/);
const revision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const seq = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const textBytes = (max: number) =>
  z
    .string()
    .refine(
      (value) => new TextEncoder().encode(value).byteLength <= max,
      'Text exceeds the protocol byte budget.',
    );

export const RunIdentitySchema = z
  .object({
    sessionId: id,
    projectId: id,
    runId: id,
    revision,
  })
  .strict();

export const RunStatusSchema = z.enum([
  'starting',
  'running',
  'stopping',
  'unknown',
  'completed',
  'failed',
  'stopped',
]);

export const RunStartRequestSchema = z
  .object({
    sessionId: id,
    projectId: id,
    expectedRevision: revision,
    requestId: id,
    grantId: id,
  })
  .strict();

export const RunCursorRequestSchema = RunIdentitySchema.extend({
  afterSeq: seq,
}).strict();
export const RunStopRequestSchema = RunIdentitySchema.extend({
  requestId: id,
}).strict();

export const RunFailureCodeSchema = z.enum([
  'START_FAILED',
  'MODEL_FAILED',
  'TOOL_FAILED',
  'PROTOCOL_ERROR',
  'OUTPUT_LIMIT',
  'RUN_DEADLINE',
  'AUTHORIZATION_REVOKED',
  'STOP_TIMEOUT',
  'ADAPTER_DISCONNECTED',
]);

const toolFailure = z.union([
  ReadOnlyToolRejectionSchema.shape.error.shape.code,
  z.enum([
    'CONTENT_NOT_ALLOWED',
    'MATERIAL_NOT_ALLOWED',
    'BUDGET_EXCEEDED',
    'TOOL_FAILED',
    'CANCELLED',
  ]),
]);
const call = { callId: id };
const usage = z
  .object({
    inputTokens: seq.nullable(),
    outputTokens: seq.nullable(),
  })
  .strict()
  .nullable();

export const RunEventBodySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('run.accepted') }).strict(),
  z.object({ type: z.literal('run.started') }).strict(),
  z
    .object({
      type: z.literal('text.delta'),
      text: textBytes(RUN_LIMITS.textChunkBytes),
    })
    .strict(),
  z
    .object({
      type: z.literal('tool.requested'),
      ...call,
      tool: ReadOnlyToolNameSchema.nullable(),
    })
    .strict(),
  z
    .object({
      type: z.literal('tool.result'),
      ...call,
      result: z.discriminatedUnion('status', [
        z
          .object({
            status: z.literal('succeeded'),
            text: textBytes(RUN_LIMITS.textChunkBytes),
            truncated: z.boolean(),
          })
          .strict(),
        z
          .object({
            status: z.enum(['rejected', 'failed', 'cancelled']),
            code: toolFailure,
          })
          .strict(),
      ]),
    })
    .strict(),
  z
    .object({
      type: z.literal('run.stop_requested'),
      reason: z.enum([
        'user',
        'window_closed',
        'deadline',
        'authorization_revoked',
        'host_failure',
      ]),
    })
    .strict(),
  z
    .object({
      type: z.literal('run.unknown'),
      reason: z.enum(['host_restarted']),
    })
    .strict(),
  z.object({ type: z.literal('run.completed'), usage }).strict(),
  z
    .object({ type: z.literal('run.failed'), code: RunFailureCodeSchema })
    .strict(),
  z.object({ type: z.literal('run.stopped') }).strict(),
]);

export const RunEventSchema = RunIdentitySchema.extend({
  version: z.literal(1),
  seq: seq.refine((value) => value > 0),
  at: z.iso.datetime(),
  source: z.enum(['host', 'model', 'tool']),
  adapter: z.enum(['controlled', 'pi']),
  body: RunEventBodySchema,
})
  .strict()
  .superRefine((event, context) => {
    const expectedSource =
      event.body.type === 'text.delta'
        ? 'model'
        : event.body.type.startsWith('tool.')
          ? 'tool'
          : 'host';
    if (event.source !== expectedSource) {
      context.addIssue({
        code: 'custom',
        path: ['source'],
        message: 'Event source does not match its body.',
      });
    }
    if (
      new TextEncoder().encode(JSON.stringify(event)).byteLength >
      RUN_LIMITS.eventBytes
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Event exceeds the wire byte budget.',
      });
    }
  });

export type RunIdentity = z.infer<typeof RunIdentitySchema>;
export type RunStatus = z.infer<typeof RunStatusSchema>;
export type RunEvent = z.infer<typeof RunEventSchema>;
export type RunEventBody = z.infer<typeof RunEventBodySchema>;
export type RunStartRequest = z.infer<typeof RunStartRequestSchema>;
export type RunCursorRequest = z.infer<typeof RunCursorRequestSchema>;
export type RunStopRequest = z.infer<typeof RunStopRequestSchema>;
export type RunFailureCode = z.infer<typeof RunFailureCodeSchema>;

/** A receiver must resynchronize on gaps; timestamps are never ordering keys. */
export function classifyRunEvent(
  identity: RunIdentity,
  lastSeq: number,
  input: unknown,
): 'next' | 'duplicate' | 'gap' | 'foreign' | 'invalid' {
  const parsed = RunEventSchema.safeParse(input);
  if (!parsed.success) return 'invalid';
  const event = parsed.data;
  if (
    event.sessionId !== identity.sessionId ||
    event.projectId !== identity.projectId ||
    event.runId !== identity.runId ||
    event.revision !== identity.revision
  )
    return 'foreign';
  if (event.seq <= lastSeq) return 'duplicate';
  return event.seq === lastSeq + 1 ? 'next' : 'gap';
}

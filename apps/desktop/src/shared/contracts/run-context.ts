import { z } from 'zod';

import { EGRESS_MATERIAL_LIMIT } from './egress';
import { RunIdentitySchema, RunStatusSchema } from './pioneer-run';
import { ReadOnlyToolNameSchema } from './read-only-tools';

/**
 * Bounded, main-generated projection of a run's context (Issue #17): which
 * materials the grant approved, which ones the tools actually read or found
 * changed, and the tool-call log with fixed status codes. Tool arguments never
 * cross the run event wire (run contract §3), so the renderer asks main for
 * this read-only view instead of inferring paths from events. Main only echoes
 * a normalized project-relative target; raw arguments, OS errors and absolute
 * paths stay in main.
 */

export const RUN_MATERIAL_STATES = [
  'approved',
  'read',
  'scanned',
  'changed',
  'missing',
] as const;
export const RunMaterialStateSchema = z.enum(RUN_MATERIAL_STATES);

export const RUN_MATERIAL_REASONS = [
  'CONTENT_NOT_ALLOWED',
  'MATERIAL_NOT_ALLOWED',
  'PATH_UNAVAILABLE',
  'PATH_TYPE_NOT_ALLOWED',
  'LINK_NOT_ALLOWED',
  'SENSITIVE_PATH',
  'PATH_OUTSIDE_PROJECT',
  'INVALID_PATH',
  'BINARY_CONTENT',
  'TRUNCATED',
  'READ_FAILED',
] as const;
export const RunMaterialReasonSchema = z.enum(RUN_MATERIAL_REASONS);

export const RunContextMaterialSchema = z
  .object({
    path: z.string().min(1).max(1024),
    bytes: z.number().int().nonnegative().max(65_536),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    state: RunMaterialStateSchema,
    /** Why the material is not readable; null while approved or read. */
    reason: RunMaterialReasonSchema.nullable(),
    readAt: z.iso.datetime().nullable(),
  })
  .strict();

export const RUN_TOOL_CALL_STATES = [
  'requested',
  'succeeded',
  'rejected',
  'failed',
  'cancelled',
] as const;
export const RunToolCallStateSchema = z.enum(RUN_TOOL_CALL_STATES);

export const RunContextCallSchema = z
  .object({
    callId: z.string().min(1).max(512),
    tool: ReadOnlyToolNameSchema.nullable(),
    /** Project-relative target, or null when no safe target can be named. */
    target: z.string().min(1).max(1024).nullable(),
    state: RunToolCallStateSchema,
    code: z.string().min(1).max(64).nullable(),
    at: z.iso.datetime(),
  })
  .strict();

export const RunContextSchema = z
  .object({
    identity: RunIdentitySchema,
    status: RunStatusSchema,
    materials: z.array(RunContextMaterialSchema).max(EGRESS_MATERIAL_LIMIT),
    calls: z.array(RunContextCallSchema).max(32),
  })
  .strict();

export const RunContextReplySchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), context: RunContextSchema }).strict(),
  z.object({ ok: z.literal(false), code: z.literal('RUN_NOT_FOUND') }).strict(),
]);

/**
 * Bounded, main-derived summary of the newest run, persisted with the session
 * so the panels can name the right Session/Run after a restart. The event
 * stream itself is not persisted; the summary keeps provenance and call
 * outcomes only, and the panels say so instead of replaying invented events.
 */
export const RunSnapshotSchema = z
  .object({
    identity: RunIdentitySchema,
    /** Only a converged run is worth persisting as the session's last summary. */
    status: z.enum(['completed', 'failed', 'stopped']),
    tools: z.array(ReadOnlyToolNameSchema).max(3),
    materials: z.array(RunContextMaterialSchema).max(EGRESS_MATERIAL_LIMIT),
    calls: z.array(RunContextCallSchema).max(32),
    recordedAt: z.iso.datetime(),
  })
  .strict();

export type RunMaterialState = z.infer<typeof RunMaterialStateSchema>;
export type RunMaterialReason = z.infer<typeof RunMaterialReasonSchema>;
export type RunContextMaterial = z.infer<typeof RunContextMaterialSchema>;
export type RunToolCallState = z.infer<typeof RunToolCallStateSchema>;
export type RunContextCall = z.infer<typeof RunContextCallSchema>;
export type RunContext = z.infer<typeof RunContextSchema>;
export type RunContextReply = z.infer<typeof RunContextReplySchema>;
export type RunSnapshot = z.infer<typeof RunSnapshotSchema>;

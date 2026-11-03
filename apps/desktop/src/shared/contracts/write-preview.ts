import { z } from 'zod';

import { RunIdentitySchema } from './pioneer-run';
import {
  WRITE_CHANGE_FAILURE_CODES,
  WRITE_LIMITS,
  WRITE_PERMISSION_DENIAL_CODES,
  WRITE_REJECTION_CODES,
  WriteFileIdentitySchema,
  WriteFileStateSchema,
  WritePermissionModeSchema,
  WriteRejectionCodeSchema,
  WriteTargetOutcomeSchema,
  WriteTargetPathSchema,
} from './write-permission';

/**
 * P4-A (#19) preview and write-execution contract.
 *
 * Main turns a run's `replace_file` proposal into a preview: the target's real
 * pre-image, the proposed post-image, and the complete unified diff between
 * them. The renderer may ask for that preview, refresh it after a target change
 * and either reject it or ask main to apply exactly the reviewed revision.
 *
 * The preview is a read-only projection. It never creates, deletes, renames or
 * restores a file; only `apply` under a valid write permission can write, and
 * only for the targets and bytes named here.
 */

export const WRITE_PREVIEW_LIMITS = Object.freeze({
  /** Proposals one run may submit; a model cannot loop the review surface. */
  proposalsPerRun: 4,
  /** Proposals retained in main memory across one window. */
  retainedProposals: 32,
  /** Total pre-image, post-image and diff bytes kept for retained proposals. */
  retainedBytes: 8_388_608,
  /** Rendered diff bytes per preview; over budget means refuse, never truncate. */
  previewBytes: 4_194_304,
});

const identifierSchema = RunIdentitySchema.shape.runId;
const revisionSchema = RunIdentitySchema.shape.revision;
const positivePreviewRevision = z.number().int().positive();

/** One target of the preview: both exact states plus the complete line diff. */
export const WritePreviewTargetSchema = z
  .object({
    path: WriteTargetPathSchema,
    before: WriteFileStateSchema,
    after: WriteFileStateSchema,
    identity: WriteFileIdentitySchema.nullable(),
    /** Unified diff text; empty only if the caller asks for an unchanged file. */
    diff: z.string().max(WRITE_PREVIEW_LIMITS.previewBytes),
  })
  .strict();

export const WritePreviewSchema = z
  .object({
    version: z.literal(1),
    proposalId: identifierSchema,
    sessionId: identifierSchema,
    projectId: identifierSchema,
    runId: identifierSchema,
    revision: revisionSchema,
    /** Bumped when a refresh re-reads the target, so old approvals are stale. */
    previewRevision: positivePreviewRevision,
    createdAt: z.iso.datetime(),
    targets: z
      .array(WritePreviewTargetSchema)
      .min(1)
      .max(WRITE_LIMITS.targets)
      .superRefine((targets, context) => {
        const paths = new Set<string>();
        for (const target of targets) {
          const folded = target.path.toLowerCase();
          if (paths.has(folded)) {
            context.addIssue({
              code: 'custom',
              path: ['targets'],
              message: 'Duplicate preview target path.',
            });
          }
          paths.add(folded);
        }
      }),
  })
  .strict();

export type WritePreview = z.infer<typeof WritePreviewSchema>;
export type WritePreviewTarget = z.infer<typeof WritePreviewTargetSchema>;

/** Proposal lifecycle: only a pending preview can be applied or refreshed. */
export const WRITE_PREVIEW_STATES = [
  'pending',
  'applied',
  'rejected',
  'expired',
  'failed',
] as const;

export const WritePreviewStateSchema = z.enum(WRITE_PREVIEW_STATES);

export type WritePreviewState = z.infer<typeof WritePreviewStateSchema>;

/** Bounded list item; the diff is fetched only when one is selected. */
export const WritePreviewSummarySchema = z
  .object({
    proposalId: identifierSchema,
    runId: identifierSchema,
    revision: revisionSchema,
    previewRevision: positivePreviewRevision,
    createdAt: z.iso.datetime(),
    state: WritePreviewStateSchema,
    paths: z.array(WriteTargetPathSchema).min(1).max(WRITE_LIMITS.targets),
  })
  .strict();

export type WritePreviewSummary = z.infer<typeof WritePreviewSummarySchema>;

/** One target whose bytes were written, with the read-back that proves it. */
export const WriteAppliedTargetSchema = z
  .object({
    path: WriteTargetPathSchema,
    afterSha256: z.string().regex(/^[0-9a-f]{64}$/),
    observedSha256: z.string().regex(/^[0-9a-f]{64}$/),
    verification: z.enum(['verified', 'unverified']),
  })
  .strict();

export type WriteAppliedTarget = z.infer<typeof WriteAppliedTargetSchema>;

/**
 * What actually happened to each target. Admission refusals carry rejected or
 * unchanged outcomes and no writes; a partial write names the failing target
 * and keeps the already written ones in `applied`.
 */
export const WriteApplyReportSchema = z
  .object({
    proposalId: identifierSchema,
    sessionId: identifierSchema,
    projectId: identifierSchema,
    runId: identifierSchema,
    revision: revisionSchema,
    previewRevision: positivePreviewRevision,
    appliedAt: z.iso.datetime(),
    outcomes: z.array(WriteTargetOutcomeSchema).min(1),
    applied: z.array(WriteAppliedTargetSchema),
    partial: z.boolean(),
    failure: z
      .object({
        path: WriteTargetPathSchema,
        code: z.enum([
          'WRITE_FAILED',
          'VERIFY_FAILED',
          'CANCELLED',
          'RECOVERY_CONFLICT',
          'PERMISSION_DENIED',
          'UNKNOWN',
        ]),
      })
      .strict()
      .nullable(),
  })
  .strict();

export type WriteApplyReport = z.infer<typeof WriteApplyReportSchema>;

/**
 * Proposal-creation refusal codes reported to the adapter. Target observation
 * failures reuse the #18 write-time rejection vocabulary; the remaining values
 * are specific to the proposal slice.
 */
export const WriteProposalRejectionCodeSchema = z.union([
  WriteRejectionCodeSchema,
  z.enum([
    'WRITE_UNAVAILABLE',
    'PROPOSAL_LIMIT',
    'INVALID_TARGET',
    'DUPLICATE_TARGET',
    'TARGET_NOT_TEXT',
    'NO_CHANGE',
    'DIFF_TOO_LARGE',
    'CANCELLED',
  ]),
]);

export type WriteProposalRejectionCode = z.infer<
  typeof WriteProposalRejectionCodeSchema
>;

/** The adapter-facing result of asking main to review a proposed change. */
export type WriteProposalOutcome =
  | { status: 'accepted'; proposalId: string }
  | { status: 'rejected'; code: WriteProposalRejectionCode };

/** Fixed write IPC surface. No renderer-controlled path or content channel. */
export const WRITE_IPC_CHANNELS = {
  permissionGet: 'write:permission:get',
  permissionSet: 'write:permission:set',
  previewList: 'write:preview:list',
  previewGet: 'write:preview:get',
  previewRefresh: 'write:preview:refresh',
  previewReject: 'write:preview:reject',
  previewApply: 'write:preview:apply',
} as const;

/** Errors the write surface itself produces, before permission/target codes. */
export const WRITE_IPC_ERROR_CODES = [
  'INVALID_REQUEST',
  'UNTRUSTED_SENDER',
  'BINDING_MISMATCH',
  'PROJECT_UNAVAILABLE',
  'PROPOSAL_NOT_FOUND',
  'PREVIEW_EXPIRED',
  'PREVIEW_ALREADY_RESOLVED',
  'WRITE_JOURNAL_UNAVAILABLE',
  'WRITE_UNAVAILABLE',
] as const;

export const WriteIpcErrorCodeSchema = z.enum([
  ...WRITE_IPC_ERROR_CODES,
  'PERMISSION_REQUIRED',
  ...WRITE_PERMISSION_DENIAL_CODES,
  ...WRITE_REJECTION_CODES,
  ...WRITE_CHANGE_FAILURE_CODES,
]);

export type WriteIpcErrorCode = z.infer<typeof WriteIpcErrorCodeSchema>;

/** The fields the write surface binds one preview to, without the proposal id. */
export interface WriteProposalViewBinding {
  sessionId: string;
  projectId: string;
  webContentsId: number;
  windowEpoch: number;
}

const permissionReplyCodes = z.enum([
  'INVALID_REQUEST',
  'UNTRUSTED_SENDER',
  'BINDING_MISMATCH',
]);

const proposalIdentity = {
  proposalId: identifierSchema,
  sessionId: identifierSchema,
  projectId: identifierSchema,
  runId: identifierSchema,
  revision: revisionSchema,
} as const;

export const WritePermissionGetRequestSchema = z
  .object({
    sessionId: identifierSchema,
    projectId: identifierSchema,
  })
  .strict();

export const WritePermissionSetRequestSchema = z
  .object({
    sessionId: identifierSchema,
    projectId: identifierSchema,
    mode: WritePermissionModeSchema,
    riskAcknowledged: z.boolean(),
  })
  .strict();

export const WritePreviewListRequestSchema = z
  .object({
    sessionId: identifierSchema,
    projectId: identifierSchema,
  })
  .strict();

export const WritePreviewGetRequestSchema = z.object(proposalIdentity).strict();

export const WritePreviewRefreshRequestSchema = WritePreviewGetRequestSchema;

export const WritePreviewRejectRequestSchema = z
  .object({
    ...proposalIdentity,
    previewRevision: positivePreviewRevision,
  })
  .strict();

export const WritePreviewApplyRequestSchema = WritePreviewRejectRequestSchema;

export const WritePermissionGetReplySchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      mode: WritePermissionModeSchema.nullable(),
      riskAcknowledged: z.boolean(),
    })
    .strict(),
  z.object({ ok: z.literal(false), code: permissionReplyCodes }).strict(),
]);

export const WritePermissionSetReplySchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), mode: WritePermissionModeSchema }).strict(),
  z.object({ ok: z.literal(false), code: permissionReplyCodes }).strict(),
]);

const ipcError = z.enum(WRITE_IPC_ERROR_CODES);

export const WritePreviewListReplySchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      previews: z
        .array(WritePreviewSummarySchema)
        .max(WRITE_PREVIEW_LIMITS.retainedProposals),
    })
    .strict(),
  z.object({ ok: z.literal(false), code: ipcError }).strict(),
]);

export const WritePreviewGetReplySchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      preview: WritePreviewSchema,
      state: WritePreviewStateSchema,
    })
    .strict(),
  z.object({ ok: z.literal(false), code: ipcError }).strict(),
]);

export const WritePreviewRefreshReplySchema = WritePreviewGetReplySchema;

export const WritePreviewRejectReplySchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), state: z.literal('rejected') }).strict(),
  z.object({ ok: z.literal(false), code: ipcError }).strict(),
]);

export const WritePreviewApplyReplySchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), report: WriteApplyReportSchema }).strict(),
  z
    .object({
      ok: z.literal(false),
      code: WriteIpcErrorCodeSchema,
      report: WriteApplyReportSchema.nullable(),
    })
    .strict(),
]);

export type WritePermissionGetRequest = z.infer<
  typeof WritePermissionGetRequestSchema
>;
export type WritePermissionSetRequest = z.infer<
  typeof WritePermissionSetRequestSchema
>;
export type WritePermissionGetReply = z.infer<
  typeof WritePermissionGetReplySchema
>;
export type WritePermissionSetReply = z.infer<
  typeof WritePermissionSetReplySchema
>;
export type WritePreviewListRequest = z.infer<
  typeof WritePreviewListRequestSchema
>;
export type WritePreviewGetRequest = z.infer<
  typeof WritePreviewGetRequestSchema
>;
export type WritePreviewRefreshRequest = z.infer<
  typeof WritePreviewRefreshRequestSchema
>;
export type WritePreviewRejectRequest = z.infer<
  typeof WritePreviewRejectRequestSchema
>;
export type WritePreviewApplyRequest = z.infer<
  typeof WritePreviewApplyRequestSchema
>;
export type WritePreviewListReply = z.infer<typeof WritePreviewListReplySchema>;
export type WritePreviewGetReply = z.infer<typeof WritePreviewGetReplySchema>;
export type WritePreviewRefreshReply = z.infer<
  typeof WritePreviewRefreshReplySchema
>;
export type WritePreviewRejectReply = z.infer<
  typeof WritePreviewRejectReplySchema
>;
export type WritePreviewApplyReply = z.infer<
  typeof WritePreviewApplyReplySchema
>;

/** Fixed renderer port. It exposes no path, file handle or write primitive. */
export interface WriteDesktopApi {
  getWritePermission(
    request: WritePermissionGetRequest,
  ): Promise<WritePermissionGetReply>;
  setWritePermission(
    request: WritePermissionSetRequest,
  ): Promise<WritePermissionSetReply>;
  listWritePreviews(
    request: WritePreviewListRequest,
  ): Promise<WritePreviewListReply>;
  getWritePreview(
    request: WritePreviewGetRequest,
  ): Promise<WritePreviewGetReply>;
  refreshWritePreview(
    request: WritePreviewRefreshRequest,
  ): Promise<WritePreviewRefreshReply>;
  rejectWritePreview(
    request: WritePreviewRejectRequest,
  ): Promise<WritePreviewRejectReply>;
  applyWritePreview(
    request: WritePreviewApplyRequest,
  ): Promise<WritePreviewApplyReply>;
}

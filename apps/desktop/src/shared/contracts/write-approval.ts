import { z } from 'zod';

import { RunIdentitySchema } from './pioneer-run';

/**
 * P4-D1 (#18) write approval contract: a decision-only surface.
 *
 * A write approval binds one reviewed Diff to the exact project-relative
 * targets and their pre-image bytes. Nothing in this module writes, deletes,
 * renames or restores project files. The human confirmation of the P4-D1
 * decision is a precondition for any executor that consumes these records;
 * until then no capability flag, IPC channel or executor reaches them.
 */

export const WRITE_APPROVAL_LIMITS = Object.freeze({
  /** How long a reviewed Diff may be applied after the user confirms it. */
  approvalMs: 600_000,
  /** Targets per approval; the reviewed Diff is applied all-or-nothing. */
  targets: 16,
  /** Bytes per pre-image and per post-image; both are hashed in full. */
  targetBytes: 1_048_576,
  /** Post-image bytes across one approval. */
  approvalBytes: 4_194_304,
  pathChars: 1_024,
  pathComponents: 32,
});

/** Shared with the run protocol so an id/revision cannot drift between them. */
const id = RunIdentitySchema.shape.runId;
const revision = RunIdentitySchema.shape.revision;
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const bytes = z
  .number()
  .int()
  .nonnegative()
  .max(WRITE_APPROVAL_LIMITS.targetBytes);

const RESERVED_DEVICE_NAME =
  /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³]|conin\$|conout\$)(?:\.|$)/i;

/**
 * Shape-only check: plain project-relative components with no traversal,
 * drive, UNC, ADS, reserved device name or over-long path. Containment, link,
 * sensitive-name and type checks stay in main's path policy and are re-run
 * before any write.
 */
export const WriteTargetPathSchema = z
  .string()
  .min(1)
  .max(WRITE_APPROVAL_LIMITS.pathChars)
  .refine((value) => {
    const normalized = value.replaceAll('\\', '/');
    if (normalized.startsWith('/')) return false;
    const segments = normalized.split('/');
    if (segments.length > WRITE_APPROVAL_LIMITS.pathComponents) return false;
    return segments.every(
      (segment) =>
        segment.length > 0 &&
        segment !== '.' &&
        segment !== '..' &&
        !segment.includes(':') &&
        !/[\u0000-\u001f\u007f<>"|?*]/.test(segment) &&
        !/[. ]$/.test(segment) &&
        !RESERVED_DEVICE_NAME.test(segment),
    );
  }, 'Use a plain project-relative path.');

/** Exact bytes of one side of a reviewed change; the hash is authoritative. */
export const WriteFileStateSchema = z
  .object({
    kind: z.literal('file'),
    bytes,
    sha256,
  })
  .strict();

/**
 * File identity reported by the platform for the approved pre-image. `fileId`
 * is the filesystem file index (Node `ino`); `birthtimeMs` separates a deleted
 * and re-created file that happens to hold identical bytes. `null` records that
 * the platform did not report a usable identity, so the approval falls back to
 * the content hash alone.
 */
export const WriteFileIdentitySchema = z
  .object({
    fileId: z.string().min(1).max(64),
    birthtimeMs: z.number().nonnegative(),
  })
  .strict();

export const WriteTargetSchema = z
  .object({
    path: WriteTargetPathSchema,
    before: WriteFileStateSchema,
    after: WriteFileStateSchema,
    identity: WriteFileIdentitySchema.nullable(),
  })
  .strict();

export const WriteTargetsSchema = z
  .array(WriteTargetSchema)
  .min(1)
  .max(WRITE_APPROVAL_LIMITS.targets)
  .superRefine((targets, context) => {
    const paths = new Set<string>();
    let totalAfter = 0;
    for (const target of targets) {
      if (paths.has(target.path)) {
        context.addIssue({
          code: 'custom',
          path: ['targets'],
          message: 'Duplicate target path.',
        });
      }
      paths.add(target.path);
      totalAfter += target.after.bytes;
    }
    if (totalAfter > WRITE_APPROVAL_LIMITS.approvalBytes) {
      context.addIssue({
        code: 'custom',
        path: ['targets'],
        message: 'Targets exceed the approval byte budget.',
      });
    }
  });

/**
 * Main-side approval record. `webContentsId` and `windowEpoch` bind the
 * approval to the window that displayed the reviewed Diff; the renderer never
 * supplies them, and they never appear in the serializable summary.
 */
export const WriteApprovalSchema = z
  .object({
    version: z.literal(1),
    approvalId: id,
    /** The decision slice covers replacing the full content of existing files. */
    operation: z.literal('replace_file'),
    sessionId: id,
    projectId: id,
    runId: id,
    revision,
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    diffDigest: sha256,
    targets: WriteTargetsSchema,
    webContentsId: z.number().int().nonnegative(),
    windowEpoch: z.number().int().nonnegative(),
    consumed: z.boolean(),
    revoked: z.boolean(),
    /** Why the approval was revoked; `null` exactly when it is not revoked. */
    revocationReason: z
      .enum(['user', 'window_closed', 'new_revision', 'stale_target'])
      .nullable(),
    /** Set once the approval has been applied; null while it is still unused. */
    appliedAt: z.iso.datetime().nullable(),
  })
  .strict()
  .superRefine((approval, context) => {
    const lifetime =
      Date.parse(approval.expiresAt) - Date.parse(approval.createdAt);
    if (lifetime <= 0) {
      context.addIssue({
        code: 'custom',
        path: ['expiresAt'],
        message: 'An approval must expire after it was created.',
      });
    }
    if (lifetime > WRITE_APPROVAL_LIMITS.approvalMs) {
      context.addIssue({
        code: 'custom',
        path: ['expiresAt'],
        message: 'An approval may not outlive the approval window.',
      });
    }
    if (approval.revoked !== (approval.revocationReason !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['revocationReason'],
        message: 'A revocation reason is required exactly when revoked.',
      });
    }
    if (approval.appliedAt !== null && !approval.consumed) {
      context.addIssue({
        code: 'custom',
        path: ['appliedAt'],
        message: 'An applied approval must also be consumed.',
      });
    }
  });

/**
 * Renderer-visible summary. It carries exactly what the user must be able to
 * check: the Run, the relative targets, both sides of the reviewed change,
 * the Diff digest and the validity window. It carries no absolute path, no
 * binding secret and no "already applied" claim.
 */
export const WriteApprovalSummarySchema = z
  .object({
    approvalId: id,
    operation: z.literal('replace_file'),
    sessionId: id,
    projectId: id,
    runId: id,
    revision,
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    diffDigest: sha256,
    targets: WriteTargetsSchema,
  })
  .strict();

export const WRITE_TARGET_STATES = [
  'unchanged',
  'changed',
  'missing',
  'replaced',
  'not_regular_file',
  'link_not_allowed',
  'too_large',
  'unreadable',
  'unstable',
] as const;

export const WRITE_TARGET_STATUSES = [
  'applied',
  'verification_failed',
  'restored',
  'unchanged',
  'rejected',
  'failed',
  'unknown',
] as const;

export const WRITE_APPROVAL_REJECTION_CODES = [
  'APPROVAL_REQUIRED',
  'APPROVAL_CONSUMED',
  'APPROVAL_REVOKED',
  'APPROVAL_EXPIRED',
  'APPROVAL_BINDING_MISMATCH',
  'APPROVAL_DIGEST_MISMATCH',
  'APPROVAL_TARGET_MISMATCH',
  'APPROVAL_STALE_TARGET',
] as const;

export const WriteTargetStateSchema = z.enum(WRITE_TARGET_STATES);
export const WriteTargetStatusSchema = z.enum(WRITE_TARGET_STATUSES);
export const WriteApprovalRejectionCodeSchema = z.enum(
  WRITE_APPROVAL_REJECTION_CODES,
);

/** Per-path stale detail; paths stay project-relative so nothing leaks. */
export const WriteStaleTargetSchema = z
  .object({ path: WriteTargetPathSchema, state: WriteTargetStateSchema })
  .strict();

export const WriteApprovalRejectionSchema = z
  .object({
    ok: z.literal(false),
    error: z
      .object({
        code: WriteApprovalRejectionCodeSchema,
        message: z.string(),
        retryable: z.literal(false),
        targets: z.array(WriteStaleTargetSchema),
      })
      .strict(),
  })
  .strict();

export const WriteChangeFailureCodeSchema = z.enum([
  'WRITE_FAILED',
  'VERIFY_FAILED',
  'CANCELLED',
  'RECOVERY_CONFLICT',
  'UNKNOWN',
]);

export const WriteTargetOutcomeSchema = z
  .object({
    path: WriteTargetPathSchema,
    status: WriteTargetStatusSchema,
    code: z
      .union([WriteChangeFailureCodeSchema, WriteApprovalRejectionCodeSchema])
      .nullable(),
  })
  .strict();

/**
 * Append-only per-approval change journal, main-owned. `intent` is durable
 * before a target is touched, `applied` records the observed post-state and
 * whether read-back verification matched, `failed` records a target that was
 * not applied, and `recovery` records what a later recovery attempt did.
 */
export const WriteChangeJournalRecordSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('intent'),
      approvalId: id,
      path: WriteTargetPathSchema,
      beforeSha256: sha256,
      at: z.iso.datetime(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('applied'),
      approvalId: id,
      path: WriteTargetPathSchema,
      afterSha256: sha256,
      observedSha256: sha256,
      /** Identity the applied bytes landed on; null when the platform has none. */
      observedIdentity: WriteFileIdentitySchema.nullable(),
      verification: z.enum(['verified', 'unverified']),
      at: z.iso.datetime(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('failed'),
      approvalId: id,
      path: WriteTargetPathSchema,
      code: WriteChangeFailureCodeSchema,
      at: z.iso.datetime(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('recovery'),
      approvalId: id,
      path: WriteTargetPathSchema,
      action: z.enum(['restore', 'preserve', 'already_restored']),
      observedSha256: sha256.nullable(),
      at: z.iso.datetime(),
    })
    .strict(),
]);

export type WriteTargetPath = z.infer<typeof WriteTargetPathSchema>;
export type WriteStaleTarget = z.infer<typeof WriteStaleTargetSchema>;
export type WriteFileState = z.infer<typeof WriteFileStateSchema>;
export type WriteFileIdentity = z.infer<typeof WriteFileIdentitySchema>;
export type WriteTarget = z.infer<typeof WriteTargetSchema>;
export type WriteApproval = z.infer<typeof WriteApprovalSchema>;
export type WriteApprovalSummary = z.infer<typeof WriteApprovalSummarySchema>;
export type WriteTargetState = z.infer<typeof WriteTargetStateSchema>;
export type WriteTargetStatus = z.infer<typeof WriteTargetStatusSchema>;
export type WriteApprovalRejectionCode = z.infer<
  typeof WriteApprovalRejectionCodeSchema
>;
export type WriteApprovalRejection = z.infer<
  typeof WriteApprovalRejectionSchema
>;
export type WriteTargetOutcome = z.infer<typeof WriteTargetOutcomeSchema>;
export type WriteChangeFailureCode = z.infer<
  typeof WriteChangeFailureCodeSchema
>;
export type WriteChangeJournalRecord = z.infer<
  typeof WriteChangeJournalRecordSchema
>;
export type WriteRevocationReason = NonNullable<
  WriteApproval['revocationReason']
>;

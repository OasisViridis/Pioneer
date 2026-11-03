import { z } from 'zod';

import { RunIdentitySchema } from './pioneer-run';
import { MAX_PATH_COMPONENTS, isSafePathSegment } from '../path-safety';

/**
 * P4-D1 (#18) write permission contract: a decision-only surface.
 *
 * The user grants one permission mode for a session and project scope, the way
 * a permission selector works in a coding agent: view only, workspace write,
 * full access, or the experimental auto-review mode. There is no per-Diff
 * approval record: every write is instead checked against the granted mode,
 * the declared target scope, the protected paths and the current bytes.
 *
 * Nothing in this module writes, deletes, renames or restores project files.
 * The P4-D1 decision is recorded (Issue #18); the executor that consumes these
 * records is #19, and no capability flag, IPC channel or executor exists yet.
 */

export const WRITE_LIMITS = Object.freeze({
  /** Targets per write batch; the batch is applied all-or-nothing. */
  targets: 16,
  /** Bytes per pre-image and per post-image; both are hashed in full. */
  targetBytes: 1_048_576,
  /** Post-image bytes across one batch. */
  batchBytes: 4_194_304,
  pathChars: 1_024,
  pathComponents: MAX_PATH_COMPONENTS,
});

/** Shared with the run protocol so an id/revision cannot drift between them. */
const identifierSchema = RunIdentitySchema.shape.runId;
const revisionSchema = RunIdentitySchema.shape.revision;
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const byteCountSchema = z
  .number()
  .int()
  .nonnegative()
  .max(WRITE_LIMITS.targetBytes);

/**
 * Shape-only check: plain project-relative components with no traversal,
 * drive, UNC, ADS, reserved device name or over-long path. Components must use
 * `/` so one file cannot enter a batch twice as `src/a.ts` and `src\a.ts`.
 * The per-segment rule is shared with main's read-only policy. Containment,
 * link, sensitive-name and type checks stay in main's path policy and are
 * re-run before any write.
 */
export const WriteTargetPathSchema = z
  .string()
  .min(1)
  .max(WRITE_LIMITS.pathChars)
  .refine((value) => {
    if (value.includes('\\')) return false;
    if (value.startsWith('/')) return false;
    const segments = value.split('/');
    if (segments.length > WRITE_LIMITS.pathComponents) return false;
    return segments.every(isSafePathSegment);
  }, 'Use a plain project-relative path.');

/** Exact bytes of one side of a change; the hash is authoritative. */
export const WriteFileStateSchema = z
  .object({
    kind: z.literal('file'),
    bytes: byteCountSchema,
    sha256: sha256Schema,
  })
  .strict();

/**
 * File identity reported by the platform for the pre-image. `fileId` is the
 * filesystem file index (Node `ino`); `birthtimeMs` separates a deleted and
 * re-created file that happens to hold identical bytes. `null` records that the
 * platform did not report a usable identity, so the check falls back to the
 * content hash alone.
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
  .max(WRITE_LIMITS.targets)
  .superRefine((targets, context) => {
    const paths = new Set<string>();
    let totalAfter = 0;
    for (const target of targets) {
      // Windows treats these as the same file, so fold case before comparing;
      // a case-sensitive volume only ever rejects a redundant batch.
      const folded = target.path.toLowerCase();
      if (paths.has(folded)) {
        context.addIssue({
          code: 'custom',
          path: ['targets'],
          message: 'Duplicate target path.',
        });
      }
      paths.add(folded);
      totalAfter += target.after.bytes;
    }
    if (totalAfter > WRITE_LIMITS.batchBytes) {
      context.addIssue({
        code: 'custom',
        path: ['targets'],
        message: 'Targets exceed the batch byte budget.',
      });
    }
  });

/**
 * The four modes the permission selector offers. `read_only`, `workspace_write`
 * and `full_access` are the familiar three; `auto_review` keeps the workspace
 * boundary and lets main proceed without a per-change confirmation because it
 * checks every target before and after the write.
 */
export const WRITE_PERMISSION_MODES = [
  'read_only',
  'workspace_write',
  'full_access',
  'auto_review',
] as const;

export const WritePermissionModeSchema = z.enum(WRITE_PERMISSION_MODES);

/**
 * What the selector's scope covers: every target of the batch ("全部 N 个
 * 文件"), or an explicit subset. A subset can only narrow the batch, never add
 * a path the batch does not carry. Subset paths match exactly, never case-folded:
 * on a case-sensitive volume `src/A.ts` and `src/a.ts` are different files, so
 * the caller passes the batch's own path strings.
 */
export const WritePermissionScopeSchema = z.union([
  z.literal('all_targets'),
  z.array(WriteTargetPathSchema).min(1).max(WRITE_LIMITS.targets),
]);

/** Paths the workspace modes never write, whatever the permission says. */
export const WRITE_PROTECTED_PATHS = ['.git'] as const;

/**
 * One permission record. It is bound to the session, project and window epoch,
 * not to a single Diff: switching project, closing the window or restarting
 * main invalidates it. A task switch inside one session does not, because the
 * permission is session-scoped and the task text is egress material.
 * `full_access` and `auto_review` require an explicit risk acknowledgement,
 * recorded here so the UI can prove it happened.
 */
export const WritePermissionSchema = z
  .object({
    version: z.literal(1),
    sessionId: identifierSchema,
    projectId: identifierSchema,
    mode: WritePermissionModeSchema,
    scope: WritePermissionScopeSchema,
    protectedPaths: z
      .array(WriteTargetPathSchema)
      .max(8)
      .default([...WRITE_PROTECTED_PATHS]),
    webContentsId: z.number().int().nonnegative(),
    windowEpoch: z.number().int().nonnegative(),
    grantedAt: z.iso.datetime(),
    riskAcknowledged: z.boolean(),
  })
  .strict()
  .superRefine((permission, context) => {
    const risky =
      permission.mode === 'full_access' || permission.mode === 'auto_review';
    if (risky && !permission.riskAcknowledged) {
      context.addIssue({
        code: 'custom',
        path: ['riskAcknowledged'],
        message: 'This mode requires an explicit risk acknowledgement.',
      });
    }
  });

export type WritePermission = z.infer<typeof WritePermissionSchema>;

/** Why the permission check refused a batch before any target was touched. */
export const WRITE_PERMISSION_DENIAL_CODES = [
  'PERMISSION_READ_ONLY',
  'PERMISSION_OUT_OF_SCOPE',
  'PERMISSION_PROTECTED_PATH',
] as const;

export const WritePermissionDenialCodeSchema = z.enum(
  WRITE_PERMISSION_DENIAL_CODES,
);

export type WritePermissionDenialCode = z.infer<
  typeof WritePermissionDenialCodeSchema
>;

export const WRITE_TARGET_STATES = [
  'unchanged',
  'changed',
  'missing',
  'replaced',
  'identity_unavailable',
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

/**
 * Write-time rejection codes. There is no approval to expire or consume: a
 * target is refused because the bytes on disk no longer match what the run
 * read, or because main could not prove what is there.
 */
export const WRITE_REJECTION_CODES = [
  'TARGET_CHANGED',
  'TARGET_MISSING',
  'TARGET_REPLACED',
  'TARGET_IDENTITY_UNAVAILABLE',
  'TARGET_NOT_REGULAR_FILE',
  'TARGET_LINK_NOT_ALLOWED',
  'TARGET_TOO_LARGE',
  'TARGET_UNREADABLE',
  'TARGET_UNSTABLE',
] as const;

export const WriteRejectionCodeSchema = z.enum(WRITE_REJECTION_CODES);

export type WriteRejectionCode = z.infer<typeof WriteRejectionCodeSchema>;

export const WRITE_CHANGE_FAILURE_CODES = [
  'WRITE_FAILED',
  'VERIFY_FAILED',
  'CANCELLED',
  'RECOVERY_CONFLICT',
  'PERMISSION_DENIED',
  'UNKNOWN',
] as const;

export const WriteChangeFailureCodeSchema = z.enum(WRITE_CHANGE_FAILURE_CODES);

export const WriteTargetStateSchema = z.enum(WRITE_TARGET_STATES);
export const WriteTargetStatusSchema = z.enum(WRITE_TARGET_STATUSES);

/** Per-path stale detail; paths stay project-relative so nothing leaks. */
export const WriteStaleTargetSchema = z
  .object({ path: WriteTargetPathSchema, state: WriteTargetStateSchema })
  .strict();

/** The write-time verdict: either every target may be written, or none is. */
export const WriteVerdictSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }).strict(),
  z
    .object({
      ok: z.literal(false),
      error: z
        .object({
          code: WriteRejectionCodeSchema,
          message: z.string(),
          retryable: z.literal(false),
          targets: z.array(WriteStaleTargetSchema),
        })
        .strict(),
    })
    .strict(),
]);

export const WriteTargetOutcomeSchema = z
  .object({
    path: WriteTargetPathSchema,
    status: WriteTargetStatusSchema,
    code: z
      .union([WriteChangeFailureCodeSchema, WriteRejectionCodeSchema])
      .nullable(),
  })
  .strict();

/**
 * Append-only per-run change journal, main-owned. `intent` is durable before a
 * target is touched, `applied` records the observed post-state and whether
 * read-back verification matched, `failed` records a target that was not
 * applied, and `recovery` records what a later recovery attempt did.
 */
export const WriteChangeJournalRecordSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('intent'),
      runId: identifierSchema,
      revision: revisionSchema,
      path: WriteTargetPathSchema,
      beforeSha256: sha256Schema,
      at: z.iso.datetime(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('applied'),
      runId: identifierSchema,
      revision: revisionSchema,
      path: WriteTargetPathSchema,
      afterSha256: sha256Schema,
      observedSha256: sha256Schema,
      /** Identity the applied bytes landed on; null when the platform has none. */
      observedIdentity: WriteFileIdentitySchema.nullable(),
      verification: z.enum(['verified', 'unverified']),
      at: z.iso.datetime(),
    })
    .strict()
    .superRefine((record, context) => {
      if (record.verification === 'verified') {
        if (record.observedSha256 !== record.afterSha256) {
          context.addIssue({
            code: 'custom',
            path: ['observedSha256'],
            message: 'A verified record must observe the after hash.',
          });
        }
      }
    }),
  z
    .object({
      kind: z.literal('failed'),
      runId: identifierSchema,
      revision: revisionSchema,
      path: WriteTargetPathSchema,
      code: WriteChangeFailureCodeSchema,
      at: z.iso.datetime(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('recovery'),
      runId: identifierSchema,
      revision: revisionSchema,
      path: WriteTargetPathSchema,
      action: z.enum(['restore', 'preserve', 'already_restored']),
      observedSha256: sha256Schema.nullable(),
      at: z.iso.datetime(),
    })
    .strict(),
]);

export type WriteTargetPath = z.infer<typeof WriteTargetPathSchema>;
export type WriteStaleTarget = z.infer<typeof WriteStaleTargetSchema>;
export type WriteFileState = z.infer<typeof WriteFileStateSchema>;
export type WriteFileIdentity = z.infer<typeof WriteFileIdentitySchema>;
export type WriteTarget = z.infer<typeof WriteTargetSchema>;
export type WriteTargetState = z.infer<typeof WriteTargetStateSchema>;
export type WriteTargetStatus = z.infer<typeof WriteTargetStatusSchema>;
export type WritePermissionMode = z.infer<typeof WritePermissionModeSchema>;
export type WritePermissionScope = z.infer<typeof WritePermissionScopeSchema>;
export type WriteTargetOutcome = z.infer<typeof WriteTargetOutcomeSchema>;
export type WriteChangeFailureCode = z.infer<
  typeof WriteChangeFailureCodeSchema
>;
export type WriteChangeJournalRecord = z.infer<
  typeof WriteChangeJournalRecordSchema
>;
export type WriteVerdict = z.infer<typeof WriteVerdictSchema>;

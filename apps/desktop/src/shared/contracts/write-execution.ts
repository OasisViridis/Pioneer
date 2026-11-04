import { z } from 'zod';

import { RunIdentitySchema } from './pioneer-run';
import {
  WRITE_LIMITS,
  WriteChangeFailureCodeSchema,
  WritePermissionDenialCodeSchema,
  WritePermissionSchema,
  WriteRejectionCodeSchema,
  WriteTargetPathSchema,
  WriteTargetSchema,
  WriteTargetStatusSchema,
} from './write-permission';

/**
 * P4-A (#19) controlled write request: one reviewed batch of replacements.
 *
 * The request carries the exact post-image text and its SHA-256, the pre-image
 * evidence the run already recorded, and the permission record that authorizes
 * the batch. It is a request, not a grant: main re-checks the permission, the
 * window binding, the project, every path and the current bytes before it
 * writes anything, and it only reports `applied` after reading the file back.
 *
 * Nothing in this module touches the filesystem. The executor in main is the
 * only consumer; the renderer and preload only build, validate and display
 * structures from here.
 */

export const WRITE_EXECUTION_VERSION = 1;

/**
 * The reviewed marker the preview entry appends to a text file. It is a fixed
 * constant so the preview request is a real, reproducible change rather than
 * model-authored content, and it stays inside the target file's own text.
 */
export const WRITE_EXECUTION_PREVIEW_MARKER =
  '\n<!-- pioneer:change-approval-preview -->\n';

/** Lone high or low surrogates cannot survive an exact UTF-8 round trip. */
const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

const textEncoder = new TextEncoder();

/** Bytes the string occupies when main writes it with the UTF-8 codec. */
export function utf8ByteLength(value: string): number {
  return textEncoder.encode(value).byteLength;
}

/** Exact text only: a lone surrogate would be replaced during encoding. */
export function isWellFormedWriteText(value: string): boolean {
  return !LONE_SURROGATE.test(value);
}

/**
 * Bounded post-image text. The byte cap is the authoritative one; the character
 * cap is only a cheap upper bound because every character is at least 1 byte.
 */
export const WriteExecutionContentSchema = z
  .string()
  .max(WRITE_LIMITS.targetBytes)
  .superRefine((content, context) => {
    if (!isWellFormedWriteText(content)) {
      context.addIssue({
        code: 'custom',
        message: 'Content must be well-formed text.',
      });
      return;
    }
    if (utf8ByteLength(content) > WRITE_LIMITS.targetBytes) {
      context.addIssue({
        code: 'custom',
        message: 'Content exceeds the per-target byte budget.',
      });
    }
  });

/**
 * One replacement: the pre-image and identity from `write-permission.ts`, the
 * exact bytes main must write, and the post-image hash those bytes must
 * produce. A caller cannot claim an `after` hash that its content does not
 * produce; main verifies the pair again before writing.
 */
export const WriteExecutionTargetSchema = WriteTargetSchema.extend({
  content: WriteExecutionContentSchema,
}).superRefine((target, context) => {
  if (utf8ByteLength(target.content) !== target.after.bytes) {
    context.addIssue({
      code: 'custom',
      path: ['after', 'bytes'],
      message: 'The after byte count must match the supplied content.',
    });
  }
});

/**
 * One controlled batch. Session, project and window epoch appear both at the
 * top level and inside the permission record so a mismatch is a schema error,
 * not something an executor can overlook. `runId` and `revision` name the run
 * whose read the review was prepared from, so the journal and the review can
 * point back at one run instead of an anonymous session. The window's
 * webContents id is not in the request: main binds it from the trusted IPC
 * sender instead.
 */
export const WriteExecutionRequestSchema = z
  .object({
    version: z.literal(WRITE_EXECUTION_VERSION),
    sessionId: RunIdentitySchema.shape.sessionId,
    projectId: RunIdentitySchema.shape.projectId,
    runId: RunIdentitySchema.shape.runId,
    revision: RunIdentitySchema.shape.revision,
    windowEpoch: z.number().int().nonnegative(),
    permission: WritePermissionSchema,
    targets: z
      .array(WriteExecutionTargetSchema)
      .min(1)
      .max(WRITE_LIMITS.targets),
  })
  .strict()
  .superRefine((request, context) => {
    if (request.permission.sessionId !== request.sessionId) {
      context.addIssue({
        code: 'custom',
        path: ['permission', 'sessionId'],
        message: 'The permission is bound to another session.',
      });
    }
    if (request.permission.projectId !== request.projectId) {
      context.addIssue({
        code: 'custom',
        path: ['permission', 'projectId'],
        message: 'The permission is bound to another project.',
      });
    }
    if (request.permission.windowEpoch !== request.windowEpoch) {
      context.addIssue({
        code: 'custom',
        path: ['permission', 'windowEpoch'],
        message: 'The permission is bound to another window epoch.',
      });
    }
    const paths = new Set<string>();
    let totalAfter = 0;
    for (const target of request.targets) {
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

/** Target state from `write-permission.ts` is reused; no parallel vocabulary. */
export const WRITE_EXECUTION_REJECTION_CODES = [
  'INVALID_REQUEST',
  'UNTRUSTED_SENDER',
  'BINDING_MISMATCH',
  'PROJECT_UNAVAILABLE',
  'CONTENT_MISMATCH',
] as const;

export const WriteExecutionRejectionCodeSchema = z.enum(
  WRITE_EXECUTION_REJECTION_CODES,
);

export type WriteExecutionRejectionCode = z.infer<
  typeof WriteExecutionRejectionCodeSchema
>;

/** Every code a result may carry: permission, write-time, or execution refusal. */
export const WriteExecutionCodeSchema = z.union([
  WriteChangeFailureCodeSchema,
  WriteRejectionCodeSchema,
  WriteExecutionRejectionCodeSchema,
]);

export type WriteExecutionCode = z.infer<typeof WriteExecutionCodeSchema>;

/**
 * How one target's bytes were checked after the attempt. `verified_after`
 * means a read-back matched the post-image; `failed` means verification ran
 * and did not match; `not_attempted` means no write happened. `verified_restored`
 * is reserved for the separate #20 recovery executor and is never produced by
 * the #19 write path, which preserves the scene instead of rolling back.
 */
export const WRITE_EXECUTION_VERIFICATIONS = [
  'verified_after',
  'verified_restored',
  'failed',
  'not_attempted',
] as const;

export const WriteExecutionVerificationSchema = z.enum(
  WRITE_EXECUTION_VERIFICATIONS,
);

export type WriteExecutionVerification = z.infer<
  typeof WriteExecutionVerificationSchema
>;

export const WriteExecutionTargetResultSchema = z
  .object({
    path: WriteTargetPathSchema,
    status: WriteTargetStatusSchema,
    code: WriteExecutionCodeSchema.nullable(),
    /** Bytes main actually read back, never the caller's claim. */
    observedSha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .nullable(),
    verification: WriteExecutionVerificationSchema,
  })
  .strict()
  .superRefine((result, context) => {
    if (
      result.verification === 'verified_after' &&
      result.status !== 'applied'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['verification'],
        message:
          'Only an applied target can be verified against its after hash.',
      });
    }
    if (
      result.verification === 'verified_restored' &&
      result.status !== 'restored'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['verification'],
        message:
          'Only a restored target can be verified against its pre-image.',
      });
    }
    if (result.status === 'applied' && result.observedSha256 === null) {
      context.addIssue({
        code: 'custom',
        path: ['observedSha256'],
        message: 'An applied target must report the hash it observed.',
      });
    }
  });

export type WriteExecutionTargetResult = z.infer<
  typeof WriteExecutionTargetResultSchema
>;

export const WRITE_EXECUTION_BATCH_VERIFICATIONS = [
  'verified',
  'failed',
  'not_attempted',
] as const;

export const WriteExecutionBatchVerificationSchema = z.enum(
  WRITE_EXECUTION_BATCH_VERIFICATIONS,
);

/** What the batch did to bytes that had already landed. The #19 write path
 * returns `not_needed`; `restored`/`incomplete` are reserved for #20 recovery. */
export const WRITE_EXECUTION_RESTORES = [
  'not_needed',
  'not_attempted',
  'restored',
  'incomplete',
] as const;

export const WriteExecutionRestoreSchema = z.enum(WRITE_EXECUTION_RESTORES);

/**
 * The executor's result before the IPC boundary stamps the run provenance.
 * `ok` is true only when every target was applied and its post-image was read
 * back byte-for-byte; nothing else may be presented as a completed change.
 */
export const WriteExecutionResultBaseSchema = z
  .object({
    version: z.literal(WRITE_EXECUTION_VERSION),
    ok: z.boolean(),
    status: WriteTargetStatusSchema,
    code: WriteExecutionCodeSchema.nullable(),
    /** The specific permission refusal, kept separate from the three vocabularies. */
    permissionCode: WritePermissionDenialCodeSchema.nullable(),
    targets: z
      .array(WriteExecutionTargetResultSchema)
      .max(WRITE_LIMITS.targets),
    verification: WriteExecutionBatchVerificationSchema,
    restore: WriteExecutionRestoreSchema,
    completedAt: z.iso.datetime(),
  })
  .strict();

export type WriteExecutionResultCore = z.infer<
  typeof WriteExecutionResultBaseSchema
>;

/**
 * Strict receipt returned to the caller: the executor result plus the Run whose
 * reviewed revision it belongs to, so success and failure stay traceable even
 * when the renderer only sees the final reply.
 */
export const WriteExecutionResultSchema = WriteExecutionResultBaseSchema.extend(
  {
    /** The Run the receipt belongs to; null only for a request that never ran. */
    runId: RunIdentitySchema.shape.runId.nullable(),
    revision: RunIdentitySchema.shape.revision.nullable(),
  },
)
  .strict()
  .superRefine((result, context) => {
    if (result.ok) {
      if (result.status !== 'applied') {
        context.addIssue({
          code: 'custom',
          path: ['status'],
          message: 'A successful result must be applied.',
        });
      }
      if (result.verification !== 'verified') {
        context.addIssue({
          code: 'custom',
          path: ['verification'],
          message: 'A successful result must be verified.',
        });
      }
      if (result.targets.length === 0) {
        context.addIssue({
          code: 'custom',
          path: ['targets'],
          message: 'A successful result must list the applied targets.',
        });
      }
      if (
        result.targets.some(
          (target) =>
            target.status !== 'applied' ||
            target.verification !== 'verified_after',
        )
      ) {
        context.addIssue({
          code: 'custom',
          path: ['targets'],
          message: 'A successful result may only contain verified targets.',
        });
      }
    }
  });

export type WriteExecutionResult = z.infer<typeof WriteExecutionResultSchema>;

/**
 * The permission modes this one-shot review entry offers.
 *
 * `read_only` is accepted so main can answer with the shared permission denial
 * code (`PERMISSION_READ_ONLY`) instead of the renderer pretending the mode was
 * never chosen. `workspace_write` is the only mode that can produce a review.
 *
 * `full_access` and `auto_review` are deliberately absent:
 * - `full_access` may write protected paths and its record is only legal with an
 *   explicit risk acknowledgement; a one-shot preview cannot record that
 *   acknowledgement honestly, so offering it would let the UI claim a grant the
 *   user never gave.
 * - `auto_review` exists to skip the per-change confirmation. This entry *is*
 *   the per-change confirmation, so exposing it would only let the review lie
 *   about who decided.
 * Both remain in the shared permission contract for the session-level selector
 * and are still enforced by `checkWritePermission`.
 */
export const WRITE_REVIEW_MODES = ['read_only', 'workspace_write'] as const;

export const WriteReviewModeSchema = z.enum(WRITE_REVIEW_MODES);

export type WriteReviewMode = z.infer<typeof WriteReviewModeSchema>;

/**
 * First stage of the one write channel: main reads the target from the
 * selected project and returns the exact request it is prepared to execute.
 * The renderer never authors the pre-image or the hashes.
 *
 * `runId` and `revision` bind the review to the completed run whose read it
 * came from; they are copied into the request so the journal records which run
 * touched a path. `mode` is limited to the two permission modes this entry can
 * honestly represent; see `WRITE_REVIEW_MODES`.
 */
export const WriteReviewPrepareSchema = z
  .object({
    action: z.literal('prepare'),
    sessionId: RunIdentitySchema.shape.sessionId,
    projectId: RunIdentitySchema.shape.projectId,
    runId: RunIdentitySchema.shape.runId,
    revision: RunIdentitySchema.shape.revision,
    targetPath: WriteTargetPathSchema,
    mode: WriteReviewModeSchema,
  })
  .strict();

export const WriteExecutionActionSchema = z
  .object({
    action: z.literal('execute'),
    request: WriteExecutionRequestSchema,
  })
  .strict();

/** The one narrow write channel accepts exactly these two fixed actions. */
export const WriteIpcRequestSchema = z.discriminatedUnion('action', [
  WriteReviewPrepareSchema,
  WriteExecutionActionSchema,
]);

export type WriteReviewPrepare = z.infer<typeof WriteReviewPrepareSchema>;
export type WriteExecutionAction = z.infer<typeof WriteExecutionActionSchema>;
export type WriteIpcRequest = z.infer<typeof WriteIpcRequestSchema>;

/**
 * Every code a prepare call may answer with. The permission denial codes are
 * reused verbatim so a `read_only` refusal is the same `PERMISSION_READ_ONLY`
 * the executor would produce, not a renderer-side euphemism.
 */
export const WRITE_REVIEW_DENIAL_CODES = [
  ...WRITE_EXECUTION_REJECTION_CODES,
  ...WritePermissionDenialCodeSchema.options,
  'TARGET_MISSING',
  'TARGET_NOT_REGULAR_FILE',
  'TARGET_LINK_NOT_ALLOWED',
  'TARGET_TOO_LARGE',
  'TARGET_UNREADABLE',
  'TARGET_UNSTABLE',
] as const;

export const WriteReviewDenialCodeSchema = z.enum(WRITE_REVIEW_DENIAL_CODES);

export type WriteReviewDenialCode = z.infer<typeof WriteReviewDenialCodeSchema>;

export const WriteReviewReplySchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      request: WriteExecutionRequestSchema,
      /** Exact pre-image text main read; the renderer only displays it. */
      beforePreview: z.string().max(WRITE_LIMITS.targetBytes),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      code: WriteReviewDenialCodeSchema,
    })
    .strict(),
]);

export type WriteReviewReply = z.infer<typeof WriteReviewReplySchema>;

/** Fixed preload surface; every call crosses the one write channel. */
export interface WriteDesktopApi {
  prepareWrite(request: WriteReviewPrepare): Promise<WriteReviewReply>;
  executeWrite(request: WriteExecutionAction): Promise<WriteExecutionResult>;
}

export type WriteExecutionTarget = z.infer<typeof WriteExecutionTargetSchema>;
export type WriteExecutionRequest = z.infer<typeof WriteExecutionRequestSchema>;

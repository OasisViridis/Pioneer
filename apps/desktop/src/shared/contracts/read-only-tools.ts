import { z } from 'zod';

/** The three read-only tools; the tuple feeds the wider harness vocabulary. */
export const READ_ONLY_TOOL_NAMES = [
  'read_file',
  'list_directory',
  'search_in_files',
] as const;

export const ReadOnlyToolNameSchema = z.enum(READ_ONLY_TOOL_NAMES);

export type ReadOnlyToolName = z.infer<typeof ReadOnlyToolNameSchema>;

/**
 * Every tool a Run may expose: the three reads plus the review-only write
 * proposal. The proposal cannot write; main turns it into a preview that a
 * person approves. Keeping one tuple keeps authorization, snapshots and the
 * capabilities panel from drifting on the tool list.
 */
export const HARNESS_TOOL_NAMES = [
  ...READ_ONLY_TOOL_NAMES,
  'propose_file_write',
] as const;

export const HarnessToolNameSchema = z.enum(HARNESS_TOOL_NAMES);

export type HarnessToolName = z.infer<typeof HarnessToolNameSchema>;

const path = z.string().min(1).max(1024);

export const ReadOnlyToolRequestSchema = z.discriminatedUnion('tool', [
  z
    .object({
      tool: z.literal('read_file'),
      arguments: z.object({ path }).strict(),
    })
    .strict(),
  z
    .object({
      tool: z.literal('list_directory'),
      arguments: z.object({ path }).strict(),
    })
    .strict(),
  z
    .object({
      tool: z.literal('search_in_files'),
      arguments: z.object({ path, query: z.string().min(1).max(256) }).strict(),
    })
    .strict(),
]);

export const ReadOnlyToolRejectionSchema = z
  .object({
    ok: z.literal(false),
    error: z
      .object({
        code: z.enum([
          'TOOL_NOT_ALLOWED',
          'INVALID_TOOL_REQUEST',
          'INVALID_PATH',
          'PROJECT_UNAVAILABLE',
          'PATH_UNAVAILABLE',
          'PATH_OUTSIDE_PROJECT',
          'LINK_NOT_ALLOWED',
          'PATH_TYPE_NOT_ALLOWED',
          'SENSITIVE_PATH',
        ]),
        message: z.string(),
        retryable: z.literal(false),
      })
      .strict(),
  })
  .strict();

export type ReadOnlyToolRequest = z.infer<typeof ReadOnlyToolRequestSchema>;
export type ReadOnlyToolRejection = z.infer<typeof ReadOnlyToolRejectionSchema>;

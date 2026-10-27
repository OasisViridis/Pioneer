import { z } from 'zod';

export const ReadOnlyToolNameSchema = z.enum([
  'read_file',
  'list_directory',
  'search_in_files',
]);

export type ReadOnlyToolName = z.infer<typeof ReadOnlyToolNameSchema>;

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

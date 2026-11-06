import { z } from 'zod';
import {
  ReadOnlyToolNameSchema,
  ReadOnlyToolRequestSchema,
} from './read-only-tools';

export const EditModeSchema = z.enum(['read_only', 'workspace_write']);
export type EditMode = z.infer<typeof EditModeSchema>;
export const EDIT_FILE_BYTES = 65_536;
const text = z
  .string()
  .max(EDIT_FILE_BYTES)
  .refine(
    (value) => new TextEncoder().encode(value).byteLength <= EDIT_FILE_BYTES,
  );
export const EditToolRequestSchema = z
  .object({
    tool: z.literal('edit_file'),
    arguments: z
      .object({
        path: z.string().min(1).max(1024),
        oldText: text.refine((value) => value.length > 0),
        newText: text,
      })
      .strict(),
  })
  .strict();
export const HarnessToolRequestSchema = z.union([
  ReadOnlyToolRequestSchema,
  EditToolRequestSchema,
]);
export const HarnessToolNameSchema = z.enum([
  ...ReadOnlyToolNameSchema.options,
  'edit_file',
]);
export type HarnessToolRequest = z.infer<typeof HarnessToolRequestSchema>;
export type EditToolRequest = z.infer<typeof EditToolRequestSchema>;

/** Actual writer receipt, separate from model prose and run cancellation. */
export const RunEditSchema = z
  .object({
    path: z.string().min(1).max(1024),
    before: text,
    after: text,
    state: z.enum(['pending', 'applied', 'not_applied', 'unverified']),
    code: z.string().max(64).nullable(),
  })
  .strict();
export type RunEdit = z.infer<typeof RunEditSchema>;

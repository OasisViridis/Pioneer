import { z } from 'zod';

/**
 * Explicit egress manifest (run contract §1/§4): a grant binds the exact files
 * whose content may be sent to the model. Reading a file is not permission to
 * send it; a tool result whose file is not listed is rejected before it can
 * reach the adapter.
 */

export const EGRESS_MATERIAL_LIMIT = 64;
export const EGRESS_FILE_BYTES = 65_536;
export const EGRESS_CANDIDATE_LIMIT = 200;

const relativePath = z.string().min(1).max(1024);

export const EgressMaterialSchema = z
  .object({
    path: relativePath,
    bytes: z.number().int().nonnegative().max(EGRESS_FILE_BYTES),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

export const EgressMaterialRequestSchema = z
  .object({ materials: z.array(relativePath).max(EGRESS_MATERIAL_LIMIT) })
  .strict();

export const EgressCandidateSchema = z
  .object({ path: relativePath, bytes: z.number().int().nonnegative() })
  .strict();

export const ListRunMaterialsRequestSchema = z
  .object({
    projectId: z.string().min(1).max(512),
  })
  .strict();

export const ListRunMaterialsReplySchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      materials: z.array(EgressCandidateSchema).max(EGRESS_CANDIDATE_LIMIT),
    })
    .strict(),
  z
    .object({ ok: z.literal(false), code: z.literal('INVALID_REQUEST') })
    .strict(),
]);

export type EgressMaterial = z.infer<typeof EgressMaterialSchema>;
export type EgressCandidate = z.infer<typeof EgressCandidateSchema>;
export type ListRunMaterialsRequest = z.infer<
  typeof ListRunMaterialsRequestSchema
>;
export type ListRunMaterialsReply = z.infer<typeof ListRunMaterialsReplySchema>;

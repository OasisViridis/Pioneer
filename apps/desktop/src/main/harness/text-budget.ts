import { RUN_LIMITS } from '../../shared/contracts/pioneer-run';

const textEncoder = new TextEncoder();

/** The protocol value every caller must chunk to; no second source of truth. */
export const TEXT_CHUNK_BYTES = RUN_LIMITS.textChunkBytes;

/**
 * Split text into ordered chunks whose UTF-8 byte length stays within the
 * protocol per-chunk budget. Boundaries only ever fall between code points, so
 * a multi-byte character is never halved. Empty input yields no chunks.
 */
export function splitTextChunks(text: string): string[] {
  const maxBytes = TEXT_CHUNK_BYTES;
  if (text.length === 0) return [];
  if (textEncoder.encode(text).byteLength <= maxBytes) return [text];
  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;
  for (const character of text) {
    const characterBytes = textEncoder.encode(character).byteLength;
    if (currentBytes > 0 && currentBytes + characterBytes > maxBytes) {
      chunks.push(current);
      current = '';
      currentBytes = 0;
    }
    current += character;
    currentBytes += characterBytes;
  }
  if (currentBytes > 0) chunks.push(current);
  return chunks;
}

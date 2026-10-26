import { RUN_LIMITS } from '../../shared/contracts/pioneer-run';

const textEncoder = new TextEncoder();

/**
 * Split text into ordered chunks whose UTF-8 byte length stays within the
 * protocol per-chunk budget. Boundaries only ever fall between code points, so
 * a multi-byte character is never halved. Empty input yields no chunks.
 */
export function splitTextChunks(
  text: string,
  maxBytes: number = RUN_LIMITS.textChunkBytes,
): string[] {
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

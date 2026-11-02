import { createHash } from 'node:crypto';

import type {
  WriteFileIdentity,
  WriteFileState,
} from '../../../shared/contracts/write-permission';

/**
 * Byte-level helpers shared by target observation and the pure decisions, so
 * the two paths cannot drift on what "same bytes" or "same file object" means.
 */

/** SHA-256 of the exact bytes; the only digest the contract trusts. */
export function sha256OfBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Both sides of a reviewed change are compared by length and digest. */
export function sameFileState(a: WriteFileState, b: WriteFileState): boolean {
  return a.bytes === b.bytes && a.sha256 === b.sha256;
}

/** Platform identity comparison; callers decide what a null side means. */
export function sameFileIdentity(
  a: WriteFileIdentity,
  b: WriteFileIdentity,
): boolean {
  return a.fileId === b.fileId && a.birthtimeMs === b.birthtimeMs;
}

import { open } from 'node:fs/promises';
import type { Stats } from 'node:fs';

/**
 * One read-only, bounded read with a stability proof.
 *
 * Callers must treat `buffer.subarray(0, bytesRead)` as the file content: the
 * buffer is allocated at `capacity`, and a short read is reported as UNSTABLE
 * rather than silently truncating the content. Both the egress manifest and
 * the write-approval observer depend on this single implementation so the two
 * safety paths cannot drift apart.
 */

export type BoundedReadFailure =
  'NOT_REGULAR_FILE' | 'LINK_NOT_ALLOWED' | 'TOO_LARGE' | 'UNSTABLE';

export class BoundedReadError extends Error {
  readonly code: BoundedReadFailure;

  constructor(code: BoundedReadFailure) {
    super(code);
    this.name = 'BoundedReadError';
    this.code = code;
  }
}

export interface BoundedRead {
  before: Stats;
  after: Stats;
  buffer: Buffer;
  bytesRead: number;
}

export interface BoundedReadHooks {
  /** Test seam: runs between the read and the closing stability check. */
  afterRead?: () => Promise<void>;
}

/**
 * Opens `absolutePath` read-only, reads at most `capacity` bytes, and rejects
 * unless the handle reports the same size, mtime and file index before and
 * after the read. Links and multi-link files are rejected before any read.
 */
export async function readStableFile(
  absolutePath: string,
  capacity: number,
  hooks: BoundedReadHooks = {},
): Promise<BoundedRead> {
  const handle = await open(absolutePath, 'r');
  try {
    const before = await handle.stat();
    if (!before.isFile()) throw new BoundedReadError('NOT_REGULAR_FILE');
    if (before.nlink !== 1) throw new BoundedReadError('LINK_NOT_ALLOWED');
    if (before.size > capacity) throw new BoundedReadError('TOO_LARGE');
    const buffer = Buffer.allocUnsafe(capacity);
    let bytesRead = 0;
    while (bytesRead < buffer.length) {
      const chunk = await handle.read(
        buffer,
        bytesRead,
        buffer.length - bytesRead,
        bytesRead,
      );
      if (chunk.bytesRead === 0) break;
      bytesRead += chunk.bytesRead;
    }
    await hooks.afterRead?.();
    const after = await handle.stat();
    if (
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ino !== before.ino ||
      bytesRead !== before.size
    ) {
      throw new BoundedReadError('UNSTABLE');
    }
    return { before, after, buffer, bytesRead };
  } finally {
    await handle.close().catch(() => undefined);
  }
}

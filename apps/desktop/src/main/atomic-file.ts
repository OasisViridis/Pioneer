import { randomUUID } from 'node:crypto';
import { rename, unlink, writeFile } from 'node:fs/promises';

/**
 * Writes a whole file through a uniquely named temporary sibling and renames
 * it into place. A reader never sees half a file, and a link that already sits
 * at the target path is replaced rather than followed, so a pre-planted link
 * cannot catch the write.
 */
export async function writeFileAtomic(
  filePath: string,
  content: string,
): Promise<void> {
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, content, { encoding: 'utf-8', flag: 'wx' });
    await rename(temporaryPath, filePath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

import { createHash } from 'node:crypto';
import { lstat, open, opendir, realpath } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

import {
  EGRESS_CANDIDATE_LIMIT,
  EGRESS_FILE_BYTES,
  EGRESS_MATERIAL_LIMIT,
  type EgressCandidate,
  type EgressMaterial,
} from '../../shared/contracts/egress';
import { isPathInsideRoot, normalizeRootPath } from '../catalog/path-policy';
import { isSensitiveEntryName } from './read-only-tool-policy';

/**
 * Builds the explicit egress manifest bound to a run grant. Every selected
 * path must resolve inside the project, be a single-link regular file, be at
 * most the read budget, and contain no sensitive name component. The manifest
 * records the exact bytes as SHA-256 so a later change invalidates it.
 */

export class EgressMaterialError extends Error {
  readonly code: 'INVALID_REQUEST' | 'MATERIAL_NOT_ALLOWED';

  constructor(code: 'INVALID_REQUEST' | 'MATERIAL_NOT_ALLOWED') {
    super(code);
    this.name = 'EgressMaterialError';
    this.code = code;
  }
}

function normalizeRelative(value: string): string | null {
  const normalized = value.replaceAll('\\', '/');
  if (normalized.length === 0 || normalized.startsWith('/')) return null;
  const segments = normalized.split('/');
  if (
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === '.' ||
        segment === '..' ||
        segment.includes(':'),
    )
  )
    return null;
  return segments.join('/');
}

function hasSensitiveSegment(relativePath: string): boolean {
  return relativePath
    .split('/')
    .some((segment) => isSensitiveEntryName(segment));
}

async function readBounded(
  absolutePath: string,
  capacity: number,
): Promise<{ buffer: Buffer; bytesRead: number; size: number }> {
  const handle = await open(absolutePath, 'r');
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.nlink !== 1)
      throw new EgressMaterialError('INVALID_REQUEST');
    if (before.size > capacity)
      throw new EgressMaterialError('INVALID_REQUEST');
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
    const after = await handle.stat();
    if (
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ino !== before.ino
    )
      throw new EgressMaterialError('MATERIAL_NOT_ALLOWED');
    return { buffer, bytesRead, size: before.size };
  } finally {
    await handle.close();
  }
}

/** Rejects traversal, links, sensitive names, oversized files and unstable bytes. */
export async function buildEgressManifest(
  projectRoot: string,
  requestedPaths: readonly string[],
): Promise<EgressMaterial[]> {
  if (requestedPaths.length > EGRESS_MATERIAL_LIMIT)
    throw new EgressMaterialError('INVALID_REQUEST');
  const root = normalizeRootPath(projectRoot);
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory()) throw new EgressMaterialError('INVALID_REQUEST');
  const seen = new Set<string>();
  const materials: EgressMaterial[] = [];
  for (const value of requestedPaths) {
    const relativePath = normalizeRelative(value);
    if (relativePath === null || seen.has(relativePath))
      throw new EgressMaterialError('INVALID_REQUEST');
    seen.add(relativePath);
    if (hasSensitiveSegment(relativePath))
      throw new EgressMaterialError('MATERIAL_NOT_ALLOWED');
    // Reject a link anywhere on the selected path, including ancestor
    // directories: a manifest entry must name a real file inside the project.
    let cursor = root;
    for (const segment of relativePath.split('/')) {
      cursor = join(cursor, segment);
      let part;
      try {
        part = await lstat(cursor);
      } catch {
        throw new EgressMaterialError('INVALID_REQUEST');
      }
      if (part.isSymbolicLink())
        throw new EgressMaterialError('MATERIAL_NOT_ALLOWED');
    }
    let absolutePath: string;
    try {
      absolutePath = await realpath(resolve(root, relativePath));
    } catch {
      throw new EgressMaterialError('INVALID_REQUEST');
    }
    if (!isPathInsideRoot(root, absolutePath))
      throw new EgressMaterialError('MATERIAL_NOT_ALLOWED');
    const stats = await lstat(absolutePath);
    if (!stats.isFile() || stats.nlink !== 1)
      throw new EgressMaterialError('INVALID_REQUEST');
    if (stats.size > EGRESS_FILE_BYTES)
      throw new EgressMaterialError('INVALID_REQUEST');
    let read: Awaited<ReturnType<typeof readBounded>>;
    try {
      read = await readBounded(absolutePath, EGRESS_FILE_BYTES);
    } catch (error) {
      if (error instanceof EgressMaterialError) throw error;
      throw new EgressMaterialError('INVALID_REQUEST');
    }
    if (read.bytesRead !== read.size)
      throw new EgressMaterialError('MATERIAL_NOT_ALLOWED');
    materials.push({
      path: relativePath,
      bytes: read.bytesRead,
      sha256: createHash('sha256')
        .update(read.buffer.subarray(0, read.bytesRead))
        .digest('hex'),
    });
  }
  return materials;
}

/** Bounded candidate list for the renderer's explicit material picker. */
export async function listProjectMaterials(
  projectRoot: string,
): Promise<EgressCandidate[]> {
  const root = normalizeRootPath(projectRoot);
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory()) return [];
  const candidates: EgressCandidate[] = [];
  const walk = async (directory: string, depth: number): Promise<void> => {
    if (depth > 8 || candidates.length >= EGRESS_CANDIDATE_LIMIT) return;
    const handle = await opendir(directory);
    try {
      for await (const entry of handle) {
        if (candidates.length >= EGRESS_CANDIDATE_LIMIT) break;
        if (isSensitiveEntryName(entry.name)) continue;
        const absolutePath = join(directory, entry.name);
        let stats;
        try {
          stats = await lstat(absolutePath);
        } catch {
          continue;
        }
        if (stats.isSymbolicLink()) continue;
        if (stats.isDirectory()) {
          await walk(absolutePath, depth + 1);
          continue;
        }
        if (!stats.isFile() || stats.nlink !== 1) continue;
        if (stats.size > EGRESS_FILE_BYTES) continue;
        let canonical: string;
        try {
          canonical = await realpath(absolutePath);
        } catch {
          continue;
        }
        if (!isPathInsideRoot(root, canonical)) continue;
        candidates.push({
          path: relative(root, absolutePath).split('\\').join('/'),
          bytes: stats.size,
        });
      }
    } finally {
      await handle.close().catch(() => undefined);
    }
  };
  await walk(root, 0);
  return candidates.sort((left, right) => left.path.localeCompare(right.path));
}

/** Hash check used before a tool result is allowed to leave main. */
export function materialMatches(
  entry: EgressMaterial,
  content: Buffer,
): boolean {
  return (
    content.length === entry.bytes &&
    createHash('sha256').update(content).digest('hex') === entry.sha256
  );
}

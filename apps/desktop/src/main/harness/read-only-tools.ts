import type { Stats } from 'node:fs';
import { lstat, open, opendir, readdir, realpath } from 'node:fs/promises';
import { join, relative } from 'node:path';

import type { RunEventBody } from '../../shared/contracts/pioneer-run';
import type { EgressMaterial } from '../../shared/contracts/egress';
import type { ReadOnlyToolRequest } from '../../shared/contracts/read-only-tools';
import { isPathInsideRoot, normalizeRootPath } from '../catalog/path-policy';
import { materialMatches } from './egress-materials';
import { checkReadOnlyToolRequest } from './read-only-tool-policy';
import { isSensitiveEntryName } from './read-only-tool-policy';
import { TEXT_CHUNK_BYTES } from './text-budget';

/**
 * Executes the three read-only tools against main's project root with the
 * run contract §5 budgets: read_file 64 KiB, list_directory 200 entries,
 * search literal/depth16/1000 files/64 KiB per file/4 MiB total/100 hits.
 * Files are read through one bounded read-only handle, and every entry a list
 * or walk would publish is rechecked at the point of use; a changed identity
 * suppresses the result instead of publishing stale data.
 */

export const TOOL_BUDGETS = Object.freeze({
  readFileBytes: 65_536,
  listEntries: 200,
  searchDepth: 16,
  searchFiles: 1_000,
  searchFileBytes: 65_536,
  searchTotalBytes: 4_194_304,
  searchHits: 100,
  resultTextBytes: TEXT_CHUNK_BYTES,
});

export type ToolOutcome = Extract<
  RunEventBody,
  { type: 'tool.result' }
>['result'];

/**
 * Main-only observation hook (Issue #17): the executor reports which approved
 * material it actually read or found changed, so the context panel can show
 * provenance without the event wire reflecting arguments.
 */
export interface ToolMaterialObserver {
  onMaterial?: (
    path: string,
    state: 'read' | 'scanned' | 'changed' | 'unreadable',
  ) => void;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: false });

function bytesOf(value: string): number {
  return encoder.encode(value).byteLength;
}

/** Wire projection: at most 4 KiB of safe text with an explicit truncated flag. */
function projectText(full: string): { text: string; truncated: boolean } {
  if (bytesOf(full) <= TOOL_BUDGETS.resultTextBytes)
    return { text: full, truncated: false };
  let cut = full.length;
  while (
    cut > 0 &&
    bytesOf(full.slice(0, cut)) > TOOL_BUDGETS.resultTextBytes
  ) {
    cut = Math.floor(cut / 2);
  }
  return { text: full.slice(0, cut), truncated: true };
}

function isBinaryContent(buffer: Buffer): boolean {
  const probe = buffer.subarray(0, 8_192);
  return probe.includes(0);
}

function sameIdentity(a: Stats, b: Stats): boolean {
  return a.size === b.size && a.mtimeMs === b.mtimeMs && a.ino === b.ino;
}

interface BoundedRead {
  before: Stats;
  after: Stats;
  buffer: Buffer;
  bytesRead: number;
}

/**
 * Reads at most `capacity` bytes through one read-only handle so a huge file
 * is never materialized. Callers use the handle metadata to detect truncation.
 */
async function readBoundedFile(
  absolutePath: string,
  capacity: number,
): Promise<BoundedRead> {
  const handle = await open(absolutePath, 'r');
  try {
    const before = await handle.stat();
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
    return { before, after, buffer, bytesRead };
  } finally {
    await handle.close();
  }
}

type EntryKind = 'file' | 'directory';

/**
 * Rechecks one traversal entry at the point of use. Any failure is a silent
 * skip, matching the sensitive-name filter: links, aliases resolving outside
 * the root, hard-linked files and non-regular entries are never published.
 */
async function recheckEntry(
  root: string,
  absolutePath: string,
): Promise<EntryKind | null> {
  try {
    const stats = await lstat(absolutePath);
    if (stats.isSymbolicLink()) return null;
    if (!isPathInsideRoot(root, await realpath(absolutePath))) return null;
    if (stats.isDirectory()) return 'directory';
    if (stats.isFile() && stats.nlink === 1) return 'file';
    return null;
  } catch {
    return null;
  }
}

export async function executeReadOnlyTool(
  projectRoot: string,
  request: ReadOnlyToolRequest,
  signal: AbortSignal,
  materials?: readonly EgressMaterial[],
  observer?: ToolMaterialObserver,
): Promise<ToolOutcome> {
  const preflight = await checkReadOnlyToolRequest(projectRoot, request);
  if (!preflight.ok) return { status: 'rejected', code: preflight.error.code };
  const root = normalizeRootPath(projectRoot);
  const absolutePath = preflight.value.absolutePath;
  // Absent means the legacy direct-executor path; an explicit manifest (even
  // empty) is enforced. Main always passes the grant's manifest.
  const allow =
    materials === undefined
      ? null
      : new Map(materials.map((material) => [material.path, material]));
  try {
    switch (request.tool) {
      case 'read_file':
        return await readTextFile(root, absolutePath, signal, allow, observer);
      case 'list_directory':
        return await listDirectory(root, absolutePath, signal, allow);
      case 'search_in_files':
        return await searchInFiles(
          root,
          absolutePath,
          request.arguments.query,
          signal,
          allow,
          observer,
        );
    }
  } catch {
    if (signal.aborted) return { status: 'cancelled', code: 'CANCELLED' };
    return { status: 'failed', code: 'TOOL_FAILED' };
  }
}

function relativePathOf(root: string, absolutePath: string): string {
  return relative(root, absolutePath).split('\\').join('/');
}

function allowHasUnder(
  allow: ReadonlyMap<string, EgressMaterial>,
  prefix: string,
): boolean {
  for (const path of allow.keys()) {
    if (path.startsWith(prefix)) return true;
  }
  return false;
}

async function readTextFile(
  root: string,
  absolutePath: string,
  signal: AbortSignal,
  allow: ReadonlyMap<string, EgressMaterial> | null,
  observer?: ToolMaterialObserver,
): Promise<ToolOutcome> {
  const read = await readBoundedFile(
    absolutePath,
    TOOL_BUDGETS.readFileBytes + 1,
  );
  if (signal.aborted) return { status: 'cancelled', code: 'CANCELLED' };
  if (!sameIdentity(read.before, read.after))
    return { status: 'failed', code: 'TOOL_FAILED' };
  if (!read.before.isFile())
    return { status: 'rejected', code: 'PATH_TYPE_NOT_ALLOWED' };
  if (read.before.nlink !== 1)
    return { status: 'rejected', code: 'LINK_NOT_ALLOWED' };
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || !isPathInsideRoot(root, absolutePath))
    return { status: 'failed', code: 'TOOL_FAILED' };
  const truncatedByBudget =
    read.bytesRead > TOOL_BUDGETS.readFileBytes ||
    read.before.size > TOOL_BUDGETS.readFileBytes;
  const bounded = read.buffer.subarray(0, read.bytesRead);
  if (isBinaryContent(bounded))
    return { status: 'rejected', code: 'PATH_TYPE_NOT_ALLOWED' };
  if (allow !== null) {
    const entry = allow.get(relativePathOf(root, absolutePath));
    if (entry === undefined || truncatedByBudget)
      return { status: 'rejected', code: 'MATERIAL_NOT_ALLOWED' };
    // The manifest binds exact bytes: a file edited after authorization must
    // not be sent under the old approval, and the stale grant is revoked.
    if (!materialMatches(entry, bounded))
      return { status: 'rejected', code: 'CONTENT_NOT_ALLOWED' };
    observer?.onMaterial?.(entry.path, 'read');
  }
  const decoded = decoder.decode(
    truncatedByBudget
      ? bounded.subarray(0, TOOL_BUDGETS.readFileBytes)
      : bounded,
  );
  const projected = projectText(decoded);
  return {
    status: 'succeeded',
    text: projected.text,
    truncated: projected.truncated || truncatedByBudget,
  };
}

async function listDirectory(
  root: string,
  absolutePath: string,
  signal: AbortSignal,
  allow: ReadonlyMap<string, EgressMaterial> | null,
): Promise<ToolOutcome> {
  if (allow !== null) {
    const relativeDirectory = relativePathOf(root, absolutePath);
    if (
      allow.size === 0 ||
      (relativeDirectory.length > 0 &&
        !allowHasUnder(allow, `${relativeDirectory}/`))
    )
      return { status: 'rejected', code: 'MATERIAL_NOT_ALLOWED' };
  }
  // Stream the directory so an enormous listing stops after the first 201
  // candidates instead of materialising every name.
  const directory = await opendir(absolutePath);
  const names: string[] = [];
  let truncated = false;
  try {
    for await (const entry of directory) {
      if (names.length > TOOL_BUDGETS.listEntries) {
        truncated = true;
        break;
      }
      if (signal.aborted) return { status: 'cancelled', code: 'CANCELLED' };
      if (isSensitiveEntryName(entry.name)) continue;
      const checked = await recheckEntry(root, join(absolutePath, entry.name));
      if (checked === null) continue;
      if (allow !== null) {
        const relativeDirectory = relativePathOf(root, absolutePath);
        const child = `${relativeDirectory.length > 0 ? `${relativeDirectory}/` : ''}${entry.name}`;
        if (checked === 'directory') {
          if (!allowHasUnder(allow, `${child}/`)) continue;
        } else if (!allow.has(child)) {
          continue;
        }
      }
      names.push(checked === 'directory' ? `${entry.name}/` : entry.name);
    }
  } finally {
    await directory.close().catch(() => undefined);
  }
  names.sort((a, b) => a.localeCompare(b));
  if (names.length > TOOL_BUDGETS.listEntries) {
    names.length = TOOL_BUDGETS.listEntries;
    truncated = true;
  }
  const after = await lstat(root);
  if (!after.isDirectory() || !isPathInsideRoot(root, absolutePath))
    return { status: 'failed', code: 'TOOL_FAILED' };
  const projected = projectText(names.join('\n'));
  return {
    status: 'succeeded',
    text: projected.text,
    truncated: projected.truncated || truncated,
  };
}

interface SearchBudget {
  files: number;
  totalBytes: number;
  hits: number;
}

async function searchInFiles(
  root: string,
  startPath: string,
  query: string,
  signal: AbortSignal,
  allow: ReadonlyMap<string, EgressMaterial> | null,
  observer?: ToolMaterialObserver,
): Promise<ToolOutcome> {
  const budget: SearchBudget = { files: 0, totalBytes: 0, hits: 0 };
  const lines: string[] = [];
  const changedMaterials: string[] = [];
  let truncated = false;
  const rootRelative = (value: string): string =>
    relative(root, value).split('\\').join('/');

  const searchFile = async (absolutePath: string): Promise<void> => {
    const relativePath = rootRelative(absolutePath);
    if (allow !== null && !allow.has(relativePath)) return;
    if (
      budget.files >= TOOL_BUDGETS.searchFiles ||
      budget.hits >= TOOL_BUDGETS.searchHits ||
      budget.totalBytes >= TOOL_BUDGETS.searchTotalBytes
    ) {
      truncated = true;
      return;
    }
    if ((await recheckEntry(root, absolutePath)) !== 'file') return;
    let read: BoundedRead;
    try {
      read = await readBoundedFile(absolutePath, TOOL_BUDGETS.searchFileBytes);
    } catch {
      return;
    }
    if (signal.aborted) throw new Error('ABORTED');
    budget.totalBytes += read.bytesRead;
    // A bounded prefix still gets published only while the handle identity is
    // stable; a swap while reading suppresses this file instead of its bytes.
    if (
      read.before.size > TOOL_BUDGETS.searchFileBytes ||
      read.after.size > TOOL_BUDGETS.searchFileBytes
    )
      truncated = true;
    if (!sameIdentity(read.before, read.after)) return;
    if (!read.before.isFile() || read.before.nlink !== 1) return;
    const prefix = read.buffer.subarray(0, read.bytesRead);
    if (allow !== null) {
      const entry = allow.get(relativePath);
      if (
        entry === undefined ||
        read.before.size > TOOL_BUDGETS.searchFileBytes ||
        !materialMatches(entry, prefix)
      ) {
        // The approval covered the bytes at authorization time. A changed file
        // rejects the search instead of quietly publishing its new content.
        changedMaterials.push(relativePath);
        observer?.onMaterial?.(relativePath, 'changed');
        return;
      }
    }
    budget.files += 1;
    if (isBinaryContent(prefix)) {
      // A binary file never reaches the text scan, so it is not "scanned":
      // record the reason instead of implying that its content was searched.
      if (allow !== null) observer?.onMaterial?.(relativePath, 'unreadable');
      return;
    }
    if (allow !== null) observer?.onMaterial?.(relativePath, 'scanned');
    const text = decoder.decode(prefix);
    let lineNumber = 0;
    for (const line of text.split('\n')) {
      lineNumber++;
      if (budget.hits >= TOOL_BUDGETS.searchHits) {
        truncated = true;
        return;
      }
      if (line.includes(query)) {
        budget.hits++;
        const trimmed = line.trim().slice(0, 200);
        lines.push(
          `${rootRelative(absolutePath)}:${String(lineNumber)}: ${trimmed}`,
        );
      }
    }
  };

  const walk = async (directory: string, depth: number): Promise<void> => {
    if (depth > TOOL_BUDGETS.searchDepth) {
      truncated = true;
      return;
    }
    if ((await recheckEntry(root, directory)) !== 'directory') return;
    const entries = await readdir(directory);
    if (signal.aborted) return;
    for (const name of entries) {
      if (
        budget.hits >= TOOL_BUDGETS.searchHits ||
        budget.files >= TOOL_BUDGETS.searchFiles ||
        budget.totalBytes >= TOOL_BUDGETS.searchTotalBytes
      ) {
        truncated = true;
        return;
      }
      if (isSensitiveEntryName(name)) continue;
      const child = join(directory, name);
      const relativeChild = rootRelative(child);
      if (
        allow !== null &&
        !allow.has(relativeChild) &&
        !allowHasUnder(allow, `${relativeChild}/`)
      )
        continue;
      const checked = await recheckEntry(root, child);
      if (checked === null) continue;
      if (checked === 'directory') await walk(child, depth + 1);
      else await searchFile(child);
    }
  };

  if (allow !== null && allow.size === 0)
    return { status: 'rejected', code: 'MATERIAL_NOT_ALLOWED' };
  if (allow !== null) {
    const relativeStart = rootRelative(startPath);
    const startAllowed =
      allow.has(relativeStart) ||
      allowHasUnder(allow, `${relativeStart}/`) ||
      relativeStart.length === 0;
    if (!startAllowed)
      return { status: 'rejected', code: 'MATERIAL_NOT_ALLOWED' };
  }
  const start = await recheckEntry(root, startPath);
  if (start === null) return { status: 'failed', code: 'TOOL_FAILED' };
  if (start === 'directory') await walk(startPath, 0);
  else await searchFile(startPath);

  if (changedMaterials.length > 0)
    return { status: 'rejected', code: 'CONTENT_NOT_ALLOWED' };
  const after = await lstat(root);
  if (!after.isDirectory()) return { status: 'failed', code: 'TOOL_FAILED' };
  const projected = projectText(lines.join('\n'));
  return {
    status: 'succeeded',
    text: projected.text,
    truncated: projected.truncated || truncated,
  };
}

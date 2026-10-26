import type { Stats } from 'node:fs';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { join, relative } from 'node:path';

import {
  RUN_LIMITS,
  type RunEventBody,
} from '../../shared/contracts/pioneer-run';
import type { ReadOnlyToolRequest } from '../../shared/contracts/read-only-tools';
import { isPathInsideRoot, normalizeRootPath } from '../catalog/path-policy';
import { checkReadOnlyToolRequest } from './read-only-tool-policy';
import { isSensitiveEntryName } from './read-only-tool-policy';

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
  resultTextBytes: RUN_LIMITS.textChunkBytes,
});

export type ToolOutcome = Extract<
  RunEventBody,
  { type: 'tool.result' }
>['result'];

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

interface EntryIdentity {
  size: number;
  mtimeMs: number;
  ino: number;
}

function sameIdentity(a: EntryIdentity, b: EntryIdentity): boolean {
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
): Promise<ToolOutcome> {
  const preflight = await checkReadOnlyToolRequest(projectRoot, request);
  if (!preflight.ok) return { status: 'rejected', code: preflight.error.code };
  const root = normalizeRootPath(projectRoot);
  const absolutePath = preflight.value.absolutePath;
  try {
    switch (request.tool) {
      case 'read_file':
        return await readTextFile(root, absolutePath, signal);
      case 'list_directory':
        return await listDirectory(root, absolutePath, signal);
      case 'search_in_files':
        return await searchInFiles(
          root,
          absolutePath,
          request.arguments.query,
          signal,
        );
    }
  } catch {
    if (signal.aborted) return { status: 'cancelled', code: 'CANCELLED' };
    return { status: 'failed', code: 'TOOL_FAILED' };
  }
}

async function readTextFile(
  root: string,
  absolutePath: string,
  signal: AbortSignal,
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
): Promise<ToolOutcome> {
  const entries = await readdir(absolutePath);
  if (signal.aborted) return { status: 'cancelled', code: 'CANCELLED' };
  const names: string[] = [];
  let truncated = false;
  for (const name of entries) {
    if (names.length > TOOL_BUDGETS.listEntries) {
      truncated = true;
      break;
    }
    if (isSensitiveEntryName(name)) continue;
    const checked = await recheckEntry(root, join(absolutePath, name));
    if (checked === null) continue;
    names.push(checked === 'directory' ? `${name}/` : name);
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
): Promise<ToolOutcome> {
  const budget: SearchBudget = { files: 0, totalBytes: 0, hits: 0 };
  const lines: string[] = [];
  let truncated = false;
  const rootRelative = (value: string): string =>
    relative(root, value).split('\\').join('/');

  const searchFile = async (absolutePath: string): Promise<void> => {
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
    budget.files += 1;
    const prefix = read.buffer.subarray(0, read.bytesRead);
    if (isBinaryContent(prefix)) return;
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
      const checked = await recheckEntry(root, child);
      if (checked === null) continue;
      if (checked === 'directory') await walk(child, depth + 1);
      else await searchFile(child);
    }
  };

  const start = await recheckEntry(root, startPath);
  if (start === null) return { status: 'failed', code: 'TOOL_FAILED' };
  if (start === 'directory') await walk(startPath, 0);
  else await searchFile(startPath);

  const after = await lstat(root);
  if (!after.isDirectory()) return { status: 'failed', code: 'TOOL_FAILED' };
  const projected = projectText(lines.join('\n'));
  return {
    status: 'succeeded',
    text: projected.text,
    truncated: projected.truncated || truncated,
  };
}

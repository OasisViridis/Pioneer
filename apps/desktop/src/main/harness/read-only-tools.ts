import { lstat, readdir, readFile } from 'node:fs/promises';
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
 * Every path is rechecked through the #11 preflight before and after IO;
 * a changed identity suppresses the result instead of publishing stale data.
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

async function entryIdentity(absolutePath: string): Promise<EntryIdentity> {
  const stats = await lstat(absolutePath);
  return { size: stats.size, mtimeMs: stats.mtimeMs, ino: stats.ino };
}

function sameIdentity(a: EntryIdentity, b: EntryIdentity): boolean {
  return a.size === b.size && a.mtimeMs === b.mtimeMs && a.ino === b.ino;
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
  const before = await entryIdentity(absolutePath);
  const buffer = await readFile(absolutePath, { signal });
  if (signal.aborted) return { status: 'cancelled', code: 'CANCELLED' };
  const after = await entryIdentity(absolutePath);
  if (!sameIdentity(before, after))
    return { status: 'failed', code: 'TOOL_FAILED' };
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || !isPathInsideRoot(root, absolutePath))
    return { status: 'failed', code: 'TOOL_FAILED' };
  if (isBinaryContent(buffer))
    return { status: 'rejected', code: 'PATH_TYPE_NOT_ALLOWED' };
  const bounded = buffer.subarray(0, TOOL_BUDGETS.readFileBytes + 1);
  const truncatedByBudget = bounded.length > TOOL_BUDGETS.readFileBytes;
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
  const entries = await readdir(absolutePath, { withFileTypes: true });
  if (signal.aborted) return { status: 'cancelled', code: 'CANCELLED' };
  const names: string[] = [];
  let truncated = false;
  for (const entry of entries) {
    if (isSensitiveEntryName(entry.name)) continue;
    if (entry.isSymbolicLink()) continue;
    names.push(entry.isDirectory() ? `${entry.name}/` : entry.name);
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
    let stats;
    try {
      stats = await lstat(absolutePath);
    } catch {
      return;
    }
    if (stats.isSymbolicLink() || !stats.isFile() || stats.nlink !== 1) return;
    if (stats.size > TOOL_BUDGETS.searchFileBytes) {
      truncated = true;
      return;
    }
    budget.files++;
    const content = await readFile(absolutePath, { signal });
    budget.totalBytes += content.length;
    if (isBinaryContent(content)) return;
    const text = decoder.decode(content);
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
    const entries = await readdir(directory, { withFileTypes: true });
    if (signal.aborted) return;
    for (const entry of entries) {
      if (
        budget.hits >= TOOL_BUDGETS.searchHits ||
        budget.files >= TOOL_BUDGETS.searchFiles ||
        budget.totalBytes >= TOOL_BUDGETS.searchTotalBytes
      ) {
        truncated = true;
        return;
      }
      if (isSensitiveEntryName(entry.name)) continue;
      if (entry.isSymbolicLink()) continue;
      const child = join(directory, entry.name);
      if (!isPathInsideRoot(root, child)) continue;
      if (entry.isDirectory()) await walk(child, depth + 1);
      else if (entry.isFile()) await searchFile(child);
    }
  };

  const start = await lstat(startPath);
  if (start.isDirectory()) await walk(startPath, 0);
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

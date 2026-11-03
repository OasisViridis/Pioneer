/**
 * P4-A (#19) line diff for a proposed `replace_file`.
 *
 * The preview is the only thing a person reviews before a write, so this module
 * never truncates: it either returns the complete unified diff or `null` when
 * the text would exceed the caller's byte budget. A capped edit distance falls
 * back to one complete remove-and-add block, which is still a full diff.
 *
 * Only `main` builds this text. The renderer receives it as data; a model's own
 * summary of its change is never used as the Diff.
 */

export interface UnifiedDiffOptions {
  /** Unchanged lines kept on each side of a hunk (default 3). */
  contextLines?: number;
  /** Refuse (return null) when the rendered diff exceeds this many bytes. */
  maxBytes?: number;
  /** Search cap for Myers; exceeded means a complete remove/add fallback. */
  maxEditDistance?: number;
}

export interface UnifiedDiff {
  path: string;
  text: string;
  added: number;
  removed: number;
}

interface Edit {
  op: 'equal' | 'delete' | 'insert';
  line: string;
}

const DEFAULT_CONTEXT = 3;
const DEFAULT_MAX_BYTES = 4_194_304;
const DEFAULT_MAX_EDIT_DISTANCE = 2_000;

/** Splits text into lines that keep their terminator, so CRLF is not folded. */
function splitLines(value: string): string[] {
  const lines: string[] = [];
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '\n') {
      lines.push(value.slice(start, index + 1));
      start = index + 1;
    }
  }
  if (start < value.length) lines.push(value.slice(start));
  return lines;
}

/**
 * Myers' O(ND) shortest edit script with a distance cap. Returns null when the
 * script would need more than `maxEditDistance` edits, so the caller can fall
 * back to a complete block instead of spending unbounded time.
 */
function myersEdits(
  before: readonly string[],
  after: readonly string[],
  maxEditDistance: number,
): Edit[] | null {
  const oldCount = before.length;
  const newCount = after.length;
  const cap = Math.min(oldCount + newCount, maxEditDistance);
  const offset = cap + 1;
  const furthest = new Array<number>(2 * cap + 3).fill(0);
  const trace: number[][] = [];

  for (let distance = 0; distance <= cap; distance += 1) {
    trace.push([...furthest]);
    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      const down = furthest[diagonal + 1 + offset] ?? 0;
      const right = furthest[diagonal - 1 + offset] ?? 0;
      let oldIndex: number;
      if (diagonal === -distance || (diagonal !== distance && right < down)) {
        oldIndex = down;
      } else {
        oldIndex = right + 1;
      }
      let newIndex = oldIndex - diagonal;
      while (
        oldIndex < oldCount &&
        newIndex < newCount &&
        before[oldIndex] === after[newIndex]
      ) {
        oldIndex += 1;
        newIndex += 1;
      }
      furthest[diagonal + offset] = oldIndex;
      if (oldIndex >= oldCount && newIndex >= newCount) {
        return backtrack(trace, before, after, distance, offset);
      }
    }
  }
  return null;
}

/** Walks the stored frontier to recover the edit script in source order. */
function backtrack(
  trace: readonly number[][],
  before: readonly string[],
  after: readonly string[],
  distance: number,
  offset: number,
): Edit[] {
  const edits: Edit[] = [];
  let oldIndex = before.length;
  let newIndex = after.length;
  for (let depth = distance; depth >= 0; depth -= 1) {
    const furthest = trace[depth];
    if (furthest === undefined) break;
    const diagonal = oldIndex - newIndex;
    const down = furthest[diagonal + 1 + offset] ?? 0;
    const right = furthest[diagonal - 1 + offset] ?? 0;
    let previousDiagonal: number;
    if (diagonal === -depth || (diagonal !== depth && right < down)) {
      previousDiagonal = diagonal + 1;
    } else {
      previousDiagonal = diagonal - 1;
    }
    const previousOld = furthest[previousDiagonal + offset] ?? 0;
    const previousNew = previousOld - previousDiagonal;
    while (oldIndex > previousOld && newIndex > previousNew) {
      oldIndex -= 1;
      newIndex -= 1;
      edits.push({ op: 'equal', line: before[oldIndex] ?? '' });
    }
    if (depth === 0) break;
    if (oldIndex === previousOld) {
      newIndex -= 1;
      edits.push({ op: 'insert', line: after[newIndex] ?? '' });
    } else {
      oldIndex -= 1;
      edits.push({ op: 'delete', line: before[oldIndex] ?? '' });
    }
  }
  return edits.reverse();
}

function diffEdits(
  before: readonly string[],
  after: readonly string[],
  maxEditDistance: number,
): Edit[] {
  // Trim the unchanged prefix and suffix first: it shrinks the search and keeps
  // hunks focused, without losing any line from the reported diff.
  let prefix = 0;
  while (
    prefix < before.length &&
    prefix < after.length &&
    before[prefix] === after[prefix]
  ) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const edits: Edit[] = [];
  for (let index = 0; index < prefix; index += 1) {
    edits.push({ op: 'equal', line: before[index] ?? '' });
  }
  const middleBefore = before.slice(prefix, before.length - suffix);
  const middleAfter = after.slice(prefix, after.length - suffix);
  const middle =
    middleBefore.length === 0 && middleAfter.length === 0
      ? []
      : myersEdits(middleBefore, middleAfter, maxEditDistance);
  if (middle === null) {
    for (const line of middleBefore) edits.push({ op: 'delete', line });
    for (const line of middleAfter) edits.push({ op: 'insert', line });
  } else {
    edits.push(...middle);
  }
  for (let index = before.length - suffix; index < before.length; index += 1) {
    edits.push({ op: 'equal', line: before[index] ?? '' });
  }
  return edits;
}

function lineText(prefix: string, line: string): string {
  if (line.endsWith('\n')) return `${prefix}${line}`;
  return `${prefix}${line}\n\\ No newline at end of file\n`;
}

/** Renders one hunk's header and body, with line counts for both sides. */
function renderHunk(
  edits: readonly Edit[],
  start: number,
  end: number,
): { text: string; oldStart: number; newStart: number } {
  let oldLine = 1;
  let newLine = 1;
  for (let index = 0; index < start; index += 1) {
    const edit = edits[index];
    if (edit === undefined) continue;
    if (edit.op === 'equal' || edit.op === 'delete') oldLine += 1;
    if (edit.op === 'equal' || edit.op === 'insert') newLine += 1;
  }
  let oldCount = 0;
  let newCount = 0;
  const body: string[] = [];
  for (let index = start; index < end; index += 1) {
    const edit = edits[index];
    if (edit === undefined) continue;
    switch (edit.op) {
      case 'equal':
        oldCount += 1;
        newCount += 1;
        body.push(lineText(' ', edit.line));
        break;
      case 'delete':
        oldCount += 1;
        body.push(lineText('-', edit.line));
        break;
      case 'insert':
        newCount += 1;
        body.push(lineText('+', edit.line));
        break;
    }
  }
  // A hunk with no lines on one side names the line *before* which it applies,
  // which is the standard `@@ -2,0 +3,1 @@` form for an append.
  const oldStart = oldCount === 0 ? Math.max(0, oldLine - 1) : oldLine;
  const newStart = newCount === 0 ? Math.max(0, newLine - 1) : newLine;
  return {
    text: `@@ -${String(oldStart)},${String(oldCount)} +${String(newStart)},${String(newCount)} @@\n${body.join('')}`,
    oldStart,
    newStart,
  };
}

/**
 * Builds a complete unified diff for one target. Returns null when the output
 * would exceed `maxBytes`; the caller must refuse the proposal rather than
 * showing a truncated change.
 */
export function buildUnifiedDiff(
  path: string,
  before: string,
  after: string,
  options: UnifiedDiffOptions = {},
): UnifiedDiff | null {
  const contextLines = Math.max(0, options.contextLines ?? DEFAULT_CONTEXT);
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxEditDistance = options.maxEditDistance ?? DEFAULT_MAX_EDIT_DISTANCE;
  const edits = diffEdits(
    splitLines(before),
    splitLines(after),
    maxEditDistance,
  );
  const changes: number[] = [];
  for (let index = 0; index < edits.length; index += 1) {
    const edit = edits[index];
    if (edit !== undefined && edit.op !== 'equal') changes.push(index);
  }
  const added = changes.filter((index) => edits[index]?.op === 'insert').length;
  const removed = changes.filter(
    (index) => edits[index]?.op === 'delete',
  ).length;
  if (changes.length === 0) return { path, text: '', added: 0, removed: 0 };

  const hunks: string[] = [];
  let cursor = 0;
  while (cursor < changes.length) {
    const first = changes[cursor];
    if (first === undefined) break;
    let last = first;
    // Merge change runs separated only by context the hunk would show anyway.
    while (cursor + 1 < changes.length) {
      const next = changes[cursor + 1];
      if (next === undefined || next - last - 1 > 2 * contextLines) break;
      last = next;
      cursor += 1;
    }
    const start = Math.max(0, first - contextLines);
    const end = Math.min(edits.length, last + 1 + contextLines);
    hunks.push(renderHunk(edits, start, end).text);
    cursor += 1;
  }
  const text = [`--- a/${path}\n`, `+++ b/${path}\n`, ...hunks].join('');
  if (Buffer.byteLength(text, 'utf-8') > maxBytes) return null;
  return { path, text, added, removed };
}

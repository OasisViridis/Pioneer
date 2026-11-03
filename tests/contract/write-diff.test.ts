import { describe, expect, it } from 'vitest';

import { buildUnifiedDiff } from '../../apps/desktop/src/main/harness/write-permission/unified-diff';

/**
 * P4-A (#19) unified diff probes. The reviewer sees this text, so the format
 * must be a complete, standard line diff: every changed line and the declared
 * context, with byte counts that match the input, never a summary.
 */

describe('unified diff for a proposed replace_file', () => {
  it('renders a single changed line with two lines of context', () => {
    const before = 'alpha\nbeta\ngamma\ndelta\nepsilon\n';
    const after = 'alpha\nbeta\nGAMMA\ndelta\nepsilon\n';
    const diff = buildUnifiedDiff('file.txt', before, after);
    expect(diff).not.toBeNull();
    expect(diff?.text).toBe(
      [
        '--- a/file.txt',
        '+++ b/file.txt',
        '@@ -1,5 +1,5 @@',
        ' alpha',
        ' beta',
        '-gamma',
        '+GAMMA',
        ' delta',
        ' epsilon',
        '',
      ].join('\n'),
    );
    expect(diff?.added).toBe(1);
    expect(diff?.removed).toBe(1);
  });

  it('honours a zero-context request and an insertion at the end', () => {
    const diff = buildUnifiedDiff(
      'notes.md',
      'one\ntwo\n',
      'one\ntwo\nthree\n',
      { contextLines: 0 },
    );
    expect(diff?.text).toBe(
      [
        '--- a/notes.md',
        '+++ b/notes.md',
        '@@ -2,0 +3,1 @@',
        '+three',
        '',
      ].join('\n'),
    );
    expect(diff?.added).toBe(1);
    expect(diff?.removed).toBe(0);
  });

  it('splits distant edits into separate hunks and keeps both complete', () => {
    const before = Array.from(
      { length: 20 },
      (_, index) => `line ${String(index)}`,
    );
    const after = [...before];
    after[2] = 'line two changed';
    after[17] = 'line seventeen changed';
    const diff = buildUnifiedDiff(
      'long.txt',
      `${before.join('\n')}\n`,
      `${after.join('\n')}\n`,
      { contextLines: 1 },
    );
    expect(diff?.text).toContain('@@ -2,3 +2,3 @@');
    expect(diff?.text).toContain('@@ -17,3 +17,3 @@');
    expect(diff?.added).toBe(2);
    expect(diff?.removed).toBe(2);
  });

  it('reports identical content as an empty diff with zero counts', () => {
    const diff = buildUnifiedDiff('same.txt', 'same\n', 'same\n');
    expect(diff?.text).toBe('');
    expect(diff?.added).toBe(0);
    expect(diff?.removed).toBe(0);
  });

  it('shows a CRLF to LF change as a real change instead of normalising it', () => {
    const diff = buildUnifiedDiff('crlf.txt', 'a\r\nb\r\n', 'a\nb\n');
    expect(diff?.removed).toBe(2);
    expect(diff?.added).toBe(2);
  });

  it('marks a missing final newline so the reviewed bytes are unambiguous', () => {
    const diff = buildUnifiedDiff('tail.txt', 'alpha\nomega', 'alpha\nomega\n');
    expect(diff?.text).toContain('+omega');
    expect(diff?.text).toContain('\\ No newline at end of file');
  });

  it('falls back to a complete remove-and-add block when the edit distance cap is hit', () => {
    const before = 'aaaa\nbbbb\ncccc\n';
    const after = 'xxxx\nyyyy\nzzzz\n';
    const diff = buildUnifiedDiff('rewrite.txt', before, after, {
      maxEditDistance: 0,
    });
    expect(diff?.text).toBe(
      [
        '--- a/rewrite.txt',
        '+++ b/rewrite.txt',
        '@@ -1,3 +1,3 @@',
        '-aaaa',
        '-bbbb',
        '-cccc',
        '+xxxx',
        '+yyyy',
        '+zzzz',
        '',
      ].join('\n'),
    );
    expect(diff?.added).toBe(3);
    expect(diff?.removed).toBe(3);
  });

  it('refuses to hand back a truncated diff over the byte budget', () => {
    const before = `${'a'.repeat(200)}\n`;
    const after = `${'b'.repeat(200)}\n`;
    const diff = buildUnifiedDiff('big.txt', before, after, { maxBytes: 64 });
    expect(diff).toBeNull();
  });
});

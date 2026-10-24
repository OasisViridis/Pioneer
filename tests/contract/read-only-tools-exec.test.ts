import { mkdtemp, mkdir, realpath, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { executeReadOnlyTool } from '../../apps/desktop/src/main/harness/read-only-tools';

const never = new AbortController().signal;

describe('P2 read-only tool executor budgets and rechecks (contract §5)', () => {
  let root: string;

  beforeAll(async () => {
    // CI temp roots may arrive via 8.3 short names; the #11 preflight
    // requires the canonical root, so normalize before any tool runs.
    root = await realpath(await mkdtemp(join(tmpdir(), 'pioneer-tools-')));
    await writeFile(join(root, 'readme.txt'), 'alpha\nbeta\n', 'utf-8');
    await writeFile(join(root, 'secret.key'), 'private', 'utf-8');
    await writeFile(
      join(root, 'blob.bin'),
      Buffer.from([0x61, 0x00, 0x62, 0x63]),
    );
    await mkdir(join(root, 'docs'), { recursive: true });
    await writeFile(
      join(root, 'docs', 'guide.md'),
      'needle here\nplain line\nneedle again\n',
      'utf-8',
    );
    await mkdir(join(root, 'docs', 'deep'), { recursive: true });
    await writeFile(
      join(root, 'docs', 'deep', 'note.txt'),
      'needle deep',
      'utf-8',
    );
    await symlink(join(root, 'readme.txt'), join(root, 'alias.txt'));
  });

  it('reads a bounded text file and marks wire-level truncation', async () => {
    const outcome = await executeReadOnlyTool(
      root,
      { tool: 'read_file', arguments: { path: 'readme.txt' } },
      never,
    );
    expect(outcome).toEqual({
      status: 'succeeded',
      text: 'alpha\nbeta\n',
      truncated: false,
    });
  });

  it('rejects binary content with the policy type rejection', async () => {
    const outcome = await executeReadOnlyTool(
      root,
      { tool: 'read_file', arguments: { path: 'blob.bin' } },
      never,
    );
    expect(outcome).toEqual({
      status: 'rejected',
      code: 'PATH_TYPE_NOT_ALLOWED',
    });
  });

  it('rejects sensitive names and links without reading them', async () => {
    const secret = await executeReadOnlyTool(
      root,
      { tool: 'read_file', arguments: { path: 'secret.key' } },
      never,
    );
    expect(secret).toEqual({ status: 'rejected', code: 'SENSITIVE_PATH' });
    const link = await executeReadOnlyTool(
      root,
      { tool: 'read_file', arguments: { path: 'alias.txt' } },
      never,
    );
    expect(link).toEqual({ status: 'rejected', code: 'LINK_NOT_ALLOWED' });
  });

  it('lists directories with sensitive entries skipped', async () => {
    const outcome = await executeReadOnlyTool(
      root,
      { tool: 'list_directory', arguments: { path: '.' } },
      never,
    );
    expect(outcome.status).toBe('succeeded');
    if (outcome.status !== 'succeeded') return;
    const names = outcome.text.split('\n');
    expect(names).toContain('readme.txt');
    expect(names).toContain('docs/');
    expect(names).not.toContain('secret.key');
    expect(names).not.toContain('alias.txt');
  });

  it('searches literal matches across the bounded tree', async () => {
    const outcome = await executeReadOnlyTool(
      root,
      { tool: 'search_in_files', arguments: { path: 'docs', query: 'needle' } },
      never,
    );
    expect(outcome.status).toBe('succeeded');
    if (outcome.status !== 'succeeded') return;
    expect(outcome.text).toContain('docs/guide.md:1: needle here');
    expect(outcome.text).toContain('docs/deep/note.txt:1: needle deep');
    expect(outcome.truncated).toBe(false);
  });

  it('marks search results truncated when the hit budget is exhausted', async () => {
    const many = join(root, 'many');
    await mkdir(many, { recursive: true });
    const lines = Array.from(
      { length: 120 },
      (_, i) => `match line ${String(i)}`,
    ).join('\n');
    await writeFile(join(many, 'hits.txt'), `${lines}\n`, 'utf-8');
    const outcome = await executeReadOnlyTool(
      root,
      { tool: 'search_in_files', arguments: { path: 'many', query: 'match' } },
      never,
    );
    expect(outcome.status).toBe('succeeded');
    if (outcome.status !== 'succeeded') return;
    expect(outcome.truncated).toBe(true);
    expect(outcome.text.split('\n').length).toBeLessThanOrEqual(100);
  });

  it('keeps traversal attempts inside the project', async () => {
    const escape = await executeReadOnlyTool(
      root,
      { tool: 'read_file', arguments: { path: '../outside.txt' } },
      never,
    );
    expect(escape).toEqual({ status: 'rejected', code: 'INVALID_PATH' });
    const absolute = await executeReadOnlyTool(
      root,
      { tool: 'read_file', arguments: { path: 'C:\\Windows\\win.ini' } },
      never,
    );
    expect(absolute.status).toBe('rejected');
  });
});

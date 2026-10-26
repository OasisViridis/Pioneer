import {
  link,
  mkdtemp,
  mkdir,
  open,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
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

  it('reads only the bounded prefix of a file over 1 MiB', async () => {
    await writeFile(
      join(root, 'oversized.txt'),
      `${'a'.repeat(1_200_000)}TAIL`,
      'utf-8',
    );
    const outcome = await executeReadOnlyTool(
      root,
      { tool: 'read_file', arguments: { path: 'oversized.txt' } },
      never,
    );
    expect(outcome.status).toBe('succeeded');
    if (outcome.status !== 'succeeded') return;
    expect(outcome.truncated).toBe(true);
    // Exactly the 64 KiB budget decoded and projected to the 4 KiB wire cap.
    expect(outcome.text).toBe('a'.repeat(4_096));
  });

  it('never materializes a 512 MiB sparse project file', async () => {
    const huge = join(root, 'huge.log');
    const handle = await open(huge, 'w');
    try {
      await handle.write(Buffer.from('a'.repeat(16_384)), 0, 16_384, 0);
      await handle.truncate(512 * 1024 * 1024);
    } finally {
      await handle.close();
    }
    try {
      const outcome = await executeReadOnlyTool(
        root,
        { tool: 'read_file', arguments: { path: 'huge.log' } },
        never,
      );
      expect(outcome.status).toBe('succeeded');
      if (outcome.status !== 'succeeded') return;
      expect(outcome.truncated).toBe(true);
      expect(outcome.text).toBe('a'.repeat(4_096));
    } finally {
      await rm(huge, { force: true });
    }
  });

  it('searches the bounded prefix of a file over the per-file budget', async () => {
    const dir = join(root, 'big-search');
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'big.txt'),
      `needle ${'x'.repeat(70_000)}`,
      'utf-8',
    );
    const outcome = await executeReadOnlyTool(
      root,
      {
        tool: 'search_in_files',
        arguments: { path: 'big-search', query: 'needle' },
      },
      never,
    );
    expect(outcome.status).toBe('succeeded');
    if (outcome.status !== 'succeeded') return;
    expect(outcome.truncated).toBe(true);
    expect(outcome.text.startsWith('big-search/big.txt:1: needle ')).toBe(true);
  });

  it('does not publish a symlinked file inside a listed directory', async () => {
    const links = join(root, 'links');
    await mkdir(links, { recursive: true });
    await writeFile(join(links, 'target.txt'), 'visible', 'utf-8');
    await symlink(join(links, 'target.txt'), join(links, 'alias.txt'));
    const outcome = await executeReadOnlyTool(
      root,
      { tool: 'list_directory', arguments: { path: 'links' } },
      never,
    );
    expect(outcome).toEqual({
      status: 'succeeded',
      text: 'target.txt',
      truncated: false,
    });
  });

  it('does not traverse a nested symlinked directory', async () => {
    const outside = await realpath(
      await mkdtemp(join(tmpdir(), 'pioneer-outside-')),
    );
    await writeFile(join(outside, 'escape.txt'), 'needle outside', 'utf-8');
    const nest = join(root, 'nest');
    await mkdir(nest, { recursive: true });
    await symlink(
      outside,
      join(nest, 'jump'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    const outcome = await executeReadOnlyTool(
      root,
      { tool: 'search_in_files', arguments: { path: 'nest', query: 'needle' } },
      never,
    );
    expect(outcome).toEqual({
      status: 'succeeded',
      text: '',
      truncated: false,
    });
  });

  it('skips hard-linked files with more than one name', async () => {
    const hard = join(root, 'hard');
    await mkdir(hard, { recursive: true });
    await writeFile(join(hard, 'donor.txt'), 'needle hard', 'utf-8');
    await link(join(hard, 'donor.txt'), join(hard, 'copy.txt'));

    const listing = await executeReadOnlyTool(
      root,
      { tool: 'list_directory', arguments: { path: 'hard' } },
      never,
    );
    expect(listing).toEqual({
      status: 'succeeded',
      text: '',
      truncated: false,
    });

    const direct = await executeReadOnlyTool(
      root,
      { tool: 'read_file', arguments: { path: 'hard/donor.txt' } },
      never,
    );
    expect(direct).toEqual({ status: 'rejected', code: 'LINK_NOT_ALLOWED' });

    const search = await executeReadOnlyTool(
      root,
      { tool: 'search_in_files', arguments: { path: 'hard', query: 'needle' } },
      never,
    );
    expect(search).toEqual({ status: 'succeeded', text: '', truncated: false });
  });
});

describe('P2 read-only list_directory budget boundary', () => {
  // Each listing re-stats 200 entries; on a slow CI runner that is seconds of
  // realpath/lstat work, so this case gets a budget above the 5s default.
  it('publishes 200 entries untruncated and truncates the 201st', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'pioneer-list-')));
    const crowded = join(root, 'crowded');
    await mkdir(crowded, { recursive: true });
    // Parallel creation: 200 sequential writes are the slow half of this
    // case on a Windows CI runner.
    await Promise.all(
      Array.from({ length: 200 }, (_, index) =>
        writeFile(
          join(crowded, `f${String(index).padStart(3, '0')}.txt`),
          'x',
          'utf-8',
        ),
      ),
    );

    const exact = await executeReadOnlyTool(
      root,
      { tool: 'list_directory', arguments: { path: 'crowded' } },
      never,
    );
    expect(exact.status).toBe('succeeded');
    if (exact.status !== 'succeeded') return;
    expect(exact.truncated).toBe(false);
    expect(exact.text.split('\n')).toHaveLength(200);

    await writeFile(join(crowded, 'f200.txt'), 'x', 'utf-8');
    const over = await executeReadOnlyTool(
      root,
      { tool: 'list_directory', arguments: { path: 'crowded' } },
      never,
    );
    expect(over.status).toBe('succeeded');
    if (over.status !== 'succeeded') return;
    expect(over.truncated).toBe(true);
    expect(over.text.split('\n')).toHaveLength(200);
  }, 30_000);
});

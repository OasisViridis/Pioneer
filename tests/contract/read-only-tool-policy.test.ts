import {
  link,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkReadOnlyToolRequest } from '../../apps/desktop/src/main/harness/read-only-tool-policy';
import { ReadOnlyToolRejectionSchema } from '../../apps/desktop/src/shared/contracts/read-only-tools';

describe('main read-only tool request boundary', () => {
  it.each(['list_directory', 'search_in_files'])(
    'accepts %s at the project root',
    async (tool) => {
      expect(
        await checkReadOnlyToolRequest(projectRoot, {
          tool,
          arguments:
            tool === 'search_in_files'
              ? { path: '.', query: 'export' }
              : { path: '.' },
        }),
      ).toMatchObject({ ok: true, value: { absolutePath: projectRoot } });
    },
  );

  it.each([
    'write_file',
    'shell',
    'bash',
    'browser',
    'fetch',
    'read',
    'Read_File',
    '__proto__',
    'constructor',
  ])(
    'denies unregistered tools without reflecting their arguments: %s',
    async (tool) => {
      const result = await checkReadOnlyToolRequest(
        'not-an-authorized-project',
        {
          tool,
          arguments: { path: 'PRIVATE MARKER', apiKey: 'PRIVATE MARKER' },
        },
      );
      expect(result).toEqual({
        ok: false,
        error: {
          code: 'TOOL_NOT_ALLOWED',
          message: 'This tool is not available in the read-only policy.',
          retryable: false,
        },
      });
      expect(ReadOnlyToolRejectionSchema.safeParse(result).success).toBe(true);
    },
  );

  it.each([
    { input: null },
    { input: [] },
    { input: {} },
    { input: { tool: 12 } },
    { input: { tool: 'read_file' } },
    { input: { tool: 'read_file', arguments: { path: 1 } } },
    {
      input: {
        tool: 'read_file',
        arguments: { path: 'src/index.ts', root: '/elsewhere' },
      },
    },
    {
      input: {
        tool: 'list_directory',
        arguments: { path: '.', recursive: true },
      },
    },
    { input: { tool: 'search_in_files', arguments: { path: '.', query: '' } } },
    {
      input: {
        tool: 'search_in_files',
        arguments: { path: '.', query: 'x'.repeat(257) },
      },
    },
    { input: { tool: 'read_file', arguments: { path: 'x'.repeat(1025) } } },
    {
      input: {
        tool: 'read_file',
        arguments: { path: 'src/index.ts' },
        projectRoot: '/elsewhere',
      },
    },
  ])('rejects malformed or extended requests: $input', async ({ input }) => {
    expect(await checkReadOnlyToolRequest(projectRoot, input)).toMatchObject({
      ok: false,
      error: { code: 'INVALID_TOOL_REQUEST' },
    });
  });

  it('does not accept another root or a missing project', async () => {
    for (const root of [
      '.',
      join(container, 'missing'),
      join(projectRoot, 'src/index.ts'),
    ]) {
      const result = await checkReadOnlyToolRequest(root, {
        tool: 'list_directory',
        arguments: { path: '.' },
      });
      expect(result).toMatchObject({
        ok: false,
        error: { code: 'PROJECT_UNAVAILABLE' },
      });
      expect(JSON.stringify(result)).not.toContain(container);
    }
  });

  it('rejects a replaced project root and links to regular or missing files', async () => {
    const outside = join(container, 'outside');
    await mkdir(outside);
    await symlink(
      outside,
      join(container, 'root-alias'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    expect(
      await checkReadOnlyToolRequest(join(container, 'root-alias'), {
        tool: 'list_directory',
        arguments: { path: '.' },
      }),
    ).toMatchObject({ ok: false, error: { code: 'PROJECT_UNAVAILABLE' } });

    for (const name of ['file-alias.ts', 'broken.ts']) {
      await symlink(
        join(
          projectRoot,
          'src',
          name === 'broken.ts' ? 'missing.ts' : 'index.ts',
        ),
        join(projectRoot, name),
        'file',
      );
      expect(
        await checkReadOnlyToolRequest(projectRoot, {
          tool: 'read_file',
          arguments: { path: name },
        }),
      ).toMatchObject({ ok: false, error: { code: 'LINK_NOT_ALLOWED' } });
    }
  });

  it('accepts ordinary Unicode filenames and Windows separators without expansion', async () => {
    await writeFile(join(projectRoot, 'src', '示例.ts'), 'const n = 1;');
    expect(
      await checkReadOnlyToolRequest(projectRoot, {
        tool: 'read_file',
        arguments: { path: 'src\\示例.ts' },
      }),
    ).toMatchObject({
      ok: true,
      value: { absolutePath: join(projectRoot, 'src', '示例.ts') },
    });
  });

  it('rejects hard links to files outside the selected project', async () => {
    const outside = join(container, 'outside.txt');
    await writeFile(outside, 'OUTSIDE MARKER');
    await link(outside, join(projectRoot, 'linked.txt'));
    expect(
      await checkReadOnlyToolRequest(projectRoot, {
        tool: 'read_file',
        arguments: { path: 'linked.txt' },
      }),
    ).toMatchObject({ ok: false, error: { code: 'LINK_NOT_ALLOWED' } });
  });
  let container: string;
  let projectRoot: string;

  beforeEach(async () => {
    container = await mkdtemp(join(tmpdir(), 'pioneer-tool-policy-'));
    projectRoot = join(container, 'project');
    await mkdir(join(projectRoot, 'src'), { recursive: true });
    projectRoot = await realpath(projectRoot);
    await writeFile(
      join(projectRoot, 'src', 'index.ts'),
      'export const n = 1;',
    );
  });

  afterEach(async () => {
    await rm(container, { recursive: true, force: true });
  });

  it('rejects shell before inspecting any workspace path', async () => {
    expect(
      await checkReadOnlyToolRequest('unavailable', {
        tool: 'shell',
        arguments: { command: 'echo unsafe' },
      }),
    ).toEqual({
      ok: false,
      error: {
        code: 'TOOL_NOT_ALLOWED',
        message: 'This tool is not available in the read-only policy.',
        retryable: false,
      },
    });
  });

  it('accepts a regular file in the main-selected project', async () => {
    expect(
      await checkReadOnlyToolRequest(projectRoot, {
        tool: 'read_file',
        arguments: { path: 'src/index.ts' },
      }),
    ).toEqual({
      ok: true,
      value: {
        request: { tool: 'read_file', arguments: { path: 'src/index.ts' } },
        absolutePath: join(projectRoot, 'src', 'index.ts'),
      },
    });
  });

  it.each([
    '../secret.txt',
    'src/../../secret.txt',
    'src/../index.ts',
    '/etc/passwd',
    'C:\\private\\secret.txt',
    'C:secret.txt',
    '\\\\server\\share\\secret.txt',
    '\\\\?\\C:\\secret.txt',
    '\\\\.\\NUL',
    '\\rooted.txt',
    'src/index.ts:secret',
    'src\\..\\secret.txt',
    'src//index.ts',
    'src/./index.ts',
    'src/index.ts.',
    'src/index.ts ',
    'NUL.txt',
    'COM1',
    'LPT¹.txt',
    'src/\u0000index.ts',
    'src/*.ts',
    '',
  ])('rejects unsafe path syntax: %j', async (path) => {
    const result = await checkReadOnlyToolRequest(projectRoot, {
      tool: 'read_file',
      arguments: { path },
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: path === '' ? 'INVALID_TOOL_REQUEST' : 'INVALID_PATH' },
    });
  });

  it('rejects both escaping and in-project directory links', async () => {
    const outside = join(container, 'project-other');
    await mkdir(outside);
    await writeFile(join(outside, 'outside.txt'), 'OUTSIDE MARKER');
    for (const { name, target } of [
      { name: 'escape', target: outside },
      { name: 'alias', target: join(projectRoot, 'src') },
    ]) {
      await symlink(
        target,
        join(projectRoot, name),
        process.platform === 'win32' ? 'junction' : 'dir',
      );
      expect(
        await checkReadOnlyToolRequest(projectRoot, {
          tool: 'list_directory',
          arguments: { path: name },
        }),
      ).toMatchObject({ ok: false, error: { code: 'LINK_NOT_ALLOWED' } });
      expect(
        await checkReadOnlyToolRequest(projectRoot, {
          tool: 'read_file',
          arguments: {
            path: `${name}/${name === 'escape' ? 'outside.txt' : 'index.ts'}`,
          },
        }),
      ).toMatchObject({ ok: false, error: { code: 'LINK_NOT_ALLOWED' } });
    }
  });

  it.each([
    { tool: 'read_file', path: '.', code: 'PATH_TYPE_NOT_ALLOWED' },
    { tool: 'read_file', path: 'src', code: 'PATH_TYPE_NOT_ALLOWED' },
    {
      tool: 'list_directory',
      path: 'src/index.ts',
      code: 'PATH_TYPE_NOT_ALLOWED',
    },
    {
      tool: 'search_in_files',
      path: 'src/index.ts',
      code: 'PATH_TYPE_NOT_ALLOWED',
    },
    { tool: 'read_file', path: 'missing.ts', code: 'PATH_UNAVAILABLE' },
  ])(
    'requires the correct existing entry type for $tool: $path',
    async ({ tool, path, code }) => {
      expect(
        await checkReadOnlyToolRequest(projectRoot, {
          tool,
          arguments:
            tool === 'search_in_files' ? { path, query: 'export' } : { path },
        }),
      ).toMatchObject({ ok: false, error: { code } });
    },
  );

  it.each([
    '.env',
    '.git/config',
    'src/.private/key.txt',
    'AUTH.JSON',
    'credentials.json',
    'secrets.txt',
    'id_rsa',
    'cert.pem',
    'private.KEY',
    'node_modules/pkg/index.js',
  ])('rejects sensitive sources before disk lookup: %s', async (path) => {
    expect(
      await checkReadOnlyToolRequest(projectRoot, {
        tool: 'read_file',
        arguments: { path },
      }),
    ).toMatchObject({ ok: false, error: { code: 'SENSITIVE_PATH' } });
  });
});

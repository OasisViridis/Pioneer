import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { readProjectMetadata } from '../../apps/desktop/src/main/catalog/metadata';
import type { CatalogFs } from '../../apps/desktop/src/main/catalog/fs-adapter';

const missing = (): NodeJS.ErrnoException => {
  const error = new Error('missing') as NodeJS.ErrnoException;
  error.code = 'ENOENT';
  return error;
};

describe('project metadata package technology detection', () => {
  it('aggregates runtime, development, peer, and optional dependencies without duplicates', async () => {
    const root = resolve('workspace');
    const project = join(root, 'alpha-app');
    const packagePath = join(project, 'package.json');
    const readmePath = join(project, 'README.md');
    const gitPath = join(project, '.git');
    const packageText = JSON.stringify({
      description: 'Alpha project',
      dependencies: { react: '1', zod: '1' },
      devDependencies: { typescript: '1', zod: '2' },
      peerDependencies: { electron: '1' },
      optionalDependencies: { sharp: '1' },
    });

    const fs: CatalogFs = {
      readdir: () => Promise.resolve([]),
      realpath: (path) => {
        if (path === readmePath || path === gitPath)
          return Promise.reject(missing());
        return Promise.resolve(path);
      },
      readTextPrefix: (path) => {
        if (path === packagePath) return Promise.resolve(packageText);
        return Promise.reject(missing());
      },
      stat: (path) =>
        Promise.resolve({
          mtime: new Date('2026-09-13T00:00:00.000Z'),
          isDirectory: () => path === project,
          isFile: () => path === packagePath || path.endsWith('README.md'),
        }),
      access: () => Promise.resolve(),
    };

    const result = await readProjectMetadata(project, fs, root);

    expect(result.description).toBe('Alpha project');
    expect(result.technologies).toEqual([
      'electron',
      'react',
      'sharp',
      'typescript',
      'zod',
    ]);
    expect(result.hasGitRepository).toBe(false);
  });

  it('renders a poster summary without markdown or HTML source', async () => {
    const root = resolve('workspace');
    const project = join(root, 'gamma-app');
    const packagePath = join(project, 'package.json');
    const readmePath = join(project, 'README.md');
    const packageText = JSON.stringify({ name: 'gamma-app' });
    const readme = [
      '<!-- internal banner comment -->',
      '# gamma',
      '',
      '> **Gamma workbench** · 为本地任务设计的桌面工作区',
      '> 第二行引用',
      '',
      '<div align="center">',
      '  <picture>raw html block</picture>',
      '</div>',
    ].join('\n');

    const fs: CatalogFs = {
      readdir: () => Promise.resolve([]),
      realpath: (path) => Promise.resolve(path),
      readTextPrefix: (path) => {
        if (path.endsWith('README.md')) return Promise.resolve(readme);
        if (path.endsWith('package.json')) return Promise.resolve(packageText);
        return Promise.reject(missing());
      },
      stat: (path) =>
        Promise.resolve({
          mtime: new Date('2026-09-13T00:00:00.000Z'),
          isDirectory: () => path === project,
          isFile: () => path === packagePath || path.endsWith('README.md'),
        }),
      access: () => Promise.resolve(),
    };

    const result = await readProjectMetadata(project, fs, root);

    expect(result.description).toBe(
      'Gamma workbench · 为本地任务设计的桌面工作区 第二行引用',
    );
    expect(result.description ?? '').not.toMatch(/\*\*|^>|<!--|<div/);
  });
});

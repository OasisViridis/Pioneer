import { mkdtemp, mkdir, realpath, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  buildEgressManifest,
  listProjectMaterials,
  materialMatches,
} from '../../apps/desktop/src/main/harness/egress-materials';

describe('explicit egress manifest validation', () => {
  let root: string;

  beforeAll(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'pioneer-egress-')));
    await writeFile(join(root, 'ok.txt'), 'approved bytes', 'utf-8');
    await writeFile(join(root, 'secret.key'), 'private', 'utf-8');
    await writeFile(join(root, 'large.txt'), 'x'.repeat(65_537), 'utf-8');
    await mkdir(join(root, 'nested'), { recursive: true });
    await writeFile(join(root, 'nested', 'note.txt'), 'nested', 'utf-8');
    await symlink(join(root, 'ok.txt'), join(root, 'linked.txt'));
  });

  it('hashes an approved file and detects a later change', async () => {
    const [material] = await buildEgressManifest(root, ['ok.txt']);
    expect(material).toMatchObject({
      path: 'ok.txt',
      bytes: Buffer.byteLength('approved bytes'),
    });
    expect(material?.sha256).toMatch(/^[0-9a-f]{64}$/);
    if (material === undefined) throw new Error('Expected manifest entry');
    expect(materialMatches(material, Buffer.from('approved bytes'))).toBe(true);
    expect(materialMatches(material, Buffer.from('changed bytes'))).toBe(false);
  });

  it('rejects traversal, sensitive names, oversized files, and duplicates', async () => {
    await expect(
      buildEgressManifest(root, ['../outside.txt']),
    ).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
    await expect(
      buildEgressManifest(root, ['secret.key']),
    ).rejects.toMatchObject({ code: 'MATERIAL_NOT_ALLOWED' });
    await expect(
      buildEgressManifest(root, ['linked.txt']),
    ).rejects.toMatchObject({ code: 'MATERIAL_NOT_ALLOWED' });
    await expect(
      buildEgressManifest(root, ['large.txt']),
    ).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
    await expect(
      buildEgressManifest(root, ['ok.txt', 'ok.txt']),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(
      buildEgressManifest(
        root,
        Array.from({ length: 65 }, (_, index) => `file-${String(index)}.txt`),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  });

  it('lists bounded candidates without sensitive or oversized files', async () => {
    const candidates = await listProjectMaterials(root);
    const paths = candidates.map((candidate) => candidate.path);
    expect(paths).toContain('ok.txt');
    expect(paths).toContain('nested/note.txt');
    expect(paths).not.toContain('secret.key');
    expect(paths).not.toContain('large.txt');
    expect(paths).not.toContain('linked.txt');
  });
});

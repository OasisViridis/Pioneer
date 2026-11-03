import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WRITE_LIMITS } from '../../apps/desktop/src/shared/contracts/write-permission';
import {
  WRITE_PREVIEW_LIMITS,
  WritePreviewSchema,
  type WritePreviewSummary,
  type WriteProposalViewBinding,
} from '../../apps/desktop/src/shared/contracts/write-preview';
import { WriteProposalRegistry } from '../../apps/desktop/src/main/harness/write-permission/proposal-registry';

/**
 * P4-A (#19) proposal/preview probes. Every probe uses a fresh temporary
 * project; the repository fixture is never read or written by this file.
 */

const sha256Of = (value: string | Buffer): string =>
  createHash('sha256').update(value).digest('hex');

const BINDING: WriteProposalViewBinding = {
  sessionId: 'session-0000000000001',
  projectId: 'project-0000000000001',
  webContentsId: 7,
  windowEpoch: 3,
};

const AT = '2026-11-03T09:00:00.000Z';

describe('write proposal registry', () => {
  let root: string;
  let registry: WriteProposalRegistry;

  beforeEach(async () => {
    // Canonicalize because the #18 preflight compares canonical roots; a CI
    // temp root with 8.3 short names would fail before observing the target.
    root = await realpath(await mkdtemp(join(tmpdir(), 'pioneer-proposal-')));
    registry = new WriteProposalRegistry({ now: () => AT });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function propose(
    path: string,
    content: string,
    overrides: Partial<{
      runId: string;
      revision: number;
      binding: WriteProposalViewBinding;
    }> = {},
  ) {
    return registry.propose({
      binding: overrides.binding ?? BINDING,
      runId: overrides.runId ?? 'run-0000000000001',
      revision: overrides.revision ?? 1,
      projectRoot: root,
      path,
      content,
    });
  }

  function summaryFor(paths: readonly string[] = ['README.md']) {
    const summary = registry
      .list(BINDING)
      .find((item: WritePreviewSummary) =>
        paths.every((path) => item.paths.includes(path)),
      );
    if (summary === undefined) throw new Error('preview summary missing');
    return summary;
  }

  it('builds the preview from main reads and the proposed bytes', async () => {
    await writeFile(join(root, 'README.md'), 'alpha\nbeta\n', 'utf-8');
    const proposed = await propose('README.md', 'alpha\nBETA\n');

    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;
    expect(proposed.previewRevision).toBe(1);

    const lookup = registry.get({
      ...BINDING,
      proposalId: proposed.proposalId,
      runId: 'run-0000000000001',
      revision: 1,
    });
    expect(lookup.ok).toBe(true);
    if (!lookup.ok) return;
    expect(lookup.state).toBe('pending');
    const target = lookup.preview.targets[0];
    expect(target).toBeDefined();
    if (target === undefined) return;
    expect(target.path).toBe('README.md');
    expect(target.before).toEqual({
      kind: 'file',
      bytes: 11,
      sha256: sha256Of('alpha\nbeta\n'),
    });
    expect(target.after).toEqual({
      kind: 'file',
      bytes: 11,
      sha256: sha256Of('alpha\nBETA\n'),
    });
    expect(target.diff).toContain('-beta');
    expect(target.diff).toContain('+BETA');
    expect(target.identity === null || target.identity.fileId.length > 0).toBe(
      true,
    );
    expect(WritePreviewSchema.safeParse(lookup.preview).success).toBe(true);

    const summary = summaryFor();
    expect(summary.proposalId).toBe(proposed.proposalId);
    expect(summary.runId).toBe('run-0000000000001');
    expect(summary.revision).toBe(1);
    expect(summary.state).toBe('pending');
  });

  it('keeps previews bound to the requesting window and session', async () => {
    await writeFile(join(root, 'README.md'), 'alpha\n', 'utf-8');
    const proposed = await propose('README.md', 'beta\n');
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;

    expect(registry.list({ ...BINDING, windowEpoch: 4 })).toEqual([]);
    expect(
      registry.get({
        ...BINDING,
        windowEpoch: 4,
        proposalId: proposed.proposalId,
        runId: 'run-0000000000001',
        revision: 1,
      }),
    ).toEqual({ ok: false, code: 'PROPOSAL_NOT_FOUND' });
    expect(
      registry.get({
        ...BINDING,
        runId: 'run-0000000000002',
        proposalId: proposed.proposalId,
        revision: 1,
      }),
    ).toEqual({ ok: false, code: 'PROPOSAL_NOT_FOUND' });
  });

  it('refuses unsafe, missing, non-regular, binary or oversized targets', async () => {
    await writeFile(join(root, 'README.md'), 'alpha\n', 'utf-8');
    await mkdir(join(root, 'folder'));
    await writeFile(join(root, 'binary.bin'), Buffer.from([0xff, 0xfe, 0x00]));
    const huge = 'x'.repeat(WRITE_LIMITS.targetBytes + 1);
    await writeFile(join(root, 'huge.txt'), huge, 'utf-8');

    const cases: [string, string][] = [
      ['../escape.md', 'INVALID_TARGET'],
      ['/absolute.md', 'INVALID_TARGET'],
      ['folder', 'TARGET_NOT_REGULAR_FILE'],
      ['binary.bin', 'TARGET_NOT_TEXT'],
      ['huge.txt', 'TARGET_TOO_LARGE'],
    ];
    for (const [path, code] of cases) {
      const result = await propose(path, 'replacement\n');
      expect(result).toEqual({ ok: false, code });
    }
    expect(await propose('missing.md', 'replacement\n')).toEqual({
      ok: false,
      code: 'TARGET_MISSING',
    });

    const oversizedProposal = await propose(
      'README.md',
      'x'.repeat(WRITE_LIMITS.targetBytes + 1),
    );
    expect(oversizedProposal).toEqual({ ok: false, code: 'TARGET_TOO_LARGE' });
  });

  it('refuses an unchanged file and a repeated path in one run', async () => {
    await writeFile(join(root, 'README.md'), 'alpha\n', 'utf-8');
    expect(await propose('README.md', 'alpha\n')).toEqual({
      ok: false,
      code: 'NO_CHANGE',
    });
    const first = await propose('README.md', 'beta\n');
    expect(first.ok).toBe(true);
    expect(await propose('README.md', 'gamma\n')).toEqual({
      ok: false,
      code: 'DUPLICATE_TARGET',
    });
    expect(
      await propose('README.md', 'gamma\n', { runId: 'run-0000000000002' }),
    ).toMatchObject({ ok: true });
  });

  it('caps proposals per run and evicts resolved previews before refusing', async () => {
    for (let index = 0; index < 5; index += 1) {
      await writeFile(join(root, `file-${String(index)}.txt`), 'alpha\n');
    }
    const accepted: { proposalId: string }[] = [];
    for (
      let index = 0;
      index < WRITE_PREVIEW_LIMITS.proposalsPerRun;
      index += 1
    ) {
      const result = await propose(`file-${String(index)}.txt`, 'beta\n');
      expect(result.ok).toBe(true);
      if (result.ok) accepted.push({ proposalId: result.proposalId });
    }
    expect(await propose('file-4.txt', 'beta\n')).toEqual({
      ok: false,
      code: 'PROPOSAL_LIMIT',
    });

    const first = accepted[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(
      registry.markState(
        {
          ...BINDING,
          proposalId: first.proposalId,
          runId: 'run-0000000000001',
          revision: 1,
          previewRevision: 1,
        },
        'applied',
      ),
    ).toBe(true);
    // A resolved preview no longer blocks the run budget? It still counts as a
    // proposal for that run, so the run stays at four; the registry-wide
    // retention cap is what eviction protects.
    expect(await propose('file-4.txt', 'beta\n')).toEqual({
      ok: false,
      code: 'PROPOSAL_LIMIT',
    });
  });

  it('re-reads the target on refresh and expiring the old reviewed revision', async () => {
    await writeFile(join(root, 'README.md'), 'alpha\nbeta\n', 'utf-8');
    const proposed = await propose('README.md', 'alpha\nBETA\n');
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;
    const identity = {
      ...BINDING,
      proposalId: proposed.proposalId,
      runId: 'run-0000000000001',
      revision: 1,
    };

    // The user edits the same file after the preview was shown.
    await writeFile(join(root, 'README.md'), 'alpha\ngamma\n', 'utf-8');
    const refreshed = await registry.refresh(identity);
    expect(refreshed.ok).toBe(true);
    if (!refreshed.ok) return;
    expect(refreshed.preview.previewRevision).toBe(2);
    expect(refreshed.preview.targets[0]?.before.sha256).toBe(
      sha256Of('alpha\ngamma\n'),
    );
    expect(refreshed.preview.targets[0]?.diff).toContain('-gamma');

    // The approval the user gave for revision 1 can no longer apply.
    expect(
      registry.resolveForAction({ ...identity, previewRevision: 1 }),
    ).toEqual({ ok: false, code: 'PREVIEW_EXPIRED' });
    expect(
      registry.resolveForAction({ ...identity, previewRevision: 2 }).ok,
    ).toBe(true);
  });

  it('expires a preview whose target disappeared before a refresh', async () => {
    await writeFile(join(root, 'README.md'), 'alpha\n', 'utf-8');
    const proposed = await propose('README.md', 'beta\n');
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;
    const identity = {
      ...BINDING,
      proposalId: proposed.proposalId,
      runId: 'run-0000000000001',
      revision: 1,
    };
    await rm(join(root, 'README.md'));
    expect(await registry.refresh(identity)).toEqual({
      ok: false,
      code: 'PREVIEW_EXPIRED',
    });
    expect(registry.get(identity)).toMatchObject({
      ok: true,
      state: 'expired',
    });
    expect(
      registry.resolveForAction({ ...identity, previewRevision: 1 }),
    ).toEqual({ ok: false, code: 'PREVIEW_ALREADY_RESOLVED' });
  });

  it('records a final state without losing the reviewed preview', async () => {
    await writeFile(join(root, 'README.md'), 'alpha\n', 'utf-8');
    const proposed = await propose('README.md', 'beta\n');
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;
    const identity = {
      ...BINDING,
      proposalId: proposed.proposalId,
      runId: 'run-0000000000001',
      revision: 1,
    };
    expect(
      registry.markState({ ...identity, previewRevision: 1 }, 'rejected'),
    ).toBe(true);
    expect(
      registry.markState({ ...identity, previewRevision: 1 }, 'applied'),
    ).toBe(false);
    expect(registry.get(identity)).toMatchObject({
      ok: true,
      state: 'rejected',
    });
    expect(registry.list(BINDING)[0]?.state).toBe('rejected');
  });

  it('evicts resolved previews before refusing a new one', async () => {
    for (let file = 0; file < 4; file += 1) {
      await writeFile(join(root, `f${String(file)}.txt`), 'start\n', 'utf-8');
    }
    let first: string | null = null;
    for (let run = 0; run < 8; run += 1) {
      const runId = `run-${String(9000000000000 + run)}`;
      for (let file = 0; file < 4; file += 1) {
        const proposed = await propose(
          `f${String(file)}.txt`,
          `run ${String(run)}\n`,
          { runId },
        );
        expect(proposed.ok).toBe(true);
        if (!proposed.ok) return;
        first ??= proposed.proposalId;
        expect(
          registry.markState(
            {
              ...BINDING,
              proposalId: proposed.proposalId,
              runId,
              revision: 1,
              previewRevision: 1,
            },
            'rejected',
          ),
        ).toBe(true);
      }
    }
    expect(registry.list(BINDING)).toHaveLength(32);

    const fresh = await propose('f0.txt', 'fresh\n', {
      runId: 'run-9000000000008',
    });
    expect(fresh.ok).toBe(true);
    if (!fresh.ok) return;
    const listed = registry.list(BINDING);
    expect(listed).toHaveLength(32);
    expect(listed[0]).toMatchObject({
      proposalId: fresh.proposalId,
      state: 'pending',
    });
    if (first !== null) {
      expect(
        registry.get({
          ...BINDING,
          proposalId: first,
          runId: 'run-9000000000000',
          revision: 1,
        }),
      ).toEqual({ ok: false, code: 'PROPOSAL_NOT_FOUND' });
    }
  });
});

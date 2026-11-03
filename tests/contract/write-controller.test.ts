import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WriteChangeJournal } from '../../apps/desktop/src/main/harness/write-permission/write-journal';
import { WritePermissionStore } from '../../apps/desktop/src/main/harness/write-permission/permission-store';
import { WriteProposalRegistry } from '../../apps/desktop/src/main/harness/write-permission/proposal-registry';
import { WriteController } from '../../apps/desktop/src/main/write-controller';
import type { WritePermissionMode } from '../../apps/desktop/src/shared/contracts/write-permission';

/**
 * P4-A (#19) controller probes: the exact user-visible sequence from a
 * proposal to an applied change, plus the refusal paths in the issue's
 * completion conditions. The project root is a per-test temporary directory.
 */

const AT = '2026-11-03T09:00:00.000Z';
const BINDING = {
  sessionId: 'session-0000000000001',
  projectId: 'project-0000000000001',
  webContentsId: 7,
  windowEpoch: 3,
};

describe('write controller', () => {
  let root: string;
  let controller: WriteController;
  let registry: WriteProposalRegistry;
  let sessionRevision: number;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'pioneer-controller-'));
    await writeFile(join(root, 'README.md'), 'alpha\nbeta\n', 'utf-8');
    sessionRevision = 1;
    registry = new WriteProposalRegistry({ now: () => AT });
    const { journal } = await WriteChangeJournal.open({
      load: () => Promise.resolve(null),
      append: () => Promise.resolve(),
    });
    controller = new WriteController({
      proposals: registry,
      permissions: new WritePermissionStore(() => new Date(AT)),
      journal,
      resolveProject: (projectId) =>
        Promise.resolve(
          projectId === BINDING.projectId
            ? { root, projectName: 'alpha-app' }
            : null,
        ),
      currentRevision: () => sessionRevision,
      now: () => AT,
    });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function propose(content = 'alpha\nBETA\n') {
    const outcome = await controller.propose({
      binding: BINDING,
      runId: 'run-0000000000001',
      revision: 1,
      projectRoot: root,
      path: 'README.md',
      content,
    });
    expect(outcome.status).toBe('accepted');
    if (outcome.status !== 'accepted') throw new Error('proposal refused');
    return {
      ...BINDING,
      proposalId: outcome.proposalId,
      runId: 'run-0000000000001',
      revision: 1,
      previewRevision: 1,
    };
  }

  async function setMode(mode: WritePermissionMode, riskAcknowledged = false) {
    return controller.setPermission({
      ...BINDING,
      mode,
      riskAcknowledged,
    });
  }

  it('previews a proposal and applies only after the user grants a mode', async () => {
    const identity = await propose();
    const preview = controller.getPreview(identity);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.state).toBe('pending');
    expect(preview.preview.targets[0]?.diff).toContain('-beta');
    expect(controller.listPreviews(BINDING)).toMatchObject([
      {
        proposalId: identity.proposalId,
        state: 'pending',
        paths: ['README.md'],
      },
    ]);

    const missing = await controller.apply(identity);
    expect(missing).toEqual({
      ok: false,
      code: 'PERMISSION_REQUIRED',
      report: null,
    });
    expect(await readFile(join(root, 'README.md'), 'utf-8')).toBe(
      'alpha\nbeta\n',
    );

    expect(await setMode('workspace_write')).toEqual({
      ok: true,
      mode: 'workspace_write',
    });
    const applied = await controller.apply(identity);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.report.outcomes).toEqual([
      { path: 'README.md', status: 'applied', code: null },
    ]);
    expect(await readFile(join(root, 'README.md'), 'utf-8')).toBe(
      'alpha\nBETA\n',
    );
    expect(controller.getPreview(identity)).toMatchObject({
      ok: true,
      state: 'applied',
    });
    expect(await controller.apply(identity)).toEqual({
      ok: false,
      code: 'PREVIEW_ALREADY_RESOLVED',
      report: null,
    });
  });

  it('refuses to write in read-only mode and keeps the preview pending', async () => {
    const identity = await propose();
    expect(await setMode('read_only')).toEqual({
      ok: true,
      mode: 'read_only',
    });
    const denied = await controller.apply(identity);
    expect(denied).toMatchObject({
      ok: false,
      code: 'PERMISSION_READ_ONLY',
    });
    if (!denied.ok) {
      expect(denied.report?.outcomes).toEqual([
        { path: 'README.md', status: 'rejected', code: 'PERMISSION_DENIED' },
      ]);
    }
    expect(await readFile(join(root, 'README.md'), 'utf-8')).toBe(
      'alpha\nbeta\n',
    );
    expect(controller.getPreview(identity)).toMatchObject({
      ok: true,
      state: 'pending',
    });
  });

  it('rejects without touching the file and cannot apply the rejected preview', async () => {
    const identity = await propose();
    const before = await readFile(join(root, 'README.md'));
    expect(await controller.reject(identity)).toEqual({ ok: true });
    const after = await readFile(join(root, 'README.md'));
    expect(after.equals(before)).toBe(true);
    expect(createHash('sha256').update(after).digest('hex')).toBe(
      createHash('sha256').update(before).digest('hex'),
    );
    expect(controller.getPreview(identity)).toMatchObject({
      ok: true,
      state: 'rejected',
    });
    await setMode('workspace_write');
    expect(await controller.apply(identity)).toMatchObject({
      ok: false,
      code: 'PREVIEW_ALREADY_RESOLVED',
    });
  });

  it('expires an approval when a newer run started in the same session', async () => {
    const identity = await propose();
    await setMode('workspace_write');
    sessionRevision = 2;
    expect(await controller.apply(identity)).toMatchObject({
      ok: false,
      code: 'PREVIEW_EXPIRED',
    });
    expect(controller.getPreview(identity)).toMatchObject({
      ok: true,
      state: 'expired',
    });
    expect(await readFile(join(root, 'README.md'), 'utf-8')).toBe(
      'alpha\nbeta\n',
    );
  });

  it('requires the exact previewRevision the user reviewed', async () => {
    const identity = await propose();
    await setMode('workspace_write');
    expect(
      await controller.apply({ ...identity, previewRevision: 2 }),
    ).toMatchObject({ ok: false, code: 'PREVIEW_EXPIRED' });
    expect(
      await controller.reject({ ...identity, previewRevision: 2 }),
    ).toMatchObject({ ok: false, code: 'PREVIEW_EXPIRED' });
    expect(await readFile(join(root, 'README.md'), 'utf-8')).toBe(
      'alpha\nbeta\n',
    );
  });

  it('writes only the previewed path and leaves every other file byte-identical', async () => {
    await writeFile(join(root, 'other.txt'), 'untouched\n', 'utf-8');
    const identity = await propose();
    await setMode('workspace_write');
    const applied = await controller.apply(identity);
    expect(applied.ok).toBe(true);
    expect(await readFile(join(root, 'other.txt'), 'utf-8')).toBe(
      'untouched\n',
    );
    expect(await readFile(join(root, 'README.md'), 'utf-8')).toBe(
      'alpha\nBETA\n',
    );
  });

  it('rebuilds the diff on refresh and demands a new approval', async () => {
    const identity = await propose();
    await setMode('workspace_write');
    await writeFile(join(root, 'README.md'), 'alpha\ngamma\n', 'utf-8');
    const refreshed = await controller.refresh(identity);
    expect(refreshed).toMatchObject({ ok: true, state: 'pending' });
    if (!refreshed.ok) return;
    expect(refreshed.preview.previewRevision).toBe(2);
    expect(refreshed.preview.targets[0]?.diff).toContain('-gamma');

    expect(await controller.apply(identity)).toMatchObject({
      ok: false,
      code: 'PREVIEW_EXPIRED',
    });
    const applied = await controller.apply({
      ...identity,
      previewRevision: 2,
    });
    expect(applied.ok).toBe(true);
    expect(await readFile(join(root, 'README.md'), 'utf-8')).toBe(
      'alpha\nBETA\n',
    );
  });

  it('keeps previews bound to the window that requested them', async () => {
    const identity = await propose();
    const otherWindow = {
      ...identity,
      windowEpoch: 4,
    };
    expect(controller.getPreview(otherWindow)).toEqual({
      ok: false,
      code: 'PROPOSAL_NOT_FOUND',
    });
    expect(controller.listPreviews({ ...BINDING, windowEpoch: 4 })).toEqual([]);
    expect(await controller.reject(otherWindow)).toMatchObject({
      ok: false,
      code: 'PROPOSAL_NOT_FOUND',
    });
  });

  it('writes automatically only under the acknowledged auto-review mode', async () => {
    expect(await setMode('auto_review', false)).toEqual({
      ok: false,
      code: 'INVALID_REQUEST',
    });
    expect(await setMode('auto_review', true)).toEqual({
      ok: true,
      mode: 'auto_review',
    });
    const identity = await propose();
    expect(controller.getPreview(identity)).toMatchObject({
      ok: true,
      state: 'applied',
    });
    expect(await readFile(join(root, 'README.md'), 'utf-8')).toBe(
      'alpha\nBETA\n',
    );
    // The reviewed preview and its report stay inspectable after the auto write.
    expect(controller.listPreviews(BINDING)[0]).toMatchObject({
      proposalId: identity.proposalId,
      state: 'applied',
    });
  });

  it('drops a window permission and its previews when the window goes away', async () => {
    const identity = await propose();
    await setMode('workspace_write');
    controller.forgetWindow(BINDING.webContentsId);
    expect(
      controller.getPermission(BINDING.sessionId, BINDING.projectId, BINDING),
    ).toEqual({ mode: null, riskAcknowledged: false });
    expect(controller.getPreview(identity)).toEqual({
      ok: false,
      code: 'PROPOSAL_NOT_FOUND',
    });
  });
});

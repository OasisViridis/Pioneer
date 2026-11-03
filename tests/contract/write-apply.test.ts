import { createHash } from 'node:crypto';
import {
  lstat,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  WRITE_LIMITS,
  WRITE_PROTECTED_PATHS,
  WritePermissionSchema,
  WriteTargetSchema,
  type WritePermission,
  type WriteTarget,
} from '../../apps/desktop/src/shared/contracts/write-permission';
import { applyWriteBatch } from '../../apps/desktop/src/main/harness/write-permission/apply-write';
import { planRecovery } from '../../apps/desktop/src/main/harness/write-permission/decision';
import { WriteChangeJournal } from '../../apps/desktop/src/main/harness/write-permission/write-journal';
import { WritePermissionStore } from '../../apps/desktop/src/main/harness/write-permission/permission-store';

/**
 * P4-A (#19) write-execution probes. Every probe uses a temporary project and
 * an in-memory journal; the repository fixture is never touched.
 */

const RUN_ID = 'run-0000000000001';
const AT = '2026-11-03T09:00:00.000Z';

const sha256Of = (value: string | Buffer): string =>
  createHash('sha256').update(value).digest('hex');

const stateOf = (value: string) => ({
  kind: 'file' as const,
  bytes: Buffer.byteLength(value, 'utf-8'),
  sha256: sha256Of(value),
});

function permissionOf(
  overrides: Partial<WritePermission> = {},
): WritePermission {
  return WritePermissionSchema.parse({
    version: 1,
    sessionId: 'session-0000000000001',
    projectId: 'project-0000000000001',
    mode: 'workspace_write',
    scope: 'all_targets',
    protectedPaths: [...WRITE_PROTECTED_PATHS],
    webContentsId: 7,
    windowEpoch: 3,
    grantedAt: AT,
    riskAcknowledged: false,
    ...overrides,
  });
}

interface JournalProbe {
  journal: WriteChangeJournal;
  lines: string[];
}

async function journalProbe(fail?: boolean): Promise<JournalProbe> {
  const lines: string[] = [];
  const { journal } = await WriteChangeJournal.open({
    load: () => Promise.resolve(null),
    append: (line) => {
      if (fail === true)
        return Promise.reject(new Error('journal unavailable'));
      lines.push(line);
      return Promise.resolve();
    },
  });
  return { journal, lines };
}

describe('write execution', () => {
  let root: string;
  let contents: Map<string, Buffer>;

  beforeEach(async () => {
    // The #18 preflight compares canonical roots; CI's 8.3 temp path would
    // otherwise be rejected before any target is observed.
    root = await realpath(await mkdtemp(join(tmpdir(), 'pioneer-apply-')));
    await writeFile(join(root, 'README.md'), 'alpha\nbeta\n', 'utf-8');
    await writeFile(join(root, 'notes.txt'), 'one\ntwo\n', 'utf-8');
    contents = new Map([
      ['README.md', Buffer.from('alpha\nBETA\n', 'utf-8')],
      ['notes.txt', Buffer.from('one\nTWO\n', 'utf-8')],
    ]);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const targetOf = (
    path: string,
    before: string,
    after: string,
    identity: WriteTarget['identity'] = null,
  ): WriteTarget =>
    WriteTargetSchema.parse({
      path,
      before: stateOf(before),
      after: stateOf(after),
      identity,
    });

  it('replaces the reviewed bytes and records a verified intent/applied chain', async () => {
    const probe = await journalProbe();
    const result = await applyWriteBatch({
      projectRoot: root,
      runId: RUN_ID,
      revision: 1,
      targets: [targetOf('README.md', 'alpha\nbeta\n', 'alpha\nBETA\n')],
      contents,
      permission: permissionOf(),
      journal: probe.journal,
      now: () => AT,
    });
    expect(result.status).toBe('applied');
    if (result.status !== 'applied') return;
    expect(result.report.outcomes).toEqual([
      { path: 'README.md', status: 'applied', code: null },
    ]);
    expect(result.report.applied).toEqual([
      {
        path: 'README.md',
        afterSha256: sha256Of('alpha\nBETA\n'),
        observedSha256: sha256Of('alpha\nBETA\n'),
        verification: 'verified',
      },
    ]);
    expect(await readFile(join(root, 'README.md'), 'utf-8')).toBe(
      'alpha\nBETA\n',
    );
    const records = probe.journal.recordsFor(RUN_ID);
    expect(records.map((record) => record.kind)).toEqual(['intent', 'applied']);
    expect(records[0]).toMatchObject({
      beforeSha256: sha256Of('alpha\nbeta\n'),
    });
    expect(records[1]).toMatchObject({
      afterSha256: sha256Of('alpha\nBETA\n'),
      verification: 'verified',
    });
  });

  it('refuses the whole batch in read-only mode without touching any file', async () => {
    const probe = await journalProbe();
    const result = await applyWriteBatch({
      projectRoot: root,
      runId: RUN_ID,
      revision: 1,
      targets: [targetOf('README.md', 'alpha\nbeta\n', 'alpha\nBETA\n')],
      contents,
      permission: permissionOf({ mode: 'read_only' }),
      journal: probe.journal,
      now: () => AT,
    });
    expect(result.status).toBe('denied');
    if (result.status !== 'denied') return;
    expect(result.stage).toBe('permission');
    expect(result.code).toBe('PERMISSION_READ_ONLY');
    expect(result.report.outcomes).toEqual([
      { path: 'README.md', status: 'rejected', code: 'PERMISSION_DENIED' },
    ]);
    expect(await readFile(join(root, 'README.md'), 'utf-8')).toBe(
      'alpha\nbeta\n',
    );
    expect(probe.lines).toEqual([]);
  });

  it('refuses a protected path under workspace write', async () => {
    const probe = await journalProbe();
    const result = await applyWriteBatch({
      projectRoot: root,
      runId: RUN_ID,
      revision: 1,
      targets: [targetOf('.git/config', 'old\n', 'new\n')],
      contents: new Map([['.git/config', Buffer.from('new\n')]]),
      permission: permissionOf(),
      journal: probe.journal,
      now: () => AT,
    });
    expect(result).toMatchObject({
      status: 'denied',
      stage: 'permission',
      code: 'PERMISSION_PROTECTED_PATH',
    });
  });

  it('refuses a target the user changed after the preview and preserves the edit', async () => {
    const probe = await journalProbe();
    await writeFile(join(root, 'README.md'), 'user edit\n', 'utf-8');
    const result = await applyWriteBatch({
      projectRoot: root,
      runId: RUN_ID,
      revision: 1,
      targets: [targetOf('README.md', 'alpha\nbeta\n', 'alpha\nBETA\n')],
      contents,
      permission: permissionOf(),
      journal: probe.journal,
      now: () => AT,
    });
    expect(result).toMatchObject({
      status: 'denied',
      stage: 'targets',
      code: 'TARGET_CHANGED',
    });
    if (result.status !== 'denied') return;
    expect(result.report.outcomes).toEqual([
      { path: 'README.md', status: 'rejected', code: 'TARGET_CHANGED' },
    ]);
    expect(await readFile(join(root, 'README.md'), 'utf-8')).toBe(
      'user edit\n',
    );
    expect(probe.lines).toEqual([]);
  });

  it('refuses a re-created file object even when its bytes are identical', async () => {
    const stats = await lstat(join(root, 'README.md'));
    if (stats.ino === 0 || stats.birthtimeMs === 0) return;
    const probe = await journalProbe();
    const result = await applyWriteBatch({
      projectRoot: root,
      runId: RUN_ID,
      revision: 1,
      targets: [
        targetOf('README.md', 'alpha\nbeta\n', 'alpha\nBETA\n', {
          fileId: String(stats.ino + 1),
          birthtimeMs: stats.birthtimeMs,
        }),
      ],
      contents,
      permission: permissionOf(),
      journal: probe.journal,
      now: () => AT,
    });
    expect(result).toMatchObject({
      status: 'denied',
      stage: 'targets',
      code: 'TARGET_REPLACED',
    });
    expect(await readFile(join(root, 'README.md'), 'utf-8')).toBe(
      'alpha\nbeta\n',
    );
  });

  it('keeps the target intact and the temp file gone when the write fails before rename', async () => {
    const probe = await journalProbe();
    const result = await applyWriteBatch({
      projectRoot: root,
      runId: RUN_ID,
      revision: 1,
      targets: [targetOf('README.md', 'alpha\nbeta\n', 'alpha\nBETA\n')],
      contents,
      permission: permissionOf(),
      journal: probe.journal,
      now: () => AT,
      hooks: {
        writeTempFile: () => Promise.reject(new Error('disk full')),
      },
    });
    expect(result).toMatchObject({ status: 'failed', code: 'WRITE_FAILED' });
    expect(await readFile(join(root, 'README.md'), 'utf-8')).toBe(
      'alpha\nbeta\n',
    );
    expect(
      probe.journal.recordsFor(RUN_ID).map((record) => record.kind),
    ).toEqual(['intent', 'failed']);
    const names = await readdir(root);
    expect(names.some((name) => name.endsWith('.tmp'))).toBe(false);
  });

  it('detects a tampered post-image through read-back verification', async () => {
    const probe = await journalProbe();
    const result = await applyWriteBatch({
      projectRoot: root,
      runId: RUN_ID,
      revision: 1,
      targets: [targetOf('README.md', 'alpha\nbeta\n', 'alpha\nBETA\n')],
      contents,
      permission: permissionOf(),
      journal: probe.journal,
      now: () => AT,
      hooks: {
        writeTempFile: (tempPath) => writeFile(tempPath, 'tampered\n', 'utf-8'),
      },
    });
    expect(result).toMatchObject({
      status: 'failed',
      code: 'VERIFY_FAILED',
    });
    if (result.status !== 'failed') return;
    expect(result.report.outcomes).toEqual([
      {
        path: 'README.md',
        status: 'verification_failed',
        code: 'VERIFY_FAILED',
      },
    ]);
    expect(result.report.applied[0]?.verification).toBe('unverified');
    expect(await readFile(join(root, 'README.md'), 'utf-8')).toBe('tampered\n');
  });

  it('refuses an in-place edit made while the temp file is prepared', async () => {
    const probe = await journalProbe();
    const result = await applyWriteBatch({
      projectRoot: root,
      runId: RUN_ID,
      revision: 1,
      targets: [targetOf('README.md', 'alpha\nbeta\n', 'alpha\nBETA\n')],
      contents,
      permission: permissionOf(),
      journal: probe.journal,
      now: () => AT,
      hooks: {
        beforeReplace: (absolutePath) =>
          writeFile(absolutePath, 'user edit\n', 'utf-8'),
      },
    });
    expect(result).toMatchObject({ status: 'failed', code: 'WRITE_FAILED' });
    if (result.status !== 'failed') return;
    expect(result.report.outcomes).toEqual([
      { path: 'README.md', status: 'failed', code: 'TARGET_CHANGED' },
    ]);
    expect(await readFile(join(root, 'README.md'), 'utf-8')).toBe(
      'user edit\n',
    );
    expect(
      probe.journal.recordsFor(RUN_ID).map((record) => record.kind),
    ).toEqual(['intent', 'failed']);
    expect((await readdir(root)).some((name) => name.endsWith('.tmp'))).toBe(
      false,
    );
  });

  it('records an unverified applied state when the post-image cannot be read back', async () => {
    const probe = await journalProbe();
    const target = targetOf('README.md', 'alpha\nbeta\n', 'alpha\nBETA\n');
    const result = await applyWriteBatch({
      projectRoot: root,
      runId: RUN_ID,
      revision: 1,
      targets: [target],
      contents,
      permission: permissionOf(),
      journal: probe.journal,
      now: () => AT,
      hooks: {
        // Over the read-back budget: the rename happens, the read must not.
        writeTempFile: (tempPath) =>
          writeFile(tempPath, Buffer.alloc(WRITE_LIMITS.targetBytes + 1, 0x61)),
      },
    });
    expect(result).toMatchObject({ status: 'failed', code: 'VERIFY_FAILED' });
    if (result.status !== 'failed') return;
    expect(result.report.partial).toBe(true);
    const records = probe.journal.recordsFor(RUN_ID);
    expect(records.map((record) => record.kind)).toEqual(['intent', 'applied']);
    expect(records[1]).toMatchObject({
      kind: 'applied',
      verification: 'unverified',
      observedSha256: null,
    });
    const plan = planRecovery({
      runId: RUN_ID,
      permission: permissionOf(),
      targets: [target],
      records,
      observations: [
        {
          path: 'README.md',
          state: 'changed',
          observed: null,
          identity: null,
        },
      ],
    });
    expect(plan.outOfScope).toEqual([]);
    expect(plan.conflicts.map((action) => action.path)).toEqual(['README.md']);
    expect(plan.actions.map((action) => action.action)).toEqual(['conflict']);
  });

  it('reports a partial batch when the second target fails', async () => {
    const probe = await journalProbe();
    const result = await applyWriteBatch({
      projectRoot: root,
      runId: RUN_ID,
      revision: 1,
      targets: [
        targetOf('README.md', 'alpha\nbeta\n', 'alpha\nBETA\n'),
        targetOf('notes.txt', 'one\ntwo\n', 'one\nTWO\n'),
      ],
      contents,
      permission: permissionOf(),
      journal: probe.journal,
      now: () => AT,
      hooks: {
        beforeReplace: (absolutePath) =>
          absolutePath.endsWith('notes.txt')
            ? Promise.reject(new Error('locked'))
            : Promise.resolve(),
      },
    });
    expect(result).toMatchObject({ status: 'failed', code: 'WRITE_FAILED' });
    if (result.status !== 'failed') return;
    expect(result.report.partial).toBe(true);
    expect(result.report.applied.map((item) => item.path)).toEqual([
      'README.md',
    ]);
    expect(result.report.outcomes).toEqual([
      { path: 'README.md', status: 'applied', code: null },
      { path: 'notes.txt', status: 'failed', code: 'WRITE_FAILED' },
    ]);
    expect(await readFile(join(root, 'README.md'), 'utf-8')).toBe(
      'alpha\nBETA\n',
    );
    expect(await readFile(join(root, 'notes.txt'), 'utf-8')).toBe('one\ntwo\n');
  });

  it('refuses to write when the journal cannot record the intent', async () => {
    const probe = await journalProbe(true);
    const result = await applyWriteBatch({
      projectRoot: root,
      runId: RUN_ID,
      revision: 1,
      targets: [targetOf('README.md', 'alpha\nbeta\n', 'alpha\nBETA\n')],
      contents,
      permission: permissionOf(),
      journal: probe.journal,
      now: () => AT,
    });
    expect(result.status).toBe('journal-unavailable');
    expect(await readFile(join(root, 'README.md'), 'utf-8')).toBe(
      'alpha\nbeta\n',
    );
  });
});

describe('write permission store', () => {
  it('binds a record to the session, project and window', () => {
    const store = new WritePermissionStore(() => new Date(AT));
    store.set({
      sessionId: 'session-a',
      projectId: 'project-a',
      mode: 'workspace_write',
      riskAcknowledged: false,
      webContentsId: 7,
      windowEpoch: 3,
    });
    const binding = { webContentsId: 7, windowEpoch: 3 };
    expect(store.get('session-a', 'project-a', binding)?.mode).toBe(
      'workspace_write',
    );
    expect(store.get('session-a', 'project-b', binding)).toBeNull();
    expect(
      store.get('session-a', 'project-a', { ...binding, windowEpoch: 4 }),
    ).toBeNull();
    store.forgetWindow(7);
    expect(store.get('session-a', 'project-a', binding)).toBeNull();
  });

  it('rejects a risky mode without an explicit acknowledgement', () => {
    const store = new WritePermissionStore(() => new Date(AT));
    expect(() =>
      store.set({
        sessionId: 'session-a',
        projectId: 'project-a',
        mode: 'full_access',
        riskAcknowledged: false,
        webContentsId: 7,
        windowEpoch: 3,
      }),
    ).toThrow();
    expect(
      store.set({
        sessionId: 'session-a',
        projectId: 'project-a',
        mode: 'full_access',
        riskAcknowledged: true,
        webContentsId: 7,
        windowEpoch: 3,
      }).mode,
    ).toBe('full_access');
  });

  it('lets a lower mode replace a higher one immediately', () => {
    const store = new WritePermissionStore(() => new Date(AT));
    const binding = { webContentsId: 7, windowEpoch: 3 };
    store.set({
      sessionId: 'session-a',
      projectId: 'project-a',
      mode: 'full_access',
      riskAcknowledged: true,
      ...binding,
    });
    store.set({
      sessionId: 'session-a',
      projectId: 'project-a',
      mode: 'read_only',
      riskAcknowledged: false,
      ...binding,
    });
    expect(store.get('session-a', 'project-a', binding)?.mode).toBe(
      'read_only',
    );
  });
});

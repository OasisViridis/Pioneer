import { createHash } from 'node:crypto';
import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  WriteChangeJournalRecordSchema,
  WritePermissionSchema,
  WriteTargetsSchema,
  WriteTargetSchema,
  WriteTargetPathSchema,
  WRITE_PERMISSION_MODES,
  WRITE_PROTECTED_PATHS,
  WRITE_REJECTION_CODES,
  WRITE_CHANGE_FAILURE_CODES,
  WRITE_LIMITS,
  type WriteChangeJournalRecord,
  type WritePermission,
  type WriteTarget,
} from '../../apps/desktop/src/shared/contracts/write-permission';
import {
  checkWritePermission,
  evaluateWriteTargets,
  observationAllowance,
  permissionDeniedOutcomes,
  planRecovery,
  rejectedOutcomes,
  rejectionCodeFor,
  summarizeWriteOutcomes,
} from '../../apps/desktop/src/main/harness/write-permission/decision';
import {
  observeWriteTarget,
  observeWriteTargets,
} from '../../apps/desktop/src/main/harness/write-permission/observe-targets';

/**
 * Contract probes for the P4-D1 decision spec (#18). Every probe asserts an
 * observable decision or state, never a private call. Fixtures live in a
 * per-test temporary project; the repository fixtures are never touched and no
 * probe writes to an existing project.
 */

const AT = Date.parse('2026-10-27T12:00:00.000Z');

/** Repo root resolved from this module, so the probes do not depend on cwd. */
const sourceRootPath = fileURLToPath(new URL('../..', import.meta.url));

const RUN_ID = 'run-0000000000000001';
const AT_ISO = new Date(AT).toISOString();

function sha256Of(value: string): string {
  return createHash('sha256').update(Buffer.from(value, 'utf-8')).digest('hex');
}

/** Index into a fixed fixture list without a non-null assertion. */
function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined)
    throw new Error(`missing fixture index ${String(index)}`);
  return item;
}

function stateOf(value: string) {
  return {
    kind: 'file' as const,
    bytes: Buffer.byteLength(value, 'utf-8'),
    sha256: sha256Of(value),
  };
}

function targetOf(
  path: string,
  before: string,
  after: string,
  identity: WriteTarget['identity'] = null,
): WriteTarget {
  return WriteTargetSchema.parse({
    path,
    before: stateOf(before),
    after: stateOf(after),
    identity,
  });
}

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
    webContentsId: 3,
    windowEpoch: 7,
    grantedAt: AT_ISO,
    riskAcknowledged: false,
    ...overrides,
  });
}

function intentRecord(
  path: string,
  beforeSha256: string,
  at = AT_ISO,
): WriteChangeJournalRecord {
  return WriteChangeJournalRecordSchema.parse({
    kind: 'intent',
    runId: RUN_ID,
    revision: 1,
    path,
    beforeSha256,
    at,
  });
}

function appliedRecord(
  target: WriteTarget,
  overrides: Record<string, unknown> = {},
): WriteChangeJournalRecord {
  return WriteChangeJournalRecordSchema.parse({
    kind: 'applied',
    runId: RUN_ID,
    revision: 1,
    path: target.path,
    afterSha256: target.after.sha256,
    observedSha256: target.after.sha256,
    observedIdentity: null,
    verification: 'verified',
    at: '2026-10-27T12:00:02.000Z',
    ...overrides,
  });
}

function recoveryRecord(
  path: string,
  observedSha256: string | null,
  action: 'restore' | 'preserve' | 'already_restored' = 'restore',
): WriteChangeJournalRecord {
  return WriteChangeJournalRecordSchema.parse({
    kind: 'recovery',
    runId: RUN_ID,
    revision: 1,
    path,
    action,
    observedSha256,
    at: '2026-10-27T12:00:03.000Z',
  });
}

/** Declares intent then applies: the only chain that proves a write. */
function provenWrite(target: WriteTarget): WriteChangeJournalRecord[] {
  return [
    intentRecord(target.path, target.before.sha256),
    appliedRecord(target),
  ];
}

describe('write permission contract', () => {
  it('parses a well-formed permission grant', () => {
    const permission = permissionOf();
    expect(permission.mode).toBe('workspace_write');
    expect(permission.scope).toBe('all_targets');
    expect(permission.protectedPaths).toEqual(['.git']);
  });

  it('offers exactly the four selector modes', () => {
    expect([...WRITE_PERMISSION_MODES]).toEqual([
      'read_only',
      'workspace_write',
      'full_access',
      'auto_review',
    ]);
  });

  it('requires a risk acknowledgement for full access and auto review', () => {
    for (const mode of ['full_access', 'auto_review'] as const) {
      expect(
        WritePermissionSchema.safeParse({
          ...permissionOf(),
          mode,
          riskAcknowledged: false,
        }).success,
      ).toBe(false);
      expect(
        WritePermissionSchema.parse({
          ...permissionOf(),
          mode,
          riskAcknowledged: true,
        }).mode,
      ).toBe(mode);
    }
  });

  it('lets the scope name an explicit subset', () => {
    const parsed = permissionOf({ scope: ['src/a.ts'] });
    expect(parsed.scope).toEqual(['src/a.ts']);
  });

  it('rejects an unknown mode and an empty scope list', () => {
    expect(
      WritePermissionSchema.safeParse({ ...permissionOf(), mode: 'root' })
        .success,
    ).toBe(false);
    expect(
      WritePermissionSchema.safeParse({ ...permissionOf(), scope: [] }).success,
    ).toBe(false);
  });

  it('rejects an unknown field on the grant', () => {
    expect(
      WritePermissionSchema.safeParse({ ...permissionOf(), expiry: AT_ISO })
        .success,
    ).toBe(false);
  });

  it('rejects duplicate and case-folded duplicate targets', () => {
    const one = targetOf('src/a.ts', 'a', 'b');
    const dup = targetOf('SRC/A.TS', 'a', 'b');
    expect(WriteTargetsSchema.safeParse([one, one]).success).toBe(false);
    expect(WriteTargetsSchema.safeParse([one, dup]).success).toBe(false);
  });

  it('rejects a target above the per-file byte budget', () => {
    expect(
      WriteTargetSchema.safeParse({
        path: 'src/a.ts',
        before: {
          kind: 'file',
          bytes: WRITE_LIMITS.targetBytes + 1,
          sha256: sha256Of('a'),
        },
        after: stateOf('b'),
        identity: null,
      }).success,
    ).toBe(false);
  });

  it('rejects a batch above the total byte budget', () => {
    const big = 'x'.repeat(WRITE_LIMITS.targetBytes);
    const targets = [big, big, big, big, big].map((body, index) =>
      targetOf(`src/${String(index)}.ts`, 'a', body),
    );
    expect(WriteTargetsSchema.safeParse(targets).success).toBe(false);
  });

  it('rejects unsafe paths and accepts plain project-relative ones', () => {
    for (const path of [
      '/abs.ts',
      '../escape.ts',
      'src\\a.ts',
      'con.txt',
      'src/a. ',
      'a'
        .repeat(WRITE_LIMITS.pathComponents + 1)
        .split('')
        .join('/'),
    ]) {
      expect(WriteTargetPathSchema.safeParse(path).success, path).toBe(false);
    }
    expect(WriteTargetPathSchema.safeParse('src/deep/a.ts').success).toBe(true);
  });

  it('enumerates the rejection and failure vocabularies', () => {
    expect([...WRITE_REJECTION_CODES]).toContain('TARGET_CHANGED');
    expect([...WRITE_CHANGE_FAILURE_CODES]).toContain('PERMISSION_DENIED');
    expect([...WRITE_CHANGE_FAILURE_CODES]).not.toContain('SCOPE_DENIED');
  });

  it('keeps a verified journal record honest and rejects an inconsistent one', () => {
    const target = targetOf('src/a.ts', 'a', 'b');
    expect(appliedRecord(target).kind).toBe('applied');
    expect(
      WriteChangeJournalRecordSchema.safeParse({
        kind: 'applied',
        runId: RUN_ID,
        revision: 1,
        path: 'src/a.ts',
        afterSha256: target.after.sha256,
        observedSha256: sha256Of('other'),
        observedIdentity: null,
        verification: 'verified',
        at: AT_ISO,
      }).success,
    ).toBe(false);
  });
});

describe('write permission scope', () => {
  it('refuses every write in view-only mode', () => {
    const targets = [targetOf('src/a.ts', 'a', 'b')];
    expect(
      checkWritePermission(targets, permissionOf({ mode: 'read_only' })),
    ).toMatchObject({
      ok: false,
      code: 'PERMISSION_READ_ONLY',
    });
  });

  it('allows a project file in workspace-write mode', () => {
    const targets = [targetOf('src/a.ts', 'a', 'b')];
    expect(checkWritePermission(targets, permissionOf())).toMatchObject({
      ok: true,
      autoReview: false,
    });
  });

  it('keeps .git read-only in the workspace modes', () => {
    for (const path of [
      '.git',
      '.git/config',
      'vendor/x/.git/config',
      '.GIT/config',
    ]) {
      expect(
        checkWritePermission([targetOf(path, 'a', 'b')], permissionOf()),
        path,
      ).toMatchObject({ ok: false, code: 'PERMISSION_PROTECTED_PATH' });
      expect(
        checkWritePermission(
          [targetOf(path, 'a', 'b')],
          permissionOf({ mode: 'auto_review', riskAcknowledged: true }),
        ),
        path,
      ).toMatchObject({ ok: false, code: 'PERMISSION_PROTECTED_PATH' });
    }
  });

  it('keeps .git protected even when the grant omits it', () => {
    expect(
      checkWritePermission(
        [targetOf('.git/config', 'a', 'b')],
        permissionOf({ protectedPaths: ['src/generated'] }),
      ),
    ).toMatchObject({ ok: false, code: 'PERMISSION_PROTECTED_PATH' });
    expect(
      checkWritePermission(
        [targetOf('src/generated/types.ts', 'a', 'b')],
        permissionOf({ protectedPaths: ['src/generated'] }),
      ),
    ).toMatchObject({ ok: false, code: 'PERMISSION_PROTECTED_PATH' });
  });

  it('does not treat a lookalike prefix as protected', () => {
    expect(
      checkWritePermission(
        [targetOf('.github/workflows/ci.yml', 'a', 'b')],
        permissionOf(),
      ),
    ).toMatchObject({ ok: true });
  });

  it('allows protected paths only in full-access mode', () => {
    expect(
      checkWritePermission(
        [targetOf('.git/config', 'a', 'b')],
        permissionOf({ mode: 'full_access', riskAcknowledged: true }),
      ),
    ).toMatchObject({ ok: true });
  });

  it('denies a batch that steps outside the granted scope', () => {
    const targets = [
      targetOf('src/a.ts', 'a', 'b'),
      targetOf('src/b.ts', 'a', 'b'),
    ];
    expect(
      checkWritePermission(targets, permissionOf({ scope: ['src/a.ts'] })),
    ).toMatchObject({
      ok: false,
      code: 'PERMISSION_OUT_OF_SCOPE',
      path: 'src/b.ts',
    });
    expect(
      checkWritePermission(
        targets,
        permissionOf({ scope: ['src/a.ts', 'src/b.ts'] }),
      ),
    ).toMatchObject({ ok: true });
  });

  it('marks auto review as permission to write without a confirmation', () => {
    const decision = checkWritePermission(
      [targetOf('src/a.ts', 'a', 'b')],
      permissionOf({ mode: 'auto_review', riskAcknowledged: true }),
    );
    expect(decision).toMatchObject({ ok: true, autoReview: true });
  });

  it('maps a permission denial to untouched targets', () => {
    const targets = [targetOf('src/a.ts', 'a', 'b')];
    expect(permissionDeniedOutcomes(targets)).toEqual([
      { path: 'src/a.ts', status: 'rejected', code: 'PERMISSION_DENIED' },
    ]);
  });
});

describe('full access and protected paths', () => {
  it('lets full access observe and accept a protected path end to end', async () => {
    const permission = permissionOf({
      mode: 'full_access',
      riskAcknowledged: true,
    });
    await write(projectRoot, '.git/config', 'core');
    const target = targetOf('.git/config', 'core', 'core\nedited');
    expect(checkWritePermission([target], permission)).toMatchObject({
      ok: true,
    });
    const observations = await observeWriteTargets(projectRoot, [target], {
      allowProtectedPaths: observationAllowance(permission),
    });
    expect(observations[0]).toMatchObject({ state: 'unchanged' });
    expect(evaluateWriteTargets([target], observations)).toEqual({ ok: true });
  });

  it('keeps a protected path unreadable in the workspace modes', async () => {
    const permission = permissionOf();
    await write(projectRoot, '.git/config', 'core');
    const target = targetOf('.git/config', 'core', 'core\nedited');
    expect(observationAllowance(permission)).toEqual([]);
    const observations = await observeWriteTargets(projectRoot, [target], {
      allowProtectedPaths: observationAllowance(permission),
    });
    expect(observations[0]).toMatchObject({ state: 'unreadable' });
    const verdict = evaluateWriteTargets([target], observations);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.error.code).toBe('TARGET_UNREADABLE');
  });
});

describe('write-time target check', () => {
  it('allows the whole batch when every target is unchanged', async () => {
    const projectRoot = await makeProject();
    const target = await seed(projectRoot, 'src/a.ts', 'a');
    const observations = await observeWriteTargets(projectRoot, [target]);
    expect(evaluateWriteTargets([target], observations)).toEqual({ ok: true });
  });

  it('refuses the whole batch when one target changed', async () => {
    const projectRoot = await makeProject();
    const file = await seed(projectRoot, 'src/a.ts', 'a');
    await write(projectRoot, 'src/a.ts', 'user edit');
    const clean = await seed(projectRoot, 'src/b.ts', 'b');
    const observations = await observeWriteTargets(projectRoot, [file, clean]);
    const verdict = evaluateWriteTargets([file, clean], observations);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.error.code).toBe('TARGET_CHANGED');
    expect(verdict.error.targets).toEqual([
      { path: 'src/a.ts', state: 'changed' },
    ]);
  });

  it('refuses a target that vanished', async () => {
    const projectRoot = await makeProject();
    const target = await seed(projectRoot, 'src/a.ts', 'a');
    await rm(join(projectRoot, 'src/a.ts'));
    const observations = await observeWriteTargets(projectRoot, [target]);
    const verdict = evaluateWriteTargets([target], observations);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.error.code).toBe('TARGET_MISSING');
  });

  it('refuses a target whose file object was replaced', async () => {
    const projectRoot = await makeProject();
    const target = await seed(projectRoot, 'src/a.ts', 'a');
    const observations = await observeWriteTargets(projectRoot, [target]);
    const replaced: WriteTarget = {
      ...target,
      identity: { fileId: 'other', birthtimeMs: 1 },
    };
    const verdict = evaluateWriteTargets([replaced], observations);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.error.code).toBe('TARGET_REPLACED');
  });

  it('refuses a target whose identity the platform will not report', async () => {
    const projectRoot = await makeProject();
    const target = await seed(projectRoot, 'src/a.ts', 'a');
    const observations = await observeWriteTargets(projectRoot, [target]);
    const withIdentity: WriteTarget = {
      ...target,
      identity: { fileId: '1', birthtimeMs: 1 },
    };
    const verdict = evaluateWriteTargets(
      [withIdentity],
      observations.map((observation) => ({ ...observation, identity: null })),
    );
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.error.code).toBe('TARGET_IDENTITY_UNAVAILABLE');
  });

  it('compares the whole identity, not just the file index', async () => {
    const projectRoot = await makeProject();
    const target = await seed(projectRoot, 'src/a.ts', 'a');
    const observations = await observeWriteTargets(projectRoot, [target]);
    const current = observations[0]?.identity;
    if (current === null || current === undefined) return;
    const sameIdOtherBirth: WriteTarget = {
      ...target,
      identity: {
        fileId: current.fileId,
        birthtimeMs: current.birthtimeMs + 1,
      },
    };
    const verdict = evaluateWriteTargets([sameIdOtherBirth], observations);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.error.code).toBe('TARGET_REPLACED');
  });

  it('maps every observed state to its rejection code', () => {
    expect(rejectionCodeFor('unstable')).toBe('TARGET_UNSTABLE');
    expect(rejectionCodeFor('too_large')).toBe('TARGET_TOO_LARGE');
    expect(rejectionCodeFor('link_not_allowed')).toBe(
      'TARGET_LINK_NOT_ALLOWED',
    );
    expect(rejectionCodeFor('not_regular_file')).toBe(
      'TARGET_NOT_REGULAR_FILE',
    );
    expect(rejectionCodeFor('unreadable')).toBe('TARGET_UNREADABLE');
  });

  it('marks every target of a refused batch as rejected', () => {
    const targets = [
      targetOf('src/a.ts', 'a', 'b'),
      targetOf('src/b.ts', 'a', 'b'),
    ];
    expect(
      rejectedOutcomes(targets, {
        ok: false,
        error: {
          code: 'TARGET_CHANGED',
          message: 'stale',
          retryable: false,
          targets: [{ path: 'src/a.ts', state: 'changed' }],
        },
      }),
    ).toEqual([
      { path: 'src/a.ts', status: 'rejected', code: 'TARGET_CHANGED' },
      { path: 'src/b.ts', status: 'rejected', code: 'TARGET_CHANGED' },
    ]);
  });
});

let projectRoot = '';

async function makeProject(): Promise<string> {
  // Resolve the real path: CI's tmpdir goes through a junction or short name,
  // and main's read-only policy compares resolved paths.
  const container = await mkdtemp(join(tmpdir(), 'pioneer-write-permission-'));
  const root = join(container, 'project');
  await mkdir(root, { recursive: true });
  return realpath(root);
}

async function write(
  root: string,
  relativePath: string,
  content: string,
): Promise<void> {
  await mkdir(join(root, relativePath, '..'), { recursive: true });
  const { writeFile } = await import('node:fs/promises');
  await writeFile(join(root, relativePath), content);
}

async function seed(
  root: string,
  relativePath: string,
  content: string,
): Promise<WriteTarget> {
  await write(root, relativePath, content);
  const identity = await identityFor(root, relativePath);
  return {
    ...targetOf(relativePath, content, `${content}\nchanged`),
    identity,
  };
}

async function identityFor(
  root: string,
  relativePath: string,
): Promise<WriteTarget['identity']> {
  const stats = await lstat(join(root, relativePath));
  if (stats.ino === 0 || stats.birthtimeMs === 0) return null;
  return { fileId: String(stats.ino), birthtimeMs: stats.birthtimeMs };
}

beforeEach(async () => {
  projectRoot = await makeProject();
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

const sourceRoot = join(sourceRootPath, 'apps/desktop/src');

describe('target observation', () => {
  it('reports an unchanged target with the observed bytes', async () => {
    const target = await seed(projectRoot, 'src/a.ts', 'stable');
    const observation = await observeWriteTarget(projectRoot, target);
    expect(observation.state).toBe('unchanged');
    expect(observation.observed).toEqual(target.before);
  });

  it('reports a same-size content change as changed', async () => {
    const target = await seed(projectRoot, 'src/a.ts', 'aaaa');
    await write(projectRoot, 'src/a.ts', 'bbbb');
    expect((await observeWriteTarget(projectRoot, target)).state).toBe(
      'changed',
    );
  });

  it('reports growth and truncation as changed', async () => {
    const grown = await seed(projectRoot, 'src/a.ts', 'short');
    await write(projectRoot, 'src/a.ts', 'much longer');
    expect((await observeWriteTarget(projectRoot, grown)).state).toBe(
      'changed',
    );
    const truncated = await seed(projectRoot, 'src/b.ts', 'long content');
    await write(projectRoot, 'src/b.ts', 'x');
    expect((await observeWriteTarget(projectRoot, truncated)).state).toBe(
      'changed',
    );
  });

  it('reports a file changed during the read as unstable', async () => {
    const target = await seed(projectRoot, 'src/a.ts', 'stable');
    const observation = await observeWriteTarget(projectRoot, target, {
      afterRead: async () => {
        await write(projectRoot, 'src/a.ts', 'changed mid-read');
      },
    });
    expect(observation.state).toBe('unstable');
  });

  it('reports a deleted and re-created file as replaced, or skips when reused', async (context) => {
    const target = await seed(projectRoot, 'src/a.ts', 'stable');
    const before = await identityFor(projectRoot, 'src/a.ts');
    await rm(join(projectRoot, 'src/a.ts'));
    await write(projectRoot, 'src/a.ts', 'stable');
    const after = await identityFor(projectRoot, 'src/a.ts');
    if (
      before !== null &&
      after !== null &&
      before.fileId === after.fileId &&
      before.birthtimeMs === after.birthtimeMs
    ) {
      context.skip();
      return;
    }
    expect((await observeWriteTarget(projectRoot, target)).state).toBe(
      'replaced',
    );
  });

  it('reports a missing target, including a moved-away one', async () => {
    const target = await seed(projectRoot, 'src/a.ts', 'stable');
    await rm(join(projectRoot, 'src/a.ts'));
    expect((await observeWriteTarget(projectRoot, target)).state).toBe(
      'missing',
    );
  });

  it('reports a directory at the target path as not a regular file', async () => {
    await mkdir(join(projectRoot, 'src/dir'), { recursive: true });
    const target = targetOf('src/dir', 'a', 'b');
    expect((await observeWriteTarget(projectRoot, target)).state).toBe(
      'not_regular_file',
    );
  });

  it('reports a link at the target path as link_not_allowed, or skips', async (context) => {
    const { symlink } = await import('node:fs/promises');
    await mkdir(join(projectRoot, 'src'), { recursive: true });
    const target = targetOf('src/link.ts', 'a', 'b');
    try {
      await symlink(
        join(projectRoot, 'src', 'elsewhere.ts'),
        join(projectRoot, 'src/link.ts'),
      );
    } catch {
      context.skip();
      return;
    }
    expect((await observeWriteTarget(projectRoot, target)).state).toBe(
      'link_not_allowed',
    );
  });

  it('reports a hard-linked target as link_not_allowed', async () => {
    const { link } = await import('node:fs/promises');
    const target = await seed(projectRoot, 'src/a.ts', 'stable');
    await link(join(projectRoot, 'src/a.ts'), join(projectRoot, 'src/b.ts'));
    expect((await observeWriteTarget(projectRoot, target)).state).toBe(
      'link_not_allowed',
    );
  });

  it('reports a sensitive target as unreadable', async () => {
    const target = await seed(projectRoot, '.env.local', 'secret');
    expect((await observeWriteTarget(projectRoot, target)).state).toBe(
      'unreadable',
    );
  });

  it('reports a target above the read budget as too_large', async () => {
    const target = targetOf('src/big.bin', 'a', 'b');
    await write(projectRoot, 'src/big.bin', 'x');
    const { truncate } = await import('node:fs/promises');
    await truncate(
      join(projectRoot, 'src/big.bin'),
      WRITE_LIMITS.targetBytes + 1,
    );
    expect((await observeWriteTarget(projectRoot, target)).state).toBe(
      'too_large',
    );
  });

  it('observes every target in batch order', async () => {
    const first = await seed(projectRoot, 'src/a.ts', 'a');
    const second = await seed(projectRoot, 'src/b.ts', 'b');
    const observations = await observeWriteTargets(projectRoot, [
      second,
      first,
    ]);
    expect(observations.map((observation) => observation.path)).toEqual([
      'src/b.ts',
      'src/a.ts',
    ]);
  });
});

describe('write outcomes', () => {
  const targets = [
    targetOf('src/a.ts', 'a', 'a2'),
    targetOf('src/b.ts', 'b', 'b2'),
    targetOf('src/c.ts', 'c', 'c2'),
    targetOf('src/d.ts', 'd', 'd2'),
  ];

  it('reports targets without records as unchanged', () => {
    expect(summarizeWriteOutcomes(RUN_ID, targets, [])).toEqual([
      { path: 'src/a.ts', status: 'unchanged', code: null },
      { path: 'src/b.ts', status: 'unchanged', code: null },
      { path: 'src/c.ts', status: 'unchanged', code: null },
      { path: 'src/d.ts', status: 'unchanged', code: null },
    ]);
  });

  it('reports a proven write as applied', () => {
    const records = provenWrite(at(targets, 0));
    expect(summarizeWriteOutcomes(RUN_ID, targets, records)[0]).toEqual({
      path: 'src/a.ts',
      status: 'applied',
      code: null,
    });
  });

  it('reports an unverified write as verification failed', () => {
    const target = at(targets, 0);
    const records = [
      intentRecord(target.path, target.before.sha256),
      appliedRecord(target, { verification: 'unverified' }),
    ];
    expect(summarizeWriteOutcomes(RUN_ID, targets, records)[0]).toEqual({
      path: 'src/a.ts',
      status: 'verification_failed',
      code: 'VERIFY_FAILED',
    });
  });

  it('refuses an applied record without a matching intent', () => {
    const target = at(targets, 0);
    expect(
      summarizeWriteOutcomes(RUN_ID, targets, [appliedRecord(target)])[0],
    ).toMatchObject({ status: 'verification_failed' });
    expect(
      summarizeWriteOutcomes(RUN_ID, targets, [
        intentRecord(target.path, sha256Of('stale')),
        appliedRecord(target),
      ])[0],
    ).toMatchObject({ status: 'verification_failed' });
  });

  it('refuses an applied record that claims another after-image', () => {
    const target = at(targets, 0);
    const records = [
      intentRecord(target.path, target.before.sha256),
      appliedRecord(target, {
        afterSha256: sha256Of('other'),
        observedSha256: sha256Of('other'),
      }),
    ];
    expect(summarizeWriteOutcomes(RUN_ID, targets, records)[0]).toMatchObject({
      status: 'verification_failed',
    });
  });

  it('reports a failed write and a mid-write target separately', () => {
    const failed = WriteChangeJournalRecordSchema.parse({
      kind: 'failed',
      runId: RUN_ID,
      revision: 1,
      path: 'src/b.ts',
      code: 'CANCELLED',
      at: AT_ISO,
    });
    const records = [
      ...provenWrite(at(targets, 0)),
      failed,
      intentRecord('src/c.ts', at(targets, 2).before.sha256),
    ];
    expect(
      summarizeWriteOutcomes(RUN_ID, targets, records).slice(1, 3),
    ).toEqual([
      { path: 'src/b.ts', status: 'failed', code: 'CANCELLED' },
      { path: 'src/c.ts', status: 'unknown', code: 'UNKNOWN' },
    ]);
  });

  it('refuses an intent recorded after the applied record', () => {
    const target = targetOf('src/a.ts', 'a', 'a2');
    const records = [
      WriteChangeJournalRecordSchema.parse({
        kind: 'intent',
        runId: RUN_ID,
        revision: 1,
        path: 'src/a.ts',
        beforeSha256: target.before.sha256,
        at: '2026-10-27T12:00:09.000Z',
      }),
      appliedRecord(target),
    ];
    expect(summarizeWriteOutcomes(RUN_ID, [target], records)[0]).toMatchObject({
      status: 'verification_failed',
    });
  });

  it('reports a proven restore as restored and an unproven one as failed', () => {
    const target = at(targets, 0);
    const proven = [
      ...provenWrite(target),
      recoveryRecord(target.path, target.before.sha256),
    ];
    expect(summarizeWriteOutcomes(RUN_ID, targets, proven)[0]).toEqual({
      path: 'src/a.ts',
      status: 'restored',
      code: null,
    });
    expect(
      summarizeWriteOutcomes(RUN_ID, targets, [
        recoveryRecord(target.path, target.before.sha256),
      ])[0],
    ).toEqual({
      path: 'src/a.ts',
      status: 'failed',
      code: 'RECOVERY_CONFLICT',
    });
  });
});

describe('recovery planning', () => {
  it('restores only a file that still holds this run post-image', async () => {
    const target = await seed(projectRoot, 'src/index.ts', 'before\n');
    await write(projectRoot, 'src/index.ts', 'before\n\nchanged');
    const observations = await observeWriteTargets(projectRoot, [target]);
    const plan = planRecovery({
      runId: RUN_ID,
      targets: [target],
      records: provenWrite(target),
      observations,
    });
    expect(plan.actions[0]).toMatchObject({
      path: 'src/index.ts',
      action: 'restore',
      state: 'changed',
    });
  });

  it('treats an untouched file as already restored', async () => {
    const target = await seed(projectRoot, 'src/index.ts', 'before\n');
    const observations = await observeWriteTargets(projectRoot, [target]);
    const plan = planRecovery({
      runId: RUN_ID,
      targets: [target],
      records: provenWrite(target),
      observations,
    });
    expect(plan.actions[0]).toMatchObject({
      path: 'src/index.ts',
      action: 'already_restored',
      state: 'unchanged',
    });
  });

  it('preserves a user edit instead of overwriting it', async () => {
    const target = await seed(projectRoot, 'src/index.ts', 'before\n');
    await write(projectRoot, 'src/index.ts', 'user edit\n');
    const observations = await observeWriteTargets(projectRoot, [target]);
    const plan = planRecovery({
      runId: RUN_ID,
      targets: [target],
      records: provenWrite(target),
      observations,
    });
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0]).toMatchObject({ action: 'conflict' });
    expect(plan.outOfScope).toEqual([]);
  });

  it('keeps a target with no record out of scope', async () => {
    const target = await seed(projectRoot, 'src/index.ts', 'before\n');
    const observations = await observeWriteTargets(projectRoot, [target]);
    const plan = planRecovery({
      runId: RUN_ID,
      targets: [target],
      records: [],
      observations,
    });
    expect(plan.outOfScope).toEqual(['src/index.ts']);
    expect(plan.actions).toEqual([]);
  });

  it('keeps a failed write with no applied record out of scope', async () => {
    const target = await seed(projectRoot, 'src/index.ts', 'before\n');
    const observations = await observeWriteTargets(projectRoot, [target]);
    const failed = WriteChangeJournalRecordSchema.parse({
      kind: 'failed',
      runId: RUN_ID,
      revision: 1,
      path: 'src/index.ts',
      code: 'WRITE_FAILED',
      at: '2026-10-27T12:00:02.000Z',
    });
    const plan = planRecovery({
      runId: RUN_ID,
      targets: [target],
      records: [failed],
      observations,
    });
    expect(plan.outOfScope).toEqual(['src/index.ts']);
    expect(plan.actions).toEqual([]);
  });

  it('does not trust an orphan recovery record', async () => {
    const target = await seed(projectRoot, 'src/index.ts', 'before\n');
    const observations = await observeWriteTargets(projectRoot, [target]);
    const plan = planRecovery({
      runId: RUN_ID,
      targets: [target],
      records: [recoveryRecord(target.path, target.before.sha256)],
      observations,
    });
    expect(plan.actions[0]).toMatchObject({ action: 'conflict' });
  });

  it('does not treat a failed record after a real write as out of scope', async () => {
    const target = await seed(projectRoot, 'src/index.ts', 'before\n');
    const observations = await observeWriteTargets(projectRoot, [target]);
    const failed = WriteChangeJournalRecordSchema.parse({
      kind: 'failed',
      runId: RUN_ID,
      revision: 1,
      path: 'src/index.ts',
      code: 'VERIFY_FAILED',
      at: '2026-10-27T12:00:05.000Z',
    });
    const plan = planRecovery({
      runId: RUN_ID,
      targets: [target],
      records: [...provenWrite(target), failed],
      observations,
    });
    expect(plan.outOfScope).toEqual([]);
    expect(plan.actions[0]).toMatchObject({ action: 'conflict' });
  });

  it('treats an interrupted write as a conflict instead of guessing', async () => {
    const target = await seed(projectRoot, 'src/index.ts', 'before\n');
    const observations = await observeWriteTargets(projectRoot, [target]);
    const plan = planRecovery({
      runId: RUN_ID,
      targets: [target],
      records: [intentRecord(target.path, target.before.sha256)],
      observations,
    });
    expect(plan.actions[0]).toMatchObject({ action: 'conflict' });
  });

  it('refuses to recover an applied record that was never verified', async () => {
    const target = await seed(projectRoot, 'src/index.ts', 'before\n');
    const observations = await observeWriteTargets(projectRoot, [target]);
    const plan = planRecovery({
      runId: RUN_ID,
      targets: [target],
      records: [
        intentRecord(target.path, target.before.sha256),
        appliedRecord(target, { verification: 'unverified' }),
      ],
      observations,
    });
    expect(plan.actions[0]).toMatchObject({ action: 'conflict' });
  });

  it('does not replay a target that already has a recovery record', async () => {
    const target = await seed(projectRoot, 'src/index.ts', 'before\n');
    const observations = await observeWriteTargets(projectRoot, [target]);
    const plan = planRecovery({
      runId: RUN_ID,
      targets: [target],
      records: [
        ...provenWrite(target),
        recoveryRecord(target.path, target.before.sha256),
      ],
      observations,
    });
    expect(plan.actions[0]).toMatchObject({
      action: 'already_restored',
      state: 'unchanged',
    });
  });

  it('treats a file changed after a restore as a conflict', async () => {
    const target = await seed(projectRoot, 'src/index.ts', 'before\n');
    await write(projectRoot, 'src/index.ts', 'edited after restore\n');
    const observations = await observeWriteTargets(projectRoot, [target]);
    const plan = planRecovery({
      runId: RUN_ID,
      targets: [target],
      records: [
        ...provenWrite(target),
        recoveryRecord(target.path, target.before.sha256),
      ],
      observations,
    });
    expect(plan.actions[0]).toMatchObject({ action: 'conflict' });
  });
});

describe('write surface stays closed', () => {
  /**
   * The four files that already wrote to disk before this ticket: window
   * bootstrap, the run host, the session state store and the settings store.
   * The probe fails if any other production file starts writing.
   */
  const allowlist = new Set<string>([
    'main/index.ts',
    'main/run-host.ts',
    'main/session-state-store.ts',
    'main/settings-store.ts',
  ]);

  async function listSourceFiles(root: string): Promise<string[]> {
    const entries = await readdir(root, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const path = join(root, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await listSourceFiles(path)));
      } else if (
        entry.isFile() &&
        (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))
      ) {
        files.push(path);
      }
    }
    return files;
  }

  it('keeps production write calls inside the reviewed files', async () => {
    const files = await listSourceFiles(sourceRoot);
    const writeCall = /\b(writeFile|appendFile|rm|unlink|rename|copyFile)\s*\(/;
    const offenders: string[] = [];
    for (const file of files) {
      const relativeFile = file
        .slice(sourceRoot.length + 1)
        .split(sep)
        .join('/');
      if (allowlist.has(relativeFile)) continue;
      if (relativeFile.startsWith('main/harness/write-permission/')) continue;
      const source = await readFile(file, 'utf-8');
      if (writeCall.test(source)) offenders.push(relativeFile);
    }
    expect(offenders).toEqual([]);
  });

  it('adds no IPC channel or capability that exposes write permission', async () => {
    const ipc = await readFile(
      join(sourceRoot, 'shared/contracts/run-ipc.ts'),
      'utf-8',
    );
    expect(ipc).not.toMatch(/write-permission|writePermission/i);
    const run = await readFile(
      join(sourceRoot, 'shared/contracts/pioneer-run.ts'),
      'utf-8',
    );
    expect(run).not.toMatch(/write-permission|writePermission/i);
  });
});

import { createHash } from 'node:crypto';
import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  WriteApprovalRejectionSchema,
  WriteApprovalSchema,
  WriteApprovalSummarySchema,
  WriteChangeJournalRecordSchema,
  WRITE_APPROVAL_LIMITS,
  type WriteApproval,
  type WriteApprovalRejection,
  type WriteFileIdentity,
  type WriteFileState,
  type WriteTarget,
} from '../../apps/desktop/src/shared/contracts/write-approval';
import {
  checkRetainedPostImages,
  evaluateWriteApproval,
  markApprovalApplied,
  planRecovery,
  rejectedOutcomes,
  revokeWriteApproval,
  summarizeWriteOutcomes,
  type WriteApprovalContext,
  type WriteApprovalDecision,
} from '../../apps/desktop/src/main/write-approval/decision';
import {
  observeWriteTarget,
  observeWriteTargets,
} from '../../apps/desktop/src/main/write-approval/observe-targets';

/**
 * Contract probes for the P4-D1 decision spec (#18). Every probe asserts an
 * observable decision or state, never a private call. Fixtures live in a
 * per-test temporary project; the repository fixtures are never touched and
 * no probe writes to an existing project.
 */

const AT = Date.parse('2026-10-27T12:00:00.000Z');

function rejectionOf(decision: WriteApprovalDecision): WriteApprovalRejection {
  if (decision.ok) throw new Error('expected the approval to be rejected');
  return decision.rejection;
}

function sha256Of(value: string): string {
  return createHash('sha256').update(Buffer.from(value, 'utf-8')).digest('hex');
}

function stateOf(value: string): WriteFileState {
  return {
    kind: 'file',
    bytes: Buffer.byteLength(value, 'utf-8'),
    sha256: sha256Of(value),
  };
}

function targetOf(path: string, before: string, after: string): WriteTarget {
  return {
    path,
    before: stateOf(before),
    after: stateOf(after),
    identity: null,
  };
}

function rawApproval(
  targets: WriteTarget[],
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    version: 1,
    approvalId: 'approval:one',
    operation: 'replace_file',
    sessionId: 'session:one',
    projectId: 'project:one',
    runId: 'run:one',
    revision: 3,
    createdAt: new Date(AT).toISOString(),
    expiresAt: new Date(AT + WRITE_APPROVAL_LIMITS.approvalMs).toISOString(),
    diffDigest: sha256Of('diff:one'),
    targets,
    webContentsId: 7,
    windowEpoch: 2,
    consumed: false,
    revoked: false,
    revocationReason: null,
    appliedAt: null,
    ...overrides,
  };
}

function approvalOf(
  targets: WriteTarget[],
  overrides: Partial<WriteApproval> = {},
): WriteApproval {
  return WriteApprovalSchema.parse(rawApproval(targets, overrides));
}

function contextOf(
  overrides: Partial<WriteApprovalContext> = {},
): WriteApprovalContext {
  return {
    now: AT + 1_000,
    confirmedDiffDigest: sha256Of('diff:one'),
    sessionId: 'session:one',
    projectId: 'project:one',
    runId: 'run:one',
    revision: 3,
    webContentsId: 7,
    windowEpoch: 2,
    ...overrides,
  };
}

let container: string;
let projectRoot: string;
let canSymlink = false;

beforeAll(async () => {
  const probe = await mkdtemp(join(tmpdir(), 'pioneer-write-probe-'));
  try {
    await writeFile(join(probe, 'file.txt'), 'probe');
    await symlink(join(probe, 'file.txt'), join(probe, 'link.txt'), 'file');
    canSymlink = true;
  } catch {
    canSymlink = false;
  } finally {
    await rm(probe, { recursive: true, force: true });
  }
});

beforeEach(async () => {
  container = await mkdtemp(join(tmpdir(), 'pioneer-write-approval-'));
  projectRoot = join(container, 'project');
  await mkdir(join(projectRoot, 'src'), { recursive: true });
  // CI temp roots may arrive via 8.3 short names; main's path policy requires
  // the canonical root, so normalize before observing anything.
  projectRoot = await realpath(projectRoot);
});

afterEach(async () => {
  await rm(container, { recursive: true, force: true });
});

async function seed(
  relativePath: string,
  content: string,
): Promise<WriteTarget> {
  await writeFile(join(projectRoot, relativePath), content);
  const identity = await identityFor(relativePath);
  return {
    ...targetOf(relativePath, content, `${content}\nchanged`),
    identity,
  };
}

async function identityFor(
  relativePath: string,
): Promise<WriteFileIdentity | null> {
  const stats = await lstat(join(projectRoot, relativePath));
  if (stats.ino === 0 || stats.birthtimeMs === 0) return null;
  return { fileId: String(stats.ino), birthtimeMs: stats.birthtimeMs };
}

describe('write approval contract', () => {
  it('parses a well-formed approval and its renderer summary', () => {
    const target = targetOf('src/index.ts', 'before', 'after');
    const approval = approvalOf([target]);
    const summary = WriteApprovalSummarySchema.parse({
      approvalId: approval.approvalId,
      operation: approval.operation,
      sessionId: approval.sessionId,
      projectId: approval.projectId,
      runId: approval.runId,
      revision: approval.revision,
      createdAt: approval.createdAt,
      expiresAt: approval.expiresAt,
      diffDigest: approval.diffDigest,
      targets: approval.targets,
    });
    expect(summary.targets).toEqual([target]);
    expect(JSON.stringify(summary)).not.toContain(projectRoot);
  });

  it('rejects unknown fields on the approval record', () => {
    const parsed = WriteApprovalSchema.safeParse({
      ...approvalOf([targetOf('src/index.ts', 'a', 'b')]),
      absolutePath: 'D:/project/src/index.ts',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a summary that carries window binding fields', () => {
    const approval = approvalOf([targetOf('src/index.ts', 'a', 'b')]);
    const parsed = WriteApprovalSummarySchema.safeParse({
      approvalId: approval.approvalId,
      operation: approval.operation,
      sessionId: approval.sessionId,
      projectId: approval.projectId,
      runId: approval.runId,
      revision: approval.revision,
      createdAt: approval.createdAt,
      expiresAt: approval.expiresAt,
      diffDigest: approval.diffDigest,
      targets: approval.targets,
      webContentsId: 7,
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects an operation outside the decision slice', () => {
    const parsed = WriteApprovalSchema.safeParse(
      rawApproval([targetOf('src/index.ts', 'a', 'b')], {
        operation: 'delete_file',
      }),
    );
    expect(parsed.success).toBe(false);
  });

  it.each([
    ['../secret.txt'],
    ['src/../../secret.txt'],
    ['/etc/passwd'],
    ['C:\\private\\secret.txt'],
    ['\\\\server\\share\\secret.txt'],
    ['src//index.ts'],
    ['src/'],
    ['src/index.ts.'],
    ['src/index.ts:stream'],
  ])('rejects an approval target path with unsafe syntax: %j', (path) => {
    const parsed = WriteApprovalSchema.safeParse({
      ...approvalOf([targetOf('src/index.ts', 'a', 'b')]),
      targets: [targetOf(path, 'a', 'b')],
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects duplicate approved targets', () => {
    const targets = [
      targetOf('src/index.ts', 'a', 'b'),
      targetOf('src/index.ts', 'a', 'b'),
    ];
    expect(WriteApprovalSchema.safeParse(rawApproval(targets)).success).toBe(
      false,
    );
  });

  it('rejects a target above the per-file byte budget', () => {
    const oversized: WriteTarget = {
      path: 'src/index.ts',
      before: {
        kind: 'file',
        bytes: WRITE_APPROVAL_LIMITS.targetBytes + 1,
        sha256: sha256Of('a'),
      },
      after: stateOf('b'),
      identity: null,
    };
    expect(
      WriteApprovalSchema.safeParse(rawApproval([oversized])).success,
    ).toBe(false);
  });

  it('rejects an approval set above the total byte budget', () => {
    const chunk = 'x'.repeat(1_048_576);
    const targets = Array.from({ length: 5 }, (_, index) =>
      targetOf(`src/file-${String(index)}.txt`, chunk, chunk),
    );
    expect(WriteApprovalSchema.safeParse(rawApproval(targets)).success).toBe(
      false,
    );
  });

  it('rejects an approval that does not expire after creation', () => {
    const parsed = WriteApprovalSchema.safeParse(
      rawApproval([targetOf('src/index.ts', 'a', 'b')], {
        expiresAt: new Date(AT).toISOString(),
      }),
    );
    expect(parsed.success).toBe(false);
  });

  it('rejects an approval that outlives the approval window', () => {
    const parsed = WriteApprovalSchema.safeParse(
      rawApproval([targetOf('src/index.ts', 'a', 'b')], {
        expiresAt: new Date(
          AT + WRITE_APPROVAL_LIMITS.approvalMs + 1,
        ).toISOString(),
      }),
    );
    expect(parsed.success).toBe(false);
  });

  it('rejects an inconsistent revocation record', () => {
    expect(
      WriteApprovalSchema.safeParse(
        rawApproval([targetOf('src/index.ts', 'a', 'b')], { revoked: true }),
      ).success,
    ).toBe(false);
    expect(
      WriteApprovalSchema.safeParse(
        rawApproval([targetOf('src/index.ts', 'a', 'b')], {
          revocationReason: 'user',
        }),
      ).success,
    ).toBe(false);
  });

  it('rejects an applied approval that is not consumed', () => {
    expect(
      WriteApprovalSchema.safeParse(
        rawApproval([targetOf('src/index.ts', 'a', 'b')], {
          appliedAt: new Date(AT).toISOString(),
        }),
      ).success,
    ).toBe(false);
  });

  it.each([['CON.txt'], ['src/aux.rs'], ['src/com1.ts'], ['src/lpt9.log']])(
    'rejects a reserved device name in an approved path: %s',
    (path) => {
      expect(
        WriteApprovalSchema.safeParse(rawApproval([targetOf(path, 'a', 'b')]))
          .success,
      ).toBe(false);
    },
  );

  it('rejects an approved path with too many components', () => {
    const deep = Array.from({ length: 33 }, (_, index) => `d${String(index)}`);
    expect(
      WriteApprovalSchema.safeParse(
        rawApproval([targetOf(deep.join('/'), 'a', 'b')]),
      ).success,
    ).toBe(false);
  });
});

describe('target observation', () => {
  it('reports an unchanged target with the observed bytes', async () => {
    const target = await seed('src/index.ts', 'export const value = 1;\n');
    const observation = await observeWriteTarget(projectRoot, target);
    expect(observation).toMatchObject({
      path: 'src/index.ts',
      state: 'unchanged',
      observed: stateOf('export const value = 1;\n'),
      identity: target.identity,
    });
  });

  it('reports a same-size content change as changed', async () => {
    const target = await seed('src/index.ts', 'aaaa');
    await writeFile(join(projectRoot, 'src/index.ts'), 'bbbb');
    const observation = await observeWriteTarget(projectRoot, target);
    expect(observation.state).toBe('changed');
    expect(observation.observed?.sha256).toBe(sha256Of('bbbb'));
  });

  it('reports growth and truncation as changed', async () => {
    const target = await seed('src/index.ts', 'content\n');
    await writeFile(join(projectRoot, 'src/index.ts'), 'content\nmore\n');
    expect((await observeWriteTarget(projectRoot, target)).state).toBe(
      'changed',
    );
    await writeFile(join(projectRoot, 'src/index.ts'), 'con');
    expect((await observeWriteTarget(projectRoot, target)).state).toBe(
      'changed',
    );
  });

  it('reports a file that changed during the read as unstable', async () => {
    const target = await seed('src/index.ts', 'content\n');
    const observation = await observeWriteTarget(projectRoot, target, {
      afterRead: async () => {
        await writeFile(join(projectRoot, 'src/index.ts'), 'content edited\n');
      },
    });
    expect(observation).toEqual({
      path: 'src/index.ts',
      state: 'unstable',
      observed: null,
      identity: null,
    });
  });

  it('reports a deleted and re-created file with identical bytes as replaced', async (context) => {
    const target = await seed('src/index.ts', 'content\n');
    await rm(join(projectRoot, 'src/index.ts'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    await writeFile(join(projectRoot, 'src/index.ts'), 'content\n');
    const recreated = await identityFor('src/index.ts');
    if (
      target.identity !== null &&
      recreated !== null &&
      target.identity.fileId === recreated.fileId &&
      target.identity.birthtimeMs === recreated.birthtimeMs
    ) {
      // The platform reused the same identity, so the recreation is
      // indistinguishable from the original file; nothing to assert here.
      context.skip();
      return;
    }
    expect((await observeWriteTarget(projectRoot, target)).state).toBe(
      'replaced',
    );
  });

  it('reports a missing target, including a moved-away one', async () => {
    const target = await seed('src/index.ts', 'content\n');
    await rename(
      join(projectRoot, 'src/index.ts'),
      join(projectRoot, 'src/moved.ts'),
    );
    expect(await observeWriteTarget(projectRoot, target)).toEqual({
      path: 'src/index.ts',
      state: 'missing',
      observed: null,
      identity: null,
    });
  });

  it('reports a directory at the approved path as not a regular file', async () => {
    const target = await seed('src/index.ts', 'content\n');
    await rm(join(projectRoot, 'src/index.ts'));
    await mkdir(join(projectRoot, 'src/index.ts'));
    expect((await observeWriteTarget(projectRoot, target)).state).toBe(
      'not_regular_file',
    );
  });

  it('reports a link at the approved path as link_not_allowed', async (context) => {
    if (!canSymlink) {
      context.skip();
      return;
    }
    const target = await seed('src/index.ts', 'content\n');
    await rename(
      join(projectRoot, 'src/index.ts'),
      join(projectRoot, 'src/real.ts'),
    );
    await symlink(
      join(projectRoot, 'src/real.ts'),
      join(projectRoot, 'src/index.ts'),
      'file',
    );
    expect((await observeWriteTarget(projectRoot, target)).state).toBe(
      'link_not_allowed',
    );
  });

  it('reports a hard-linked target as link_not_allowed', async () => {
    const target = await seed('src/index.ts', 'content\n');
    await link(
      join(projectRoot, 'src/index.ts'),
      join(projectRoot, 'src/alias.ts'),
    );
    expect((await observeWriteTarget(projectRoot, target)).state).toBe(
      'link_not_allowed',
    );
  });

  it('reports a re-created file with identical bytes as replaced', async () => {
    const target = await seed('src/index.ts', 'content\n');
    const replaced: WriteTarget = {
      ...target,
      identity: { fileId: 'another-file-id', birthtimeMs: 1 },
    };
    expect((await observeWriteTarget(projectRoot, replaced)).state).toBe(
      'replaced',
    );
  });

  it('compares only content when the approval recorded no identity', async () => {
    const target = await seed('src/index.ts', 'content\n');
    const withoutIdentity: WriteTarget = { ...target, identity: null };
    expect((await observeWriteTarget(projectRoot, withoutIdentity)).state).toBe(
      'unchanged',
    );
  });

  it('reports a sensitive target as unreadable', async () => {
    const target: WriteTarget = {
      path: '.env',
      before: stateOf('SECRET=1'),
      after: stateOf('SECRET=2'),
      identity: null,
    };
    await writeFile(join(projectRoot, '.env'), 'SECRET=1');
    expect((await observeWriteTarget(projectRoot, target)).state).toBe(
      'unreadable',
    );
  });

  it('reports a target above the read budget as too_large', async () => {
    const target = targetOf('src/large.bin', 'small', 'small');
    await writeFile(
      join(projectRoot, 'src/large.bin'),
      Buffer.alloc(WRITE_APPROVAL_LIMITS.targetBytes + 1, 0x61),
    );
    expect((await observeWriteTarget(projectRoot, target)).state).toBe(
      'too_large',
    );
  });

  it('observes every approved target in approval order', async () => {
    const first = await seed('src/a.ts', 'a\n');
    const second = await seed('src/b.ts', 'b\n');
    const observations = await observeWriteTargets(projectRoot, [
      first,
      second,
    ]);
    expect(observations.map((observation) => observation.path)).toEqual([
      'src/a.ts',
      'src/b.ts',
    ]);
    expect(observations.map((observation) => observation.state)).toEqual([
      'unchanged',
      'unchanged',
    ]);
  });
});

describe('write approval decision', () => {
  it('approves the whole set when every target is unchanged', async () => {
    const targets = [
      await seed('src/a.ts', 'a\n'),
      await seed('src/b.ts', 'b\n'),
    ];
    const approval = approvalOf(targets);
    const observations = await observeWriteTargets(projectRoot, targets);
    expect(evaluateWriteApproval(approval, contextOf(), observations)).toEqual({
      ok: true,
    });
  });

  it.each<[string, Partial<WriteApproval>, string]>([
    ['consumed', { consumed: true }, 'APPROVAL_CONSUMED'],
    [
      'revoked',
      { revoked: true, revocationReason: 'user' },
      'APPROVAL_REVOKED',
    ],
    [
      'expired',
      {
        createdAt: new Date(AT - 600_000).toISOString(),
        expiresAt: new Date(AT - 1_000).toISOString(),
      },
      'APPROVAL_EXPIRED',
    ],
  ])(
    'rejects a %s approval before writing anything',
    async (_label, overrides, code) => {
      const target = await seed('src/index.ts', 'content\n');
      const approval = approvalOf([target], overrides);
      const observations = await observeWriteTargets(projectRoot, [target]);
      const decision = evaluateWriteApproval(
        approval,
        contextOf(),
        observations,
      );
      const rejection = rejectionOf(decision);
      expect(WriteApprovalRejectionSchema.safeParse(rejection).success).toBe(
        true,
      );
      expect(rejection.error.code).toBe(code);
      expect(rejection.error.retryable).toBe(false);
      expect(rejection.error.targets).toEqual([]);
      expect(rejection.error.message.length).toBeGreaterThan(0);
    },
  );

  it.each<[string, Partial<WriteApprovalContext>]>([
    ['sessionId', { sessionId: 'session:other' }],
    ['projectId', { projectId: 'project:other' }],
    ['runId', { runId: 'run:other' }],
    ['revision', { revision: 4 }],
    ['webContentsId', { webContentsId: 8 }],
    ['windowEpoch', { windowEpoch: 3 }],
  ])('rejects an approval bound to another %s', async (_field, overrides) => {
    const target = await seed('src/index.ts', 'content\n');
    const approval = approvalOf([target]);
    const observations = await observeWriteTargets(projectRoot, [target]);
    const decision = evaluateWriteApproval(
      approval,
      contextOf(overrides),
      observations,
    );
    expect(rejectionOf(decision).error.code).toBe('APPROVAL_BINDING_MISMATCH');
  });

  it('rejects a confirmation that names a different Diff', async () => {
    const target = await seed('src/index.ts', 'content\n');
    const observations = await observeWriteTargets(projectRoot, [target]);
    const decision = evaluateWriteApproval(
      approvalOf([target]),
      contextOf({ confirmedDiffDigest: sha256Of('diff:other') }),
      observations,
    );
    expect(rejectionOf(decision).error.code).toBe('APPROVAL_DIGEST_MISMATCH');
  });

  it('does not leak the project root in a rejection message', async () => {
    const target = await seed('src/index.ts', 'content\n');
    await writeFile(join(projectRoot, 'src/index.ts'), 'edited\n');
    const observations = await observeWriteTargets(projectRoot, [target]);
    const rejection = rejectionOf(
      evaluateWriteApproval(approvalOf([target]), contextOf(), observations),
    );
    expect(rejection.error.message).not.toContain(projectRoot);
    expect(rejection.error.message).not.toContain(
      projectRoot.replaceAll('\\', '/'),
    );
  });

  it('rejects an approval whose retained content is missing', () => {
    const approval = approvalOf([targetOf('src/a.ts', 'a', 'a2')]);
    expect(rejectionOf(checkRetainedPostImages(approval, [])).error.code).toBe(
      'APPROVAL_REQUIRED',
    );
  });

  it('rejects retained content that does not match the reviewed bytes', () => {
    const approval = approvalOf([targetOf('src/a.ts', 'a', 'a2')]);
    const decision = checkRetainedPostImages(approval, [
      { path: 'src/a.ts', sha256: sha256Of('different') },
    ]);
    expect(rejectionOf(decision).error.code).toBe('APPROVAL_DIGEST_MISMATCH');
  });

  it('rejects retained content for an unapproved target', () => {
    const approval = approvalOf([targetOf('src/a.ts', 'a', 'a2')]);
    const decision = checkRetainedPostImages(approval, [
      { path: 'src/a.ts', sha256: approval.targets[0]?.after.sha256 ?? '' },
      { path: 'src/b.ts', sha256: sha256Of('b') },
    ]);
    expect(rejectionOf(decision).error.code).toBe('APPROVAL_TARGET_MISMATCH');
  });

  it('accepts retained content that matches every approved target', () => {
    const approval = approvalOf([targetOf('src/a.ts', 'a', 'a2')]);
    expect(
      checkRetainedPostImages(approval, [
        { path: 'src/a.ts', sha256: approval.targets[0]?.after.sha256 ?? '' },
      ]),
    ).toEqual({ ok: true });
  });

  it('rejects a revoked approval with the revocation reason recorded', async () => {
    const target = await seed('src/index.ts', 'content\n');
    const revoked = revokeWriteApproval(approvalOf([target]), 'window_closed');
    expect(revoked.revoked).toBe(true);
    expect(revoked.revocationReason).toBe('window_closed');
    const observations = await observeWriteTargets(projectRoot, [target]);
    expect(
      rejectionOf(evaluateWriteApproval(revoked, contextOf(), observations))
        .error.code,
    ).toBe('APPROVAL_REVOKED');
  });

  it('treats an applied approval as consumed', async () => {
    const target = await seed('src/index.ts', 'content\n');
    const applied = markApprovalApplied(
      approvalOf([target]),
      new Date(AT + 2_000).toISOString(),
    );
    expect(applied.consumed).toBe(true);
    expect(applied.appliedAt).toBe(new Date(AT + 2_000).toISOString());
    const observations = await observeWriteTargets(projectRoot, [target]);
    expect(
      rejectionOf(evaluateWriteApproval(applied, contextOf(), observations))
        .error.code,
    ).toBe('APPROVAL_CONSUMED');
  });

  it('rejects an observation set that does not match the approved targets', async () => {
    const first = await seed('src/a.ts', 'a\n');
    const second = await seed('src/b.ts', 'b\n');
    const observations = await observeWriteTargets(projectRoot, [second]);
    const decision = evaluateWriteApproval(
      approvalOf([first]),
      contextOf(),
      observations,
    );
    expect(rejectionOf(decision).error.code).toBe('APPROVAL_TARGET_MISMATCH');
  });

  it('rejects the whole approval when one target changed', async () => {
    const first = await seed('src/a.ts', 'a\n');
    const second = await seed('src/b.ts', 'b\n');
    await writeFile(join(projectRoot, 'src/b.ts'), 'b changed\n');
    const observations = await observeWriteTargets(projectRoot, [
      first,
      second,
    ]);
    const decision = evaluateWriteApproval(
      approvalOf([first, second]),
      contextOf(),
      observations,
    );
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.rejection.error.code).toBe('APPROVAL_STALE_TARGET');
    expect(decision.rejection.error.targets).toEqual([
      { path: 'src/b.ts', state: 'changed' },
    ]);
  });

  it('rejects the whole approval when a target was replaced', async () => {
    const target = await seed('src/a.ts', 'a\n');
    const replaced: WriteTarget = {
      ...target,
      identity: { fileId: 'another-file-id', birthtimeMs: 1 },
    };
    const observations = await observeWriteTargets(projectRoot, [replaced]);
    const decision = evaluateWriteApproval(
      approvalOf([replaced]),
      contextOf(),
      observations,
    );
    expect(rejectionOf(decision).error.targets).toEqual([
      { path: 'src/a.ts', state: 'replaced' },
    ]);
  });

  it('rejects the whole approval when one target disappeared', async () => {
    const first = await seed('src/a.ts', 'a\n');
    const second = await seed('src/b.ts', 'b\n');
    await rm(join(projectRoot, 'src/b.ts'));
    const observations = await observeWriteTargets(projectRoot, [
      first,
      second,
    ]);
    const decision = evaluateWriteApproval(
      approvalOf([first, second]),
      contextOf(),
      observations,
    );
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.rejection.error.targets).toEqual([
      { path: 'src/b.ts', state: 'missing' },
    ]);
  });

  it('accepts a touch that leaves the bytes identical', async () => {
    const target = await seed('src/index.ts', 'content\n');
    await utimes(
      join(projectRoot, 'src/index.ts'),
      new Date(AT + 30_000),
      new Date(AT + 30_000),
    );
    const observations = await observeWriteTargets(projectRoot, [target]);
    expect(
      evaluateWriteApproval(approvalOf([target]), contextOf(), observations),
    ).toEqual({ ok: true });
  });

  it('reports every target as rejected when the approval is rejected', () => {
    const targets = [
      targetOf('src/a.ts', 'a', 'a2'),
      targetOf('src/b.ts', 'b', 'b2'),
    ];
    const approval = approvalOf(targets);
    const outcomes = rejectedOutcomes(approval, {
      ok: false,
      error: {
        code: 'APPROVAL_STALE_TARGET',
        message: 'stale',
        retryable: false,
        targets: [{ path: 'src/b.ts', state: 'missing' }],
      },
    });
    expect(outcomes).toEqual([
      { path: 'src/a.ts', status: 'rejected', code: 'APPROVAL_STALE_TARGET' },
      { path: 'src/b.ts', status: 'rejected', code: 'APPROVAL_STALE_TARGET' },
    ]);
  });
});

describe('write outcomes', () => {
  const approval = approvalOf([
    targetOf('src/a.ts', 'a', 'a2'),
    targetOf('src/b.ts', 'b', 'b2'),
    targetOf('src/c.ts', 'c', 'c2'),
    targetOf('src/d.ts', 'd', 'd2'),
  ]);

  function record(
    kind: 'intent' | 'applied' | 'failed' | 'recovery',
    path: string,
    extra: Record<string, unknown> = {},
  ) {
    return WriteChangeJournalRecordSchema.parse({
      kind,
      approvalId: approval.approvalId,
      path,
      at: new Date(AT + 2_000).toISOString(),
      ...(kind === 'intent' ? { beforeSha256: sha256Of('before') } : {}),
      ...(kind === 'applied'
        ? {
            afterSha256: sha256Of('after'),
            observedSha256: sha256Of('after'),
            verification: 'verified',
          }
        : {}),
      ...(kind === 'failed' ? { code: 'WRITE_FAILED' } : {}),
      ...(kind === 'recovery'
        ? { action: 'restore', observedSha256: sha256Of('before') }
        : {}),
      ...extra,
    });
  }

  it('reports a target with no journal record as unchanged', () => {
    expect(summarizeWriteOutcomes(approval, [])).toEqual([
      { path: 'src/a.ts', status: 'unchanged', code: null },
      { path: 'src/b.ts', status: 'unchanged', code: null },
      { path: 'src/c.ts', status: 'unchanged', code: null },
      { path: 'src/d.ts', status: 'unchanged', code: null },
    ]);
  });

  it('reports verified, unverified, failed and mid-write targets separately', () => {
    const outcomes = summarizeWriteOutcomes(approval, [
      record('applied', 'src/a.ts'),
      record('applied', 'src/b.ts', { verification: 'unverified' }),
      record('intent', 'src/c.ts'),
      record('failed', 'src/d.ts', { code: 'CANCELLED' }),
    ]);
    expect(outcomes).toEqual([
      { path: 'src/a.ts', status: 'applied', code: null },
      {
        path: 'src/b.ts',
        status: 'verification_failed',
        code: 'VERIFY_FAILED',
      },
      { path: 'src/c.ts', status: 'unknown', code: 'UNKNOWN' },
      { path: 'src/d.ts', status: 'failed', code: 'CANCELLED' },
    ]);
  });

  it('uses the last journal record for a path', () => {
    const outcomes = summarizeWriteOutcomes(approval, [
      record('applied', 'src/a.ts'),
      record('failed', 'src/a.ts', { code: 'VERIFY_FAILED' }),
    ]);
    expect(outcomes[0]).toEqual({
      path: 'src/a.ts',
      status: 'failed',
      code: 'VERIFY_FAILED',
    });
  });

  it('reports a completed recovery as restored, not unchanged', () => {
    const outcomes = summarizeWriteOutcomes(approval, [
      record('applied', 'src/a.ts'),
      record('recovery', 'src/a.ts', {
        action: 'restore',
        observedSha256: sha256Of('before'),
      }),
    ]);
    expect(outcomes[0]).toEqual({
      path: 'src/a.ts',
      status: 'restored',
      code: null,
    });
  });

  it('reports a preserved recovery conflict as failed', () => {
    const outcomes = summarizeWriteOutcomes(approval, [
      record('applied', 'src/a.ts'),
      record('recovery', 'src/a.ts', {
        action: 'preserve',
        observedSha256: sha256Of('user edit'),
      }),
    ]);
    expect(outcomes[0]).toEqual({
      path: 'src/a.ts',
      status: 'failed',
      code: 'RECOVERY_CONFLICT',
    });
  });

  it('rejects a journal record that claims a recovery without an action', () => {
    const parsed = WriteChangeJournalRecordSchema.safeParse({
      kind: 'recovery',
      approvalId: approval.approvalId,
      path: 'src/a.ts',
      at: new Date(AT).toISOString(),
      observedSha256: null,
    });
    expect(parsed.success).toBe(false);
  });
});

describe('recovery planning', () => {
  function appliedRecord(approval: WriteApproval, path: string) {
    return WriteChangeJournalRecordSchema.parse({
      kind: 'applied',
      approvalId: approval.approvalId,
      path,
      afterSha256: sha256Of('after'),
      observedSha256: sha256Of('after'),
      verification: 'verified',
      at: new Date(AT + 2_000).toISOString(),
    });
  }

  it('restores only a file that still holds this run post-image', async () => {
    const target = await seed('src/index.ts', 'before\n');
    await writeFile(join(projectRoot, 'src/index.ts'), 'after\n');
    const actual: WriteTarget = {
      ...target,
      after: stateOf('after\n'),
    };
    const approval = approvalOf([actual]);
    const observations = await observeWriteTargets(projectRoot, [actual]);
    const plan = planRecovery({
      approval,
      records: [appliedRecord(approval, 'src/index.ts')],
      observations,
    });
    expect(plan.actions).toEqual([
      {
        path: 'src/index.ts',
        action: 'restore',
        state: 'changed',
        observed: stateOf('after\n'),
      },
    ]);
    expect(plan.conflicts).toEqual([]);
  });

  it('treats an already-restored file as a no-op', async () => {
    const target = await seed('src/index.ts', 'before\n');
    const approval = approvalOf([target]);
    const observations = await observeWriteTargets(projectRoot, [target]);
    const plan = planRecovery({
      approval,
      records: [appliedRecord(approval, 'src/index.ts')],
      observations,
    });
    expect(plan.actions[0]).toEqual({
      path: 'src/index.ts',
      action: 'already_restored',
      state: 'unchanged',
      observed: stateOf('before\n'),
    });
  });

  it('preserves a user edit instead of overwriting it', async () => {
    const target = await seed('src/index.ts', 'before\n');
    await writeFile(join(projectRoot, 'src/index.ts'), 'user edit\n');
    const actual: WriteTarget = { ...target, after: stateOf('after\n') };
    const approval = approvalOf([actual]);
    const observations = await observeWriteTargets(projectRoot, [actual]);
    const plan = planRecovery({
      approval,
      records: [appliedRecord(approval, 'src/index.ts')],
      observations,
    });
    expect(plan.conflicts).toEqual([
      {
        path: 'src/index.ts',
        action: 'conflict',
        state: 'changed',
        observed: stateOf('user edit\n'),
      },
    ]);
    expect(plan.actions[0]?.action).toBe('conflict');
  });

  it('preserves a deletion instead of recreating the file', async () => {
    const target = await seed('src/index.ts', 'before\n');
    await rm(join(projectRoot, 'src/index.ts'));
    const approval = approvalOf([target]);
    const observations = await observeWriteTargets(projectRoot, [target]);
    const plan = planRecovery({
      approval,
      records: [appliedRecord(approval, 'src/index.ts')],
      observations,
    });
    expect(plan.conflicts).toEqual([
      {
        path: 'src/index.ts',
        action: 'conflict',
        state: 'missing',
        observed: null,
      },
    ]);
  });

  it('keeps a path that changed type out of recovery', async () => {
    const target = await seed('src/index.ts', 'before\n');
    await rm(join(projectRoot, 'src/index.ts'));
    await mkdir(join(projectRoot, 'src/index.ts'));
    const approval = approvalOf([target]);
    const observations = await observeWriteTargets(projectRoot, [target]);
    const plan = planRecovery({
      approval,
      records: [appliedRecord(approval, 'src/index.ts')],
      observations,
    });
    expect(plan.conflicts[0]).toMatchObject({
      path: 'src/index.ts',
      action: 'conflict',
      state: 'not_regular_file',
    });
  });

  it('never touches an approved target this run did not apply', async () => {
    const first = await seed('src/a.ts', 'a\n');
    const second = await seed('src/b.ts', 'b\n');
    const approval = approvalOf([first, second]);
    const observations = await observeWriteTargets(projectRoot, [
      first,
      second,
    ]);
    const plan = planRecovery({
      approval,
      records: [appliedRecord(approval, 'src/a.ts')],
      observations,
    });
    expect(plan.actions.map((action) => action.path)).toEqual(['src/a.ts']);
    expect(plan.outOfScope).toEqual(['src/b.ts']);
  });

  it('treats a different file identity as a conflict even with matching bytes', async () => {
    const target = await seed('src/index.ts', 'before\n');
    const approval = approvalOf([{ ...target, after: stateOf('after\n') }]);
    const plan = planRecovery({
      approval,
      records: [appliedRecord(approval, 'src/index.ts')],
      observations: [
        {
          path: 'src/index.ts',
          state: 'changed',
          observed: stateOf('after\n'),
          identity: { fileId: 'another-file-id', birthtimeMs: 1 },
        },
      ],
    });
    expect(plan.actions[0]).toMatchObject({
      path: 'src/index.ts',
      action: 'conflict',
      state: 'changed',
    });
  });

  it('is idempotent across two recovery plans', async () => {
    const target = await seed('src/index.ts', 'before\n');
    await writeFile(join(projectRoot, 'src/index.ts'), 'after\n');
    const actual: WriteTarget = { ...target, after: stateOf('after\n') };
    const approval = approvalOf([actual]);
    const first = planRecovery({
      approval,
      records: [appliedRecord(approval, 'src/index.ts')],
      observations: await observeWriteTargets(projectRoot, [actual]),
    });
    expect(first.actions[0]?.action).toBe('restore');
    await writeFile(join(projectRoot, 'src/index.ts'), 'before\n');
    const second = planRecovery({
      approval,
      records: [appliedRecord(approval, 'src/index.ts')],
      observations: await observeWriteTargets(projectRoot, [actual]),
    });
    expect(second.actions[0]?.action).toBe('already_restored');
    expect(second.conflicts).toEqual([]);
  });
});

describe('write surface stays closed', () => {
  const writeCall =
    /\b(?:writeFile|appendFile|createWriteStream|copyFile|unlink|rmdir|rm|mkdir|rename|truncate|utimes|chmod|writeSync|appendFileSync)\s*\(|\.write(?:v)?\s*\(|open\s*\([^)]*['"](?:w|a|r\+|w\+|a\+)/;
  const allowlist = new Set([
    'main/index.ts',
    'main/run-host.ts',
    'main/settings-store.ts',
    'main/session-state-store.ts',
  ]);

  async function listSourceFiles(directory: string): Promise<string[]> {
    const entries = await readdir(directory, {
      recursive: true,
      withFileTypes: true,
    });
    return entries
      .filter(
        (entry) =>
          entry.isFile() &&
          (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')),
      )
      .map((entry) => join(entry.parentPath, entry.name));
  }

  it('keeps production write calls inside the existing reviewed files', async () => {
    const sourceRoot = join(process.cwd(), 'apps/desktop/src');
    const files = await listSourceFiles(sourceRoot);
    const offenders: string[] = [];
    for (const file of files) {
      const relativeFile = file
        .slice(sourceRoot.length + 1)
        .split(sep)
        .join('/');
      if (allowlist.has(relativeFile)) continue;
      const source = await readFile(file, 'utf-8');
      if (writeCall.test(source)) offenders.push(relativeFile);
    }
    expect(offenders).toEqual([]);
  });

  it('adds no IPC channel or capability that exposes write approval', async () => {
    const ipc = await readFile(
      join(process.cwd(), 'apps/desktop/src/shared/contracts/run-ipc.ts'),
      'utf-8',
    );
    expect(ipc).not.toMatch(/write|approval/i);
    const run = await readFile(
      join(process.cwd(), 'apps/desktop/src/shared/contracts/pioneer-run.ts'),
      'utf-8',
    );
    expect(run).not.toMatch(/capabilit/i);
  });
});

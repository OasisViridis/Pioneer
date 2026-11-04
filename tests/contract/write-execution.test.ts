import { createHash } from 'node:crypto';
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { WRITE_IPC_CHANNELS } from '../../apps/desktop/src/shared/contracts/ipc';
import {
  WRITE_EXECUTION_PREVIEW_MARKER,
  WriteExecutionRequestSchema,
  WriteExecutionResultSchema,
  WriteReviewPrepareSchema,
  type WriteExecutionRequest,
  type WriteReviewMode,
  type WriteReviewPrepare,
} from '../../apps/desktop/src/shared/contracts/write-execution';
import {
  WriteChangeJournalRecordSchema,
  type WriteChangeJournalRecord,
  type WriteTarget,
} from '../../apps/desktop/src/shared/contracts/write-permission';
import {
  registerWriteExecutionIpc,
  type IpcInvokeEventLike,
  type WriteExecutionIpcDependencies,
} from '../../apps/desktop/src/main/ipc';
import {
  WriteExecutionService,
  executeControlledWrite,
  prepareControlledReview,
  type WriteExecutionDependencies,
  type WriteExecutionExpectation,
  type WriteExecutionHooks,
} from '../../apps/desktop/src/main/write-execution';

/**
 * #19 contract probes. Every write happens inside a temporary copy of the
 * repository's library fixture; the committed fixture is never modified and is
 * re-hashed to prove it.
 */

const sourceRoot = fileURLToPath(new URL('../..', import.meta.url));
const fixtureAlpha = join(
  sourceRoot,
  'tests/fixtures/workspaces/library/alpha-app',
);
const SESSION_ID = 'session:write-execution';
const PROJECT_ID = 'project:alpha';
const RUN_ID = 'run:write-execution';
const REVISION = 3;
const EXPECTATION: WriteExecutionExpectation = {
  webContentsId: 42,
  windowEpoch: 7,
};
const FIXED_NOW = new Date('2026-11-03T12:00:00.000Z');
const EXPECTED_URL = 'http://localhost:3000/main_window';

const containers: string[] = [];

afterEach(async () => {
  for (const container of containers.splice(0)) {
    await rm(container, { recursive: true, force: true });
  }
});

async function makeProject(): Promise<string> {
  const container = await mkdtemp(join(tmpdir(), 'pioneer-write-execution-'));
  containers.push(container);
  const root = join(container, 'project');
  await cp(fixtureAlpha, root, { recursive: true });
  // Main's path policy compares canonical paths; CI's tmpdir can be a junction.
  return realpath(root);
}

function sha256Of(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function stateOf(text: string) {
  const bytes = Buffer.from(text, 'utf8');
  return {
    kind: 'file' as const,
    bytes: bytes.byteLength,
    sha256: sha256Of(bytes),
  };
}

/** The journal lives beside the temporary project, never inside it. */
function journalFor(root: string): string {
  return join(dirname(root), 'write-journal.jsonl');
}

function dependenciesFor(
  root: string,
  hooks?: WriteExecutionHooks,
  journalPath: string = journalFor(root),
): WriteExecutionDependencies {
  return {
    resolveProjectRoot: (projectId) =>
      Promise.resolve(projectId === PROJECT_ID ? root : null),
    journalPath,
    now: () => FIXED_NOW,
    ...(hooks === undefined ? {} : { hooks }),
  };
}

function serviceFor(
  root: string,
  hooks?: WriteExecutionHooks,
  journalPath?: string,
): WriteExecutionService {
  return new WriteExecutionService(dependenciesFor(root, hooks, journalPath));
}

async function preparedReview(
  service: WriteExecutionService,
  targetPath = 'README.md',
  mode: WriteReviewMode = 'workspace_write',
) {
  const reply = await service.prepare(
    {
      action: 'prepare',
      sessionId: SESSION_ID,
      projectId: PROJECT_ID,
      runId: RUN_ID,
      revision: REVISION,
      targetPath,
      mode,
    },
    EXPECTATION,
  );
  if (!reply.ok) throw new Error(`prepare refused: ${reply.code}`);
  return reply;
}

function prepareInput(
  targetPath = 'README.md',
  mode: WriteReviewMode = 'workspace_write',
): WriteReviewPrepare {
  return {
    action: 'prepare' as const,
    sessionId: SESSION_ID,
    projectId: PROJECT_ID,
    runId: RUN_ID,
    revision: REVISION,
    targetPath,
    mode,
  };
}

async function readJournal(path: string): Promise<WriteChangeJournalRecord[]> {
  const raw = await readFile(path, 'utf8');
  return raw
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => WriteChangeJournalRecordSchema.parse(JSON.parse(line)));
}

async function executeReview(
  service: WriteExecutionService,
  request: WriteExecutionRequest,
) {
  return service.execute(request, EXPECTATION);
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

function targetFor(path: string, before: string) {
  const after = `${before}${WRITE_EXECUTION_PREVIEW_MARKER}`;
  const target = {
    path,
    before: stateOf(before),
    identity: null,
    after: stateOf(after),
    content: after,
  } satisfies Omit<WriteTarget, 'identity'> & {
    identity: null;
    content: string;
  };
  return target;
}

describe('controlled write contract (#19)', () => {
  it('builds the review request in main and writes nothing before approval', async () => {
    const root = await makeProject();
    const readme = join(root, 'README.md');
    const original = await readFile(readme, 'utf8');
    const service = serviceFor(root);

    const review = await preparedReview(service);

    expect(review.beforePreview).toBe(original);
    // The completed run this review came from is carried into the request, so
    // the journal and the review name the same run instead of a session.
    expect(review.request.runId).toBe(RUN_ID);
    expect(review.request.revision).toBe(REVISION);
    expect(review.request.permission.mode).toBe('workspace_write');
    expect(review.request.permission.webContentsId).toBe(
      EXPECTATION.webContentsId,
    );
    expect(review.request.permission.windowEpoch).toBe(EXPECTATION.windowEpoch);
    const target = review.request.targets[0];
    expect(target?.path).toBe('README.md');
    expect(target?.content).toBe(
      `${original}${WRITE_EXECUTION_PREVIEW_MARKER}`,
    );
    expect(target?.after).toEqual(
      stateOf(`${original}${WRITE_EXECUTION_PREVIEW_MARKER}`),
    );
    // Preparing is read-only: the reviewed file has not moved.
    expect(await readFile(readme, 'utf8')).toBe(original);
    expect(await exists(journalFor(root))).toBe(false);
  });

  it('writes a non-README text file and leaves the rest of the project alone', async () => {
    const root = await makeProject();
    const nested = join(root, 'nested/not-a-project.txt');
    const readme = join(root, 'README.md');
    const nestedBefore = await readFile(nested, 'utf8');
    const readmeBefore = await readFile(readme, 'utf8');
    const service = serviceFor(root);

    const review = await preparedReview(service, 'nested/not-a-project.txt');
    expect(review.request.targets[0]?.path).toBe('nested/not-a-project.txt');
    const result = await executeReview(service, review.request);

    expect(result.ok).toBe(true);
    expect(result.targets[0]).toMatchObject({
      path: 'nested/not-a-project.txt',
      status: 'applied',
      verification: 'verified_after',
    });
    expect(await readFile(nested, 'utf8')).toBe(
      `${nestedBefore}${WRITE_EXECUTION_PREVIEW_MARKER}`,
    );
    expect(await readFile(readme, 'utf8')).toBe(readmeBefore);
  });

  it('refuses a request whose run identity was swapped after prepare', async () => {
    const root = await makeProject();
    const readme = join(root, 'README.md');
    const original = await readFile(readme, 'utf8');
    const service = serviceFor(root);
    const review = await preparedReview(service);
    const swappedRun = WriteExecutionRequestSchema.parse({
      ...review.request,
      runId: 'run:other',
    });

    const runResult = await executeReview(service, swappedRun);
    expect(runResult.ok).toBe(false);
    expect(runResult.code).toBe('BINDING_MISMATCH');
    expect(await readFile(readme, 'utf8')).toBe(original);

    // The first refusal consumed the pending review; prepare again to test the
    // revision half of the binding.
    const retried = await preparedReview(service);
    const revisionResult = await executeReview(service, {
      ...retried.request,
      revision: retried.request.revision + 1,
    });
    expect(revisionResult.ok).toBe(false);
    expect(revisionResult.code).toBe('BINDING_MISMATCH');
    expect(await readFile(readme, 'utf8')).toBe(original);
  });

  it('cancelling a prepared review leaves bytes, hash and journal untouched', async () => {
    const root = await makeProject();
    const readme = join(root, 'README.md');
    const before = await readFile(readme);
    const service = serviceFor(root);
    await preparedReview(service);
    // No execute: the user cancelled the review at the preview stage.
    const after = await readFile(readme);
    expect(after.equals(before)).toBe(true);
    expect(sha256Of(after)).toBe(sha256Of(before));
    expect(await exists(journalFor(root))).toBe(false);
  });

  it('invalidates a prepared review so a later execute cannot write', async () => {
    const root = await makeProject();
    const readme = join(root, 'README.md');
    const original = await readFile(readme, 'utf8');
    const service = serviceFor(root);
    const review = await preparedReview(service);

    service.invalidate();
    const result = await executeReview(service, review.request);

    expect(result.ok).toBe(false);
    expect(result.code).toBe('BINDING_MISMATCH');
    expect(result.runId).toBe(RUN_ID);
    expect(result.revision).toBe(REVISION);
    expect(await readFile(readme, 'utf8')).toBe(original);
    expect(await exists(journalFor(root))).toBe(false);
  });

  it('refuses read_only permissions without touching the file', async () => {
    const root = await makeProject();
    const readme = join(root, 'README.md');
    const original = await readFile(readme, 'utf8');
    const service = serviceFor(root);
    const review = await preparedReview(service);
    const readOnly = WriteExecutionRequestSchema.parse({
      ...review.request,
      permission: { ...review.request.permission, mode: 'read_only' },
    });

    const result = await executeControlledWrite(
      dependenciesFor(root),
      readOnly,
      EXPECTATION,
    );

    expect(result.ok).toBe(false);
    expect(result.status).toBe('rejected');
    expect(result.code).toBe('PERMISSION_DENIED');
    expect(result.permissionCode).toBe('PERMISSION_READ_ONLY');
    expect(result.targets[0]).toMatchObject({
      status: 'rejected',
      code: 'PERMISSION_DENIED',
      verification: 'not_attempted',
    });
    expect(await readFile(readme, 'utf8')).toBe(original);
  });

  it('refuses a declared after hash that its content does not produce', async () => {
    const root = await makeProject();
    const readme = join(root, 'README.md');
    const original = await readFile(readme, 'utf8');
    const service = serviceFor(root);
    const review = await preparedReview(service);
    const target = review.request.targets[0];
    if (target === undefined) throw new Error('missing prepared target');
    const tampered = WriteExecutionRequestSchema.parse({
      ...review.request,
      targets: [
        { ...target, after: { ...target.after, sha256: 'f'.repeat(64) } },
      ],
    });

    const result = await executeControlledWrite(
      dependenciesFor(root),
      tampered,
      EXPECTATION,
    );

    expect(result.ok).toBe(false);
    expect(result.status).toBe('rejected');
    expect(result.code).toBe('CONTENT_MISMATCH');
    expect(result.targets[0]).toMatchObject({
      status: 'rejected',
      code: 'CONTENT_MISMATCH',
    });
    expect(await readFile(readme, 'utf8')).toBe(original);
  });

  it('refuses a traversal path before any filesystem access', async () => {
    const root = await makeProject();
    const service = serviceFor(root);
    const review = await preparedReview(service);
    const target = review.request.targets[0];
    if (target === undefined) throw new Error('missing prepared target');
    const escaping: WriteExecutionRequest = {
      ...review.request,
      targets: [{ ...target, path: '../escape.txt' }],
    };

    const result = await executeControlledWrite(
      dependenciesFor(root),
      escaping,
      EXPECTATION,
    );

    expect(result.ok).toBe(false);
    expect(result.code).toBe('INVALID_REQUEST');
    expect(result.targets).toEqual([]);
    expect(await exists(join(dirname(root), 'escape.txt'))).toBe(false);
  });

  it('refuses a protected .git target under workspace_write', async () => {
    const root = await makeProject();
    const config = join(root, '.git', 'config');
    await mkdir(join(root, '.git'), { recursive: true });
    await writeFile(config, '[core]\n', 'utf8');
    const service = serviceFor(root);
    const review = await preparedReview(service);
    const target = review.request.targets[0];
    if (target === undefined) throw new Error('missing prepared target');
    const protectedRequest = WriteExecutionRequestSchema.parse({
      ...review.request,
      targets: [
        {
          ...target,
          path: '.git/config',
          before: stateOf('[core]\n'),
          after: stateOf(`[core]\n${WRITE_EXECUTION_PREVIEW_MARKER}`),
          content: `[core]\n${WRITE_EXECUTION_PREVIEW_MARKER}`,
        },
      ],
    });

    const result = await executeControlledWrite(
      dependenciesFor(root),
      protectedRequest,
      EXPECTATION,
    );

    expect(result.ok).toBe(false);
    expect(result.status).toBe('rejected');
    expect(result.code).toBe('PERMISSION_DENIED');
    expect(result.permissionCode).toBe('PERMISSION_PROTECTED_PATH');
    expect(await readFile(config, 'utf8')).toBe('[core]\n');
  });

  it('refuses a target outside the explicit scope', async () => {
    const root = await makeProject();
    const readme = join(root, 'README.md');
    const original = await readFile(readme, 'utf8');
    const service = serviceFor(root);
    const review = await preparedReview(service);
    const scoped = WriteExecutionRequestSchema.parse({
      ...review.request,
      permission: { ...review.request.permission, scope: ['NOTES.md'] },
    });

    const result = await executeControlledWrite(
      dependenciesFor(root),
      scoped,
      EXPECTATION,
    );

    expect(result.ok).toBe(false);
    expect(result.status).toBe('rejected');
    expect(result.permissionCode).toBe('PERMISSION_OUT_OF_SCOPE');
    expect(await readFile(readme, 'utf8')).toBe(original);
  });

  it('refuses a stale pre-image and preserves the user edit', async () => {
    const root = await makeProject();
    const readme = join(root, 'README.md');
    const service = serviceFor(root);
    const review = await preparedReview(service);
    await writeFile(readme, '# edited after review\n', 'utf8');

    const result = await executeReview(service, review.request);

    expect(result.ok).toBe(false);
    expect(result.status).toBe('rejected');
    expect(result.code).toBe('TARGET_CHANGED');
    expect(result.targets[0]).toMatchObject({
      status: 'rejected',
      code: 'TARGET_CHANGED',
      verification: 'not_attempted',
    });
    expect(await readFile(readme, 'utf8')).toBe('# edited after review\n');
  });

  it('writes atomically, verifies the after hash and reports applied', async () => {
    const root = await makeProject();
    const readme = join(root, 'README.md');
    const original = await readFile(readme, 'utf8');
    const fixtureReadme = join(fixtureAlpha, 'README.md');
    const fixtureHashBefore = sha256Of(await readFile(fixtureReadme));
    const service = serviceFor(root);
    const review = await preparedReview(service);
    const target = review.request.targets[0];
    if (target === undefined) throw new Error('missing prepared target');

    const result = await executeReview(service, review.request);

    expect(result.ok).toBe(true);
    expect(result.status).toBe('applied');
    expect(result.verification).toBe('verified');
    expect(result.restore).toBe('not_needed');
    expect(result.runId).toBe(RUN_ID);
    expect(result.revision).toBe(REVISION);
    expect(result.permissionCode).toBeNull();
    expect(result.targets).toHaveLength(1);
    expect(result.targets[0]).toMatchObject({
      path: 'README.md',
      status: 'applied',
      verification: 'verified_after',
      observedSha256: target.after.sha256,
    });
    const afterBytes = await readFile(readme);
    expect(afterBytes.byteLength).toBe(target.after.bytes);
    expect(sha256Of(afterBytes)).toBe(target.after.sha256);
    expect(afterBytes.toString('utf8')).toBe(
      `${original}${WRITE_EXECUTION_PREVIEW_MARKER}`,
    );
    // The shared repository fixture is not the write target.
    expect(sha256Of(await readFile(fixtureReadme))).toBe(fixtureHashBefore);
  });

  it('refuses a target edited in place after admission and preserves the edit', async () => {
    const root = await makeProject();
    const readme = join(root, 'README.md');
    const service = serviceFor(root, {
      beforeWrite: async () => {
        await writeFile(readme, 'user edit before write\n', 'utf8');
      },
    });
    const review = await preparedReview(service);

    const result = await executeReview(service, review.request);

    expect(result.ok).toBe(false);
    expect(result.status).toBe('failed');
    expect(result.targets[0]).toMatchObject({
      path: 'README.md',
      status: 'failed',
      code: 'TARGET_CHANGED',
      verification: 'not_attempted',
    });
    expect(await readFile(readme, 'utf8')).toBe('user edit before write\n');
    const records = await readJournal(journalFor(root));
    expect(records.map((record) => record.kind)).toEqual(['intent', 'failed']);
    expect(records[1]).toMatchObject({
      kind: 'failed',
      path: 'README.md',
      code: 'WRITE_FAILED',
    });
  });

  it('refuses a parent directory swapped for a junction before the write', async () => {
    const root = await makeProject();
    const moved = `${root}-moved`;
    const state = { swapped: false };
    const service = serviceFor(root, {
      beforeWrite: async () => {
        await rename(root, moved);
        try {
          await symlink(moved, root, 'junction');
          state.swapped = true;
        } catch (error) {
          await rename(moved, root);
          throw error;
        }
      },
    });
    try {
      const review = await preparedReview(service);
      const result = await executeReview(service, review.request);
      if (!state.swapped) return;
      expect(result.ok).toBe(false);
      expect(result.targets[0]).toMatchObject({
        path: 'README.md',
        status: 'failed',
        code: 'TARGET_UNREADABLE',
        verification: 'not_attempted',
      });
      expect(await readFile(join(moved, 'README.md'), 'utf8')).toBe(
        await readFile(join(fixtureAlpha, 'README.md'), 'utf8'),
      );
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => undefined);
      await rm(moved, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  it('preserves the post-image and reports verification_failed on a bad read-back', async () => {
    const root = await makeProject();
    const readme = join(root, 'README.md');
    let corrupted = false;
    const service = serviceFor(root, {
      afterWrite: async () => {
        if (corrupted) return;
        corrupted = true;
        await writeFile(readme, 'external bytes after write\n', 'utf8');
      },
    });
    const review = await preparedReview(service);

    const result = await executeReview(service, review.request);

    expect(corrupted).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.status).toBe('verification_failed');
    expect(result.code).toBe('VERIFY_FAILED');
    expect(result.verification).toBe('failed');
    expect(result.restore).toBe('not_needed');
    expect(result.runId).toBe(RUN_ID);
    expect(result.revision).toBe(REVISION);
    expect(result.targets[0]).toMatchObject({
      path: 'README.md',
      status: 'verification_failed',
      code: 'VERIFY_FAILED',
      verification: 'failed',
    });
    // §2.5/§4.4: keep the scene and leave recovery to #20; do not overwrite.
    expect(await readFile(readme, 'utf8')).toBe('external bytes after write\n');
  });

  it('preserves the scene when the target becomes a directory after the write', async () => {
    const root = await makeProject();
    const readme = join(root, 'README.md');
    const service = serviceFor(root, {
      afterWrite: async () => {
        await rm(readme);
        await mkdir(readme);
      },
    });
    const review = await preparedReview(service);

    const result = await executeReview(service, review.request);

    expect(result.ok).toBe(false);
    expect(result.status).toBe('verification_failed');
    expect(result.code).toBe('VERIFY_FAILED');
    expect(result.restore).toBe('not_needed');
    expect(result.targets[0]).toMatchObject({
      path: 'README.md',
      status: 'verification_failed',
      code: 'VERIFY_FAILED',
      verification: 'failed',
    });
    expect((await lstat(readme)).isDirectory()).toBe(true);
  });

  it('refuses the whole batch when one target is stale', async () => {
    const root = await makeProject();
    const readme = join(root, 'README.md');
    const second = join(root, 'SECOND.md');
    const readmeBefore = await readFile(readme, 'utf8');
    await writeFile(second, '# second target\n', 'utf8');
    const service = serviceFor(root);
    const review = await preparedReview(service);
    const first = review.request.targets[0];
    if (first === undefined) throw new Error('missing prepared target');
    const batch = WriteExecutionRequestSchema.parse({
      ...review.request,
      targets: [first, targetFor('SECOND.md', '# second target\n')],
    });
    await writeFile(second, '# edited second target\n', 'utf8');

    const result = await executeControlledWrite(
      dependenciesFor(root),
      batch,
      EXPECTATION,
    );

    expect(result.ok).toBe(false);
    expect(result.status).toBe('rejected');
    expect(result.targets).toHaveLength(2);
    expect(result.targets[1]).toMatchObject({
      path: 'SECOND.md',
      status: 'rejected',
      code: 'TARGET_CHANGED',
    });
    expect(result.targets[0]).toMatchObject({
      path: 'README.md',
      status: 'unchanged',
      code: null,
    });
    expect(await readFile(readme, 'utf8')).toBe(readmeBefore);
    expect(await readFile(second, 'utf8')).toBe('# edited second target\n');
  });

  it('refuses binding, replay and a tampered request through the service', async () => {
    const root = await makeProject();
    const readme = join(root, 'README.md');
    const original = await readFile(readme, 'utf8');
    const service = serviceFor(root);
    const review = await preparedReview(service);
    const target = review.request.targets[0];
    if (target === undefined) throw new Error('missing prepared target');

    const wrongWindow = await service.execute(review.request, {
      ...EXPECTATION,
      webContentsId: 99,
    });
    expect(wrongWindow.code).toBe('BINDING_MISMATCH');
    expect(await readFile(readme, 'utf8')).toBe(original);

    // The refused attempt consumed the pending review; a fresh one is needed.
    const retried = await preparedReview(service);
    const tamperedContent = `${retried.request.targets[0]?.content ?? ''}x`;
    const tampered = WriteExecutionRequestSchema.parse({
      ...retried.request,
      targets: [
        {
          ...retried.request.targets[0],
          content: tamperedContent,
          after: stateOf(tamperedContent),
        },
      ],
    });
    const tamperResult = await executeReview(service, tampered);
    expect(tamperResult.code).toBe('BINDING_MISMATCH');
    expect(await readFile(readme, 'utf8')).toBe(original);

    const accepted = await preparedReview(service);
    const applied = await executeReview(service, accepted.request);
    expect(applied.ok).toBe(true);
    const replay = await executeReview(service, accepted.request);
    expect(replay.ok).toBe(false);
    expect(replay.code).toBe('BINDING_MISMATCH');
  });

  it('reports a missing or linked target without creating or following it', async (context) => {
    const root = await makeProject();
    const service = serviceFor(root);
    const missing = await service.prepare(
      prepareInput('MISSING.md'),
      EXPECTATION,
    );
    expect(missing).toEqual({ ok: false, code: 'TARGET_MISSING' });
    expect(await exists(join(root, 'MISSING.md'))).toBe(false);

    const outside = join(dirname(root), 'outside.txt');
    await writeFile(outside, 'outside\n', 'utf8');
    try {
      await symlink(outside, join(root, 'LINK.md'), 'file');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (
        code === 'EPERM' ||
        code === 'EACCES' ||
        code === 'ENOTSUP' ||
        code === 'UNKNOWN'
      ) {
        context.skip();
        return;
      }
      throw error;
    }
    const linked = await service.prepare(prepareInput('LINK.md'), EXPECTATION);
    expect(linked).toEqual({ ok: false, code: 'TARGET_LINK_NOT_ALLOWED' });
    expect(await readFile(outside, 'utf8')).toBe('outside\n');
  });

  it('reuses the shared result contract for refusals and verified writes', async () => {
    const root = await makeProject();
    const service = serviceFor(root);
    const review = await preparedReview(service);
    const result = await executeReview(service, review.request);
    expect(() => WriteExecutionResultSchema.parse(result)).not.toThrow();
    expect(WriteExecutionResultSchema.parse(result)).toEqual(result);
  });

  it('keeps the prepared request schema strict about binding fields', () => {
    const valid = {
      version: 1,
      sessionId: SESSION_ID,
      projectId: PROJECT_ID,
      runId: RUN_ID,
      revision: REVISION,
      windowEpoch: EXPECTATION.windowEpoch,
      permission: {
        version: 1,
        sessionId: SESSION_ID,
        projectId: PROJECT_ID,
        mode: 'workspace_write',
        scope: 'all_targets',
        protectedPaths: ['.git'],
        webContentsId: EXPECTATION.webContentsId,
        windowEpoch: EXPECTATION.windowEpoch,
        grantedAt: FIXED_NOW.toISOString(),
        riskAcknowledged: false,
      },
      targets: [
        {
          path: 'README.md',
          before: stateOf('a'),
          identity: null,
          after: stateOf('b'),
          content: 'b',
        },
      ],
    };
    expect(WriteExecutionRequestSchema.safeParse(valid).success).toBe(true);
    expect(
      WriteExecutionRequestSchema.safeParse({
        ...valid,
        permission: { ...valid.permission, windowEpoch: 8 },
      }).success,
    ).toBe(false);
    expect(
      WriteExecutionRequestSchema.safeParse({
        ...valid,
        permission: { ...valid.permission, sessionId: 'session:other' },
      }).success,
    ).toBe(false);
    expect(
      WriteExecutionRequestSchema.safeParse({
        ...valid,
        targets: [{ ...valid.targets[0], content: 'longer content' }],
      }).success,
    ).toBe(false);
    expect(
      WriteExecutionRequestSchema.safeParse({
        ...valid,
        targets: [{ ...valid.targets[0], unknown: true }],
      }).success,
    ).toBe(false);
    // Run identity is required, not optional provenance.
    expect(
      WriteExecutionRequestSchema.safeParse({ ...valid, runId: undefined })
        .success,
    ).toBe(false);
    expect(
      WriteExecutionRequestSchema.safeParse({ ...valid, revision: 0 }).success,
    ).toBe(false);
    expect(
      WriteExecutionRequestSchema.safeParse({ ...valid, revision: undefined })
        .success,
    ).toBe(false);
  });
});

describe('durable change journal (#19)', () => {
  it('appends intent then applied as one JSONL line each', async () => {
    const root = await makeProject();
    const service = serviceFor(root);
    const review = await preparedReview(service);
    const before = review.request.targets[0];
    if (before === undefined) throw new Error('missing prepared target');

    const result = await executeReview(service, review.request);

    expect(result.ok).toBe(true);
    const journalPath = journalFor(root);
    const raw = await readFile(journalPath, 'utf8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(raw.split('\n').filter((line) => line !== '')).toHaveLength(2);
    const records = await readJournal(journalPath);
    expect(records.map((record) => record.kind)).toEqual(['intent', 'applied']);
    expect(records[0]).toEqual({
      kind: 'intent',
      runId: RUN_ID,
      revision: REVISION,
      path: 'README.md',
      beforeSha256: before.before.sha256,
      at: FIXED_NOW.toISOString(),
    });
    const applied = records[1];
    if (applied?.kind !== 'applied') throw new Error('missing applied record');
    expect(applied).toMatchObject({
      runId: RUN_ID,
      revision: REVISION,
      path: 'README.md',
      afterSha256: before.after.sha256,
      observedSha256: before.after.sha256,
      verification: 'verified',
      at: FIXED_NOW.toISOString(),
    });
    const identity = applied.observedIdentity;
    expect(identity).not.toBeNull();
    expect(typeof identity?.fileId).toBe('string');
    expect(typeof identity?.birthtimeMs).toBe('number');
    // The journal never lands inside the project it describes.
    expect(await exists(join(root, 'write-journal.jsonl'))).toBe(false);
  });

  it('records an unverified applied entry when the read-back disagrees', async () => {
    const root = await makeProject();
    const readme = join(root, 'README.md');
    const service = serviceFor(root, {
      afterWrite: async () => {
        await writeFile(readme, 'external bytes after write\n', 'utf8');
      },
    });
    const review = await preparedReview(service);

    const result = await executeReview(service, review.request);

    expect(result.status).toBe('verification_failed');
    const records = await readJournal(journalFor(root));
    expect(records.map((record) => record.kind)).toEqual(['intent', 'applied']);
    const applied = records[1];
    if (applied?.kind !== 'applied') throw new Error('missing applied record');
    expect(applied.verification).toBe('unverified');
    expect(applied.observedSha256).toBe(
      sha256Of(Buffer.from('external bytes after write\n', 'utf8')),
    );
    expect(await readFile(readme, 'utf8')).toBe('external bytes after write\n');
  });

  it('records an unverified applied entry when the post-write read-back observes nothing', async () => {
    const root = await makeProject();
    const readme = join(root, 'README.md');
    const service = serviceFor(root, {
      afterWrite: async () => {
        await rm(readme);
        await mkdir(readme);
      },
    });
    const review = await preparedReview(service);

    const result = await executeReview(service, review.request);

    expect(result.status).toBe('verification_failed');
    expect(result.restore).toBe('not_needed');
    const records = await readJournal(journalFor(root));
    expect(records.map((record) => record.kind)).toEqual(['intent', 'applied']);
    expect(records[1]).toMatchObject({
      kind: 'applied',
      runId: RUN_ID,
      revision: REVISION,
      path: 'README.md',
      afterSha256: review.request.targets[0]?.after.sha256,
      observedSha256: null,
      observedIdentity: null,
      verification: 'unverified',
      at: FIXED_NOW.toISOString(),
    });
  });

  it('refuses to touch the file when the intent cannot be journaled', async () => {
    const root = await makeProject();
    const readme = join(root, 'README.md');
    const original = await readFile(readme, 'utf8');
    const journalDir = join(dirname(root), 'journal-dir');
    await mkdir(journalDir, { recursive: true });
    const service = serviceFor(root, undefined, journalDir);
    const review = await preparedReview(service);

    const result = await executeReview(service, review.request);

    expect(result.ok).toBe(false);
    expect(result.status).toBe('failed');
    expect(result.code).toBe('WRITE_FAILED');
    expect(result.restore).toBe('not_needed');
    expect(result.targets[0]).toMatchObject({
      path: 'README.md',
      status: 'failed',
      code: 'WRITE_FAILED',
      observedSha256: null,
      verification: 'not_attempted',
    });
    expect(await readFile(readme, 'utf8')).toBe(original);
    expect(await readdir(journalDir)).toEqual([]);
  });

  it('refuses a journal path inside the project and touches nothing', async () => {
    const root = await makeProject();
    const readme = join(root, 'README.md');
    const original = await readFile(readme, 'utf8');
    const journalInside = join(root, 'write-journal.jsonl');
    const service = serviceFor(root, undefined, journalInside);
    const review = await preparedReview(service);

    const result = await executeReview(service, review.request);

    expect(result.ok).toBe(false);
    expect(result.code).toBe('WRITE_FAILED');
    expect(result.targets[0]).toMatchObject({
      status: 'failed',
      code: 'WRITE_FAILED',
      verification: 'not_attempted',
    });
    expect(await readFile(readme, 'utf8')).toBe(original);
    expect(await exists(journalInside)).toBe(false);
  });
});

function createWriteIpcHarness(service: WriteExecutionService) {
  const handlers = new Map<
    string,
    (event: IpcInvokeEventLike, ...args: unknown[]) => Promise<unknown>
  >();
  const mainFrame = { url: EXPECTED_URL };
  const webContents = { id: 42, getURL: () => EXPECTED_URL, mainFrame };
  const dependencies: WriteExecutionIpcDependencies = {
    expectedRendererUrl: EXPECTED_URL,
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    mainWindow: { webContents },
    windowEpoch: () => EXPECTATION.windowEpoch,
    prepare: (input, binding) => service.prepare(input, binding),
    execute: (request, binding) => service.execute(request, binding),
  };
  registerWriteExecutionIpc(dependencies);
  const legitimateEvent = (): IpcInvokeEventLike => ({
    sender: webContents,
    senderFrame: mainFrame,
  });
  return { handlers, legitimateEvent, mainFrame, webContents };
}

describe('controlled write IPC (#19)', () => {
  it('registers one channel and refuses untrusted or malformed callers', async () => {
    const root = await makeProject();
    const service = serviceFor(root);
    const harness = createWriteIpcHarness(service);
    expect([...harness.handlers.keys()]).toEqual([
      WRITE_IPC_CHANNELS.execution,
    ]);
    const handler = harness.handlers.get(WRITE_IPC_CHANNELS.execution);
    if (handler === undefined) throw new Error('write channel not registered');
    const prepareArgs = {
      action: 'prepare',
      sessionId: SESSION_ID,
      projectId: PROJECT_ID,
      runId: RUN_ID,
      revision: REVISION,
      targetPath: 'README.md',
      mode: 'workspace_write',
    };

    await expect(
      handler(
        {
          sender: { ...harness.webContents, id: 99 },
          senderFrame: harness.mainFrame,
        },
        prepareArgs,
      ),
    ).resolves.toEqual({ ok: false, code: 'UNTRUSTED_SENDER' });
    await expect(
      handler(harness.legitimateEvent(), 'not-a-request'),
    ).resolves.toMatchObject({ ok: false, code: 'INVALID_REQUEST' });

    const reply = await handler(harness.legitimateEvent(), prepareArgs);
    expect(reply).toMatchObject({ ok: true });
    if (
      typeof reply !== 'object' ||
      reply === null ||
      !('request' in reply) ||
      !('ok' in reply) ||
      reply.ok !== true
    ) {
      throw new Error('trusted prepare did not return a request');
    }
    const executed = await handler(harness.legitimateEvent(), {
      action: 'execute',
      request: reply.request,
    });
    expect(executed).toMatchObject({
      ok: true,
      status: 'applied',
      verification: 'verified',
    });
    const readme = await readFile(join(root, 'README.md'), 'utf8');
    expect(readme.endsWith(WRITE_EXECUTION_PREVIEW_MARKER)).toBe(true);
  });

  it('keeps prepare and execute on the same channel and rejects a second execute', async () => {
    const root = await makeProject();
    const service = serviceFor(root);
    const harness = createWriteIpcHarness(service);
    const handler = harness.handlers.get(WRITE_IPC_CHANNELS.execution);
    if (handler === undefined) throw new Error('write channel not registered');
    const reply = await handler(harness.legitimateEvent(), {
      action: 'prepare',
      sessionId: SESSION_ID,
      projectId: PROJECT_ID,
      runId: RUN_ID,
      revision: REVISION,
      targetPath: 'README.md',
      mode: 'workspace_write',
    });
    if (
      typeof reply !== 'object' ||
      reply === null ||
      !('ok' in reply) ||
      reply.ok !== true ||
      !('request' in reply)
    ) {
      throw new Error('trusted prepare did not return a request');
    }
    const execute = (): Promise<unknown> =>
      handler(harness.legitimateEvent(), {
        action: 'execute',
        request: reply.request,
      });
    expect(await execute()).toMatchObject({ ok: true });
    expect(await execute()).toMatchObject({
      ok: false,
      code: 'BINDING_MISMATCH',
    });
  });
});

describe('controlled write preparation (#19)', () => {
  it('reports project unavailability without reading or creating anything', async () => {
    const reply = await prepareControlledReview(
      {
        resolveProjectRoot: () => Promise.resolve(null),
        journalPath: join(tmpdir(), 'pioneer-unused-journal.jsonl'),
        now: () => FIXED_NOW,
      },
      prepareInput(),
      EXPECTATION,
    );
    expect(reply).toEqual({ ok: false, code: 'PROJECT_UNAVAILABLE' });
  });

  it('does not trust an absolute or escaping target path', async () => {
    const root = await makeProject();
    for (const targetPath of [
      '/etc/passwd',
      'C:/Windows/win.ini',
      '../x',
      'nested/../README.md',
      '..\\escape.txt',
    ]) {
      const reply = await prepareControlledReview(
        dependenciesFor(root),
        prepareInput(targetPath),
        EXPECTATION,
      );
      expect(reply).toEqual({ ok: false, code: 'INVALID_REQUEST' });
    }
    // No traversal ever reached the parent directory of the project.
    expect(await exists(join(dirname(root), 'x'))).toBe(false);
    expect(await exists(join(dirname(root), 'escape.txt'))).toBe(false);
  });

  it('refuses read_only before resolving or reading the project', async () => {
    const root = await makeProject();
    const readme = join(root, 'README.md');
    const original = await readFile(readme, 'utf8');
    let resolved = false;
    const reply = await prepareControlledReview(
      {
        resolveProjectRoot: () => {
          resolved = true;
          return Promise.resolve(root);
        },
        journalPath: journalFor(root),
        now: () => FIXED_NOW,
      },
      prepareInput('README.md', 'read_only'),
      EXPECTATION,
    );
    expect(reply).toEqual({ ok: false, code: 'PERMISSION_READ_ONLY' });
    expect(resolved).toBe(false);
    expect(await readFile(readme, 'utf8')).toBe(original);
    expect(await exists(journalFor(root))).toBe(false);
  });

  it('limits the review mode to read_only and workspace_write', () => {
    const base = prepareInput();
    expect(WriteReviewPrepareSchema.safeParse(base).success).toBe(true);
    expect(
      WriteReviewPrepareSchema.safeParse({ ...base, mode: 'read_only' })
        .success,
    ).toBe(true);
    expect(
      WriteReviewPrepareSchema.safeParse({ ...base, mode: 'full_access' })
        .success,
    ).toBe(false);
    expect(
      WriteReviewPrepareSchema.safeParse({ ...base, mode: 'auto_review' })
        .success,
    ).toBe(false);
    expect(
      WriteReviewPrepareSchema.safeParse({ ...base, mode: undefined }).success,
    ).toBe(false);
  });
});

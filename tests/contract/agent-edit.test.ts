import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  realpath,
} from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { executeAgentEdit } from '../../apps/desktop/src/main/harness/agent-edit';
import { buildEgressManifest } from '../../apps/desktop/src/main/harness/egress-materials';
import { RunManager } from '../../apps/desktop/src/main/harness/run-manager';
import { RunJournal } from '../../apps/desktop/src/main/harness/run-journal';
import type { HarnessHandle } from '../../apps/desktop/src/main/harness/adapter-seam';
import { RUN_LIMITS } from '../../apps/desktop/src/shared/contracts/pioneer-run';
import {
  createControlledAdapterFactory,
  type ControlledScript,
} from '../../apps/desktop/src/main/harness/controlled-adapter';
import type {
  RunEdit,
  EditToolRequest,
} from '../../apps/desktop/src/shared/contracts/agent-edit';

const request: EditToolRequest = {
  tool: 'edit_file',
  arguments: { path: 'note.txt', oldText: 'old', newText: '新内容' },
};
const identity = {
  sessionId: 'session:test',
  projectId: 'project:test',
  runId: 'run:test',
  revision: 1,
};
const binding = { webContentsId: 1, windowEpoch: 0 };
const readRequest = {
  tool: 'read_file',
  arguments: { path: 'note.txt' },
} as const;
const secondEdit: EditToolRequest = {
  tool: 'edit_file',
  arguments: { path: 'note.txt', oldText: '新内容', newText: 'final content' },
};

async function fixture(content = 'before old after\r\n') {
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), 'pioneer-edit-')),
  );
  const projectRoot = join(directory, 'project');
  await mkdir(projectRoot);
  const target = join(projectRoot, 'note.txt');
  await writeFile(target, content);
  const [material] = await buildEgressManifest(projectRoot, ['note.txt']);
  if (!material) throw new Error('missing fixture');
  const controller = new AbortController();
  let receipt: RunEdit | undefined;
  const input = {
    request,
    identity,
    ...binding,
    projectRoot,
    material,
    signal: controller.signal,
    dependencies: {
      resolveProjectRoot: () => Promise.resolve(projectRoot),
      journalPath: join(directory, 'writes.jsonl'),
    },
    onReceipt: (value: RunEdit) => {
      receipt = value;
    },
  };
  return { input, target, directory, controller, receipt: () => receipt };
}

async function startScript(
  f: Awaited<ReturnType<typeof fixture>>,
  steps: ControlledScript['steps'],
  hooks?: NonNullable<
    Parameters<typeof executeAgentEdit>[0]['dependencies']['hooks']
  >,
) {
  const { journal } = await RunJournal.open({
    load: () => Promise.resolve(null),
    save: () => Promise.resolve(),
  });
  const outcomes: Awaited<ReturnType<typeof executeAgentEdit>>[] = [];
  const factory = createControlledAdapterFactory({ steps });
  const manager = new RunManager({
    journal,
    adapterFactory: (context, emit) =>
      factory(
        {
          ...context,
          tools: {
            execute: async (tool) => {
              const outcome = await context.tools.execute(tool);
              outcomes.push(outcome);
              return outcome;
            },
          },
        },
        emit,
      ),
    adapterKind: 'controlled',
    adapterAvailable: true,
    modelName: null,
    resolveProject: () =>
      Promise.resolve({ root: f.input.projectRoot, projectName: 'fixture' }),
    windowBindings: { epochFor: () => 0 },
    sender: { send: () => undefined },
    editDependencies: { ...f.input.dependencies, ...(hooks ? { hooks } : {}) },
  });
  const auth = await manager.authorize({
    ...identity,
    ...binding,
    task: 'edit and verify note',
    materials: ['note.txt'],
    editMode: 'workspace_write',
  });
  if (!auth.ok) throw new Error(auth.code);
  const started = await manager.start(
    {
      ...identity,
      expectedRevision: 1,
      requestId: 'request:edit-loop',
      grantId: auth.authorization.grantId,
    },
    binding,
  );
  if (!started.ok) throw new Error(started.code);
  return {
    manager,
    outcomes,
    owner: { ...identity, ...binding, runId: started.runId },
  };
}

describe('real task text editing', () => {
  it('allows read-edit-read-edit and keeps the net diff from the original content', async () => {
    const f = await fixture();
    const run = await startScript(f, [
      { action: 'tool', request: readRequest },
      { action: 'tool', request },
      { action: 'tool', request: readRequest },
      { action: 'tool', request: secondEdit },
      { action: 'tool', request: readRequest },
      { action: 'complete' },
    ]);
    try {
      await expect
        .poll(() => run.manager.getContext(run.owner)?.status)
        .toBe('completed');
      expect(run.outcomes.map((outcome) => outcome.status)).toEqual(
        Array(5).fill('succeeded'),
      );
      expect(run.outcomes[2]).toMatchObject({
        text: 'before 新内容 after\r\n',
      });
      expect(run.outcomes[4]).toMatchObject({
        text: 'before final content after\r\n',
      });
      expect(await readFile(f.target, 'utf8')).toBe(
        'before final content after\r\n',
      );
      expect(run.manager.getContext(run.owner)?.edit).toMatchObject({
        before: 'before old after\r\n',
        after: 'before final content after\r\n',
        state: 'applied',
        code: null,
      });
      const records = (await readFile(f.input.dependencies.journalPath, 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as { kind: string });
      expect(
        records.filter((record) => record.kind === 'applied'),
      ).toHaveLength(2);
    } finally {
      await run.manager.shutdown();
    }
  });

  it('returns a bad match to the model and allows correction after an earlier successful edit', async () => {
    const f = await fixture();
    const run = await startScript(f, [
      { action: 'tool', request: readRequest },
      { action: 'tool', request },
      { action: 'tool', request }, // oldText no longer matches.
      { action: 'tool', request: readRequest },
      { action: 'tool', request: secondEdit },
      { action: 'complete' },
    ]);
    try {
      await expect
        .poll(() => run.manager.getContext(run.owner)?.status)
        .toBe('completed');
      expect(run.outcomes[2]).toMatchObject({
        status: 'rejected',
        code: 'INVALID_TOOL_REQUEST',
      });
      expect(run.outcomes[4]?.status).toBe('succeeded');
      expect(await readFile(f.target, 'utf8')).toBe(
        'before final content after\r\n',
      );
    } finally {
      await run.manager.shutdown();
    }
  });

  it('retains the verified first edit when a later writer attempt fails without writing', async () => {
    const f = await fixture();
    let writes = 0;
    const run = await startScript(
      f,
      [
        { action: 'tool', request: readRequest },
        { action: 'tool', request },
        { action: 'tool', request: secondEdit },
        { action: 'complete' },
      ],
      {
        beforeWrite: () => {
          if (++writes === 2) throw new Error('second write unavailable');
          return Promise.resolve();
        },
      },
    );
    try {
      await expect
        .poll(() => run.manager.getContext(run.owner)?.status)
        .toBe('failed');
      expect(await readFile(f.target, 'utf8')).toBe('before 新内容 after\r\n');
      expect(run.manager.getContext(run.owner)?.edit).toMatchObject({
        before: 'before old after\r\n',
        after: 'before 新内容 after\r\n',
        state: 'applied',
      });
      expect(run.manager.getContext(run.owner)?.edit?.code).not.toBeNull();
    } finally {
      await run.manager.shutdown();
    }
  });

  it('preserves surrounding text, verifies disk and advances readable material hash', async () => {
    const f = await fixture();
    const hash = f.input.material.sha256;
    expect((await executeAgentEdit(f.input)).status).toBe('succeeded');
    expect(await readFile(f.target, 'utf8')).toBe('before 新内容 after\r\n');
    expect(f.input.material.sha256).not.toBe(hash);
    expect(f.receipt()).toMatchObject({
      state: 'applied',
      before: 'before old after\r\n',
    });
    expect(await readFile(f.input.dependencies.journalPath, 'utf8')).toContain(
      '"kind":"applied"',
    );
  });

  it.each(['missing', 'old old'])(
    'refuses absent or ambiguous exact matches: %s',
    async (content) => {
      const f = await fixture(content);
      expect((await executeAgentEdit(f.input)).status).toBe('rejected');
      expect(await readFile(f.target, 'utf8')).toBe(content);
    },
  );

  it('does not overwrite a concurrent user change after authorization', async () => {
    const f = await fixture();
    await writeFile(f.target, 'human edit');
    expect(await executeAgentEdit(f.input)).toMatchObject({
      code: 'CONTENT_NOT_ALLOWED',
    });
    expect(await readFile(f.target, 'utf8')).toBe('human edit');
  });

  it('refuses paths outside the selected material and NUL/oversized content', async () => {
    const f = await fixture();
    for (const args of [
      { ...request.arguments, path: '../outside.txt' },
      { ...request.arguments, newText: '\0' },
      { ...request.arguments, newText: '中'.repeat(30_000) },
    ]) {
      expect(
        (
          await executeAgentEdit({
            ...f.input,
            request: { tool: 'edit_file', arguments: args },
          })
        ).status,
      ).toBe('rejected');
    }
    expect(await readFile(f.target, 'utf8')).toBe('before old after\r\n');
  });

  it('cancels at the pre-write boundary without changing the file', async () => {
    const f = await fixture();
    const result = await executeAgentEdit({
      ...f.input,
      dependencies: {
        ...f.input.dependencies,
        hooks: {
          beforeWrite: () => {
            f.controller.abort();
            return Promise.resolve();
          },
        },
      },
    });
    expect(result.status).toBe('failed');
    expect(f.receipt()?.state).toBe('not_applied');
    expect(await readFile(f.target, 'utf8')).toBe('before old after\r\n');
  });

  it('preserves an applied receipt when stop arrives after the write', async () => {
    const f = await fixture();
    await executeAgentEdit({
      ...f.input,
      dependencies: {
        ...f.input.dependencies,
        hooks: {
          afterWrite: () => {
            f.controller.abort();
            return Promise.resolve();
          },
        },
      },
    });
    expect(f.receipt()?.state).toBe('applied');
    expect(await readFile(f.target, 'utf8')).toContain('新内容');
  });

  it('refuses a change during writer admission and preserves unverified post-write effects', async () => {
    for (const when of ['beforeWrite', 'afterWrite'] as const) {
      const f = await fixture();
      await executeAgentEdit({
        ...f.input,
        dependencies: {
          ...f.input.dependencies,
          hooks: {
            [when]: async () => {
              await writeFile(f.target, 'human change');
            },
          },
        },
      });
      expect(await readFile(f.target, 'utf8')).toBe('human change');
      expect(f.receipt()?.state).toBe(
        when === 'beforeWrite' ? 'not_applied' : 'unverified',
      );
    }
  });

  it.each(['read_only', 'workspace_write'] as const)(
    'main enforces %s even when the adapter requests a write',
    async (editMode) => {
      const f = await fixture();
      const { journal } = await RunJournal.open({
        load: () => Promise.resolve(null),
        save: () => Promise.resolve(),
      });
      const script: ControlledScript = {
        steps: [
          {
            action: 'tool',
            request: { tool: 'read_file', arguments: { path: 'note.txt' } },
          },
          { action: 'tool', request },
          {
            action: 'tool',
            request: { tool: 'read_file', arguments: { path: 'note.txt' } },
          },
          { action: 'complete' },
        ],
      };
      const manager = new RunManager({
        journal,
        adapterFactory: createControlledAdapterFactory(script),
        adapterKind: 'controlled',
        adapterAvailable: true,
        modelName: null,
        resolveProject: () =>
          Promise.resolve({
            root: f.input.projectRoot,
            projectName: 'fixture',
          }),
        windowBindings: { epochFor: () => 0 },
        sender: { send: () => undefined },
        editDependencies: f.input.dependencies,
      });
      try {
        const auth = await manager.authorize({
          ...identity,
          ...binding,
          task: 'edit note',
          materials: ['note.txt'],
          editMode,
        });
        if (!auth.ok) throw new Error(auth.code);
        const started = await manager.start(
          {
            ...identity,
            expectedRevision: 1,
            requestId: 'request:test',
            grantId: auth.authorization.grantId,
          },
          binding,
        );
        if (!started.ok) throw new Error(started.code);
        const owner = { ...identity, ...binding, runId: started.runId };
        await expect
          .poll(() => manager.getContext(owner)?.status)
          .toBe('completed');
        const context = manager.getContext(owner);
        expect(context?.calls.at(-1)?.state).toBe('succeeded');
        expect(context?.edit?.state).toBe(
          editMode === 'workspace_write' ? 'applied' : undefined,
        );
        expect(context?.calls[1]?.state).toBe(
          editMode === 'workspace_write' ? 'succeeded' : 'rejected',
        );
        expect(await readFile(f.target, 'utf8')).toBe(
          editMode === 'workspace_write'
            ? 'before 新内容 after\r\n'
            : 'before old after\r\n',
        );
        expect(manager.getContext({ ...owner, webContentsId: 99 })).toBeNull();
      } finally {
        await manager.shutdown();
      }
    },
  );

  it.each([
    ['beforeWrite', 'stop', false],
    ['afterWrite', 'stop', false],
    ['beforeWrite', 'shutdown', false],
    ['afterWrite', 'shutdown', false],
    ['beforeWrite', 'stop', true],
    ['afterWrite', 'stop', true],
    ['beforeWrite', 'shutdown', true],
    ['afterWrite', 'shutdown', true],
  ] as const)(
    '%s stalled writer cannot block %s or change terminal facts later (prior edit: %s)',
    async (boundary, action, priorEdit) => {
      const f = await fixture();
      const { journal } = await RunJournal.open({
        load: () => Promise.resolve(null),
        save: () => Promise.resolve(),
      });
      let releaseWrite: () => void = () => undefined;
      const held = new Promise<void>((resolve) => {
        releaseWrite = resolve;
      });
      let markAdmitted: () => void = () => undefined;
      const admitted = new Promise<void>((resolve) => {
        markAdmitted = resolve;
      });
      const factory = createControlledAdapterFactory({
        steps: [
          {
            action: 'tool',
            request: { tool: 'read_file', arguments: { path: 'note.txt' } },
          },
          { action: 'tool', request },
          ...(priorEdit
            ? [{ action: 'tool' as const, request: secondEdit }]
            : []),
          { action: 'complete' },
        ],
      });
      let handle: HarnessHandle | undefined;
      let writes = 0;
      let clockOffset = 0;
      const stopGraceMs = 80;
      const manager = new RunManager({
        journal,
        adapterFactory: (context, emit) => {
          handle = factory(context, emit);
          return handle;
        },
        adapterKind: 'controlled',
        adapterAvailable: true,
        modelName: null,
        resolveProject: () =>
          Promise.resolve({
            root: f.input.projectRoot,
            projectName: 'fixture',
          }),
        windowBindings: { epochFor: () => 0 },
        sender: { send: () => undefined },
        now: () => Date.now() + clockOffset,
        limits: { ...RUN_LIMITS, stopGraceMs },
        editDependencies: {
          ...f.input.dependencies,
          hooks: {
            [boundary]: async () => {
              if (++writes === 1 && priorEdit) return;
              markAdmitted();
              await held;
            },
          },
        },
      });
      let shutdown: Promise<void> | undefined;
      try {
        const auth = await manager.authorize({
          ...identity,
          ...binding,
          task: 'edit note',
          materials: ['note.txt'],
          editMode: 'workspace_write',
        });
        if (!auth.ok) throw new Error(auth.code);
        const started = await manager.start(
          {
            ...identity,
            expectedRevision: 1,
            requestId: 'request:stalled-write',
            grantId: auth.authorization.grantId,
          },
          binding,
        );
        if (!started.ok) throw new Error(started.code);
        const owner = { ...identity, ...binding, runId: started.runId };
        await admitted;
        let shutdownSettled = false;
        if (action === 'stop') manager.stop(owner);
        else {
          shutdown = manager.shutdown().then(() => {
            shutdownSettled = true;
          });
          // Let shutdown hit its deadline on the next poll, ahead of the
          // stop timer, while the writer is still blocked.
          clockOffset += stopGraceMs;
        }
        await expect
          .poll(() => manager.getContext(owner)?.status, { timeout: 1_000 })
          .toBe('failed');
        if (action === 'shutdown') {
          await expect.poll(() => shutdownSettled).toBe(true);
        }
        const context = manager.getContext(owner);
        const page = manager.getRun({ ...owner, afterSeq: 0 });
        expect(context?.edit).toMatchObject({
          state: 'unverified',
          code: 'STOP_TIMEOUT',
          before: 'before old after\r\n',
          after: 'before 新内容 after\r\n',
        });
        expect(
          context?.calls
            .filter((call) => call.tool === 'edit_file')
            .map((call) => call.state),
        ).toEqual(priorEdit ? ['succeeded', 'cancelled'] : ['cancelled']);
        expect(page?.events.at(-1)?.body).toMatchObject({
          type: 'run.failed',
          code: 'STOP_TIMEOUT',
        });
        releaseWrite();
        await handle?.quiescent;
        expect(manager.getContext(owner)).toEqual(context);
        expect(manager.getRun({ ...owner, afterSeq: 0 })).toEqual(page);
        expect(await readFile(f.target, 'utf8')).toBe(
          boundary === 'beforeWrite'
            ? priorEdit
              ? 'before 新内容 after\r\n'
              : 'before old after\r\n'
            : priorEdit
              ? 'before final content after\r\n'
              : 'before 新内容 after\r\n',
        );
      } finally {
        releaseWrite();
        await handle?.quiescent;
        await (shutdown ?? manager.shutdown());
      }
    },
  );
});

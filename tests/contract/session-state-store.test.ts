import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  LegacySessionWorkspaceState,
  SessionWorkspaceState,
} from '../../apps/desktop/src/shared/contracts/session-workspace';
import { createDockLayout } from '../../apps/desktop/src/shared/docking';
import {
  MAX_SESSION_STATE_BYTES,
  SessionStateRecordSchema,
  SESSION_STATE_VERSION,
  loadRecord,
} from '../../apps/desktop/src/shared/session-state';
import {
  SESSION_STATE_FILE_NAME,
  SessionStateStoreError,
  createSessionStateStore,
} from '../../apps/desktop/src/main/session-state-store';
import { SETTINGS_FILE_NAME } from '../../apps/desktop/src/main/settings-store';

const temporaryDirectories: string[] = [];

async function createUserDataDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'pioneer-session-state-'));
  temporaryDirectories.push(directory);
  return directory;
}

function stateWith(
  overrides: Partial<SessionWorkspaceState> = {},
): SessionWorkspaceState {
  const id = 'session:alpha' as const;
  return {
    sessions: [
      {
        id,
        project: {
          id: 'alpha',
          name: 'Alpha',
          absolutePath: 'C:\\workspace\\alpha',
          description: null,
          technologies: ['TypeScript'],
          hasGitRepository: true,
          lastModifiedAt: '2026-09-16T00:00:00.000Z',
          coverSeed: 'alpha',
        },
        title: 'Alpha session',
        customTitle: false,
        lastActivityAt: null,
        draft: '',
        messages: [],
        dock: createDockLayout('focus'),
        savedDock: null,
        layoutHistory: null,
        outputTab: 'preview',
        runHistory: [],
        runRevision: 0,
        lastRunView: null,
        branchOrigin: null,
      },
    ],
    openSessionIds: [id],
    activeTabId: id,
    mruTabIds: [id, 'library'],
    ...overrides,
  };
}

function legacyV3State(): LegacySessionWorkspaceState {
  const current = stateWith();
  return {
    ...current,
    sessions: current.sessions.map(
      ({
        dock,
        savedDock,
        layoutHistory,
        runHistory,
        runRevision,
        lastRunView,
        branchOrigin,
        ...base
      }) => {
        expect(dock).toEqual(createDockLayout('focus'));
        expect(savedDock).toBeNull();
        expect(layoutHistory).toBeNull();
        expect(runHistory).toEqual([]);
        expect(runRevision).toBe(0);
        expect(lastRunView).toBeNull();
        expect(branchOrigin).toBeNull();
        return {
          ...base,
          layout: 'focus',
          dockLayouts: {
            focus: createDockLayout('focus'),
            review: createDockLayout('review'),
            delivery: createDockLayout('delivery'),
          },
          savedLayouts: {},
        };
      },
    ),
  };
}

interface SessionStateRecordFixture {
  version: typeof SESSION_STATE_VERSION;
  state: SessionWorkspaceState;
}

function record(
  state: SessionWorkspaceState = stateWith(),
): SessionStateRecordFixture {
  return { version: SESSION_STATE_VERSION, state };
}

function firstSession(
  state: SessionWorkspaceState = stateWith(),
): SessionWorkspaceState['sessions'][number] {
  const [session] = state.sessions;
  if (session === undefined) throw new Error('Expected fixture session.');
  return session;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('session state schema', () => {
  it('rejects extra fields, invalid session references, and duplicate ids', () => {
    expect(() =>
      SessionStateRecordSchema.parse({ ...record(), extra: true }),
    ).toThrow();
    expect(() =>
      SessionStateRecordSchema.parse(
        record(stateWith({ openSessionIds: ['session:missing'] })),
      ),
    ).toThrow();
    expect(() =>
      SessionStateRecordSchema.parse(
        record(stateWith({ mruTabIds: ['session:alpha', 'session:alpha'] })),
      ),
    ).toThrow();
    expect(() =>
      SessionStateRecordSchema.parse(
        record(
          stateWith({
            sessions: [
              ...stateWith().sessions,
              { ...firstSession(), title: 'Duplicate' },
            ],
          }),
        ),
      ),
    ).toThrow();
  });

  it('rejects bounded field overflows and oversized serialized state', () => {
    expect(() =>
      SessionStateRecordSchema.parse(
        record(
          stateWith({
            sessions: [{ ...firstSession(), title: 'x'.repeat(49) }],
          }),
        ),
      ),
    ).toThrow();
    expect(() =>
      SessionStateRecordSchema.parse(
        record(
          stateWith({
            sessions: [
              {
                ...firstSession(),
                draft: 'x'.repeat(MAX_SESSION_STATE_BYTES),
              },
            ],
          }),
        ),
      ),
    ).toThrow();
  });
});

describe('session state store', () => {
  it('returns null only when its fixed state file is absent', async () => {
    const userDataPath = await createUserDataDirectory();

    await expect(
      createSessionStateStore(userDataPath).load(),
    ).resolves.toBeNull();
  });

  it('saves a strict versioned record under userData and restores it', async () => {
    const userDataPath = await createUserDataDirectory();
    const store = createSessionStateStore(userDataPath);
    const state = stateWith();

    await store.save(state);

    expect(await readdir(userDataPath)).toEqual([SESSION_STATE_FILE_NAME]);
    expect(
      JSON.parse(
        await readFile(join(userDataPath, SESSION_STATE_FILE_NAME), 'utf8'),
      ),
    ).toEqual({ version: SESSION_STATE_VERSION, state });
    await expect(store.load()).resolves.toEqual(state);
  });

  it('round-trips a bounded per-session run history', async () => {
    const userDataPath = await createUserDataDirectory();
    const store = createSessionStateStore(userDataPath);
    const state = stateWith();
    firstSession(state).runHistory = [
      {
        runId: 'run:one',
        task: '读取 README 并总结。',
        status: 'completed',
        failureCode: null,
        startedAt: '2026-10-27T04:20:57.101Z',
        endedAt: '2026-10-27T04:21:00.735Z',
        stopRequestedAt: null,
        resultText: '这是一个 alpha fixture。',
        truncated: false,
      },
    ];
    await store.save(state);
    const loaded = await store.load();
    expect(loaded?.sessions[0]?.runHistory).toHaveLength(1);
    expect(loaded?.sessions[0]?.runHistory[0]).toMatchObject({
      runId: 'run:one',
      task: '读取 README 并总结。',
      status: 'completed',
      resultText: '这是一个 alpha fixture。',
    });
  });

  it('captures a validated snapshot before callers can mutate the input', async () => {
    const userDataPath = await createUserDataDirectory();
    const store = createSessionStateStore(userDataPath);
    const state = stateWith();
    const expected = stateWith();

    const save = store.save(state);
    firstSession(state).title = 'Mutated after enqueue';
    await save;

    await expect(store.load()).resolves.toEqual(expected);
  });

  it('serializes concurrent saves in call order', async () => {
    const userDataPath = await createUserDataDirectory();
    const store = createSessionStateStore(userDataPath);
    const first = stateWith({
      sessions: [{ ...firstSession(), title: 'First' }],
    });
    const second = stateWith({
      sessions: [{ ...firstSession(), title: 'Second' }],
    });

    await Promise.all([store.save(first), store.save(second)]);

    await expect(store.load()).resolves.toEqual(second);
  });

  it('retains the prior file and cleans its temporary sibling after replacement fails', async () => {
    const userDataPath = await createUserDataDirectory();
    const stableStore = createSessionStateStore(userDataPath);
    await stableStore.save(stateWith());
    const writes: string[] = [];
    const failingStore = createSessionStateStore(userDataPath, {
      mkdir,
      readFile,
      rename: () => Promise.reject(new Error('simulated replacement failure')),
      rm,
      writeFile: async (path, data, options) => {
        writes.push(path);
        return writeFile(path, data, options);
      },
    });

    await expect(
      failingStore.save(
        stateWith({
          sessions: [{ ...firstSession(), title: 'After' }],
        }),
      ),
    ).rejects.toThrow('simulated replacement failure');
    await expect(stableStore.load()).resolves.toEqual(stateWith());
    expect(writes).toHaveLength(1);
    expect(await readdir(userDataPath)).toEqual([SESSION_STATE_FILE_NAME]);
  });

  it('does not overwrite corrupt records or turn read failures into an empty state', async () => {
    const userDataPath = await createUserDataDirectory();
    const statePath = join(userDataPath, SESSION_STATE_FILE_NAME);
    await writeFile(statePath, '{ malformed', 'utf8');
    const store = createSessionStateStore(userDataPath);

    await expect(store.load()).rejects.toMatchObject<
      Partial<SessionStateStoreError>
    >({
      name: 'SessionStateStoreError',
      code: 'INVALID_STATE',
    });
    await expect(readFile(statePath, 'utf8')).resolves.toBe('{ malformed');

    const readFailingStore = createSessionStateStore(userDataPath, {
      mkdir,
      readFile: () => Promise.reject(new Error('disk read failure')),
      rename,
      rm,
      writeFile,
    });
    await expect(readFailingStore.load()).rejects.toMatchObject<
      Partial<SessionStateStoreError>
    >({ name: 'SessionStateStoreError', code: 'READ_FAILED' });
    await expect(readFile(statePath, 'utf8')).resolves.toBe('{ malformed');
  });

  it('leaves root settings untouched', async () => {
    const userDataPath = await createUserDataDirectory();
    const settingsPath = join(userDataPath, SETTINGS_FILE_NAME);
    const settingsContents = JSON.stringify({ rootPath: 'C:\\workspace' });
    await writeFile(settingsPath, settingsContents, 'utf8');

    await createSessionStateStore(userDataPath).save(stateWith());

    await expect(readFile(settingsPath, 'utf8')).resolves.toBe(
      settingsContents,
    );
  });
});

describe('session state migration', () => {
  it('loads and saves a v7 record at the byte limit without expanding it', async () => {
    const userDataPath = await createUserDataDirectory();
    const statePath = join(userDataPath, SESSION_STATE_FILE_NAME);
    const state = stateWith();
    const { branchOrigin: _origin, ...oldSession } = firstSession(state);
    expect(_origin).toBeNull();
    const sessions = Array.from({ length: 11 }, (_, index) => ({
      ...oldSession,
      id: `session:large-${String(index)}` as const,
      messages: Array.from({ length: 100 }, () => 'x'.repeat(7600)),
    }));
    const first = sessions[0];
    if (!first) throw new Error('Expected session');
    const old = {
      version: 7,
      state: {
        ...state,
        sessions,
        openSessionIds: [first.id],
        activeTabId: first.id,
        mruTabIds: [first.id, 'library'],
      },
    };
    let remaining =
      MAX_SESSION_STATE_BYTES - Buffer.byteLength(JSON.stringify(old));
    for (const session of sessions) {
      for (
        let index = 0;
        index < session.messages.length && remaining > 0;
        index++
      ) {
        const addition = Math.min(400, remaining);
        const message = session.messages[index];
        if (message === undefined) throw new Error('Expected message');
        session.messages[index] = message + 'x'.repeat(addition);
        remaining -= addition;
      }
    }
    expect(remaining).toBe(0);
    const bytes = JSON.stringify(old);
    expect(Buffer.byteLength(bytes)).toBe(MAX_SESSION_STATE_BYTES);
    await writeFile(statePath, bytes, 'utf8');
    const store = createSessionStateStore(userDataPath);
    const loaded = await store.load();
    expect(await readFile(statePath, 'utf8')).toBe(bytes);
    if (!loaded) throw new Error('Expected migrated state');
    expect(loaded.sessions[0]?.branchOrigin).toBeUndefined();
    await store.save(loaded);
    expect(Buffer.byteLength(await readFile(statePath))).toBe(
      MAX_SESSION_STATE_BYTES,
    );
    expect((await store.load())?.sessions).toHaveLength(11);
  });

  it('reads v7 without rewriting it, then saves v8 with no branch origin', async () => {
    const userDataPath = await createUserDataDirectory();
    const statePath = join(userDataPath, SESSION_STATE_FILE_NAME);
    const state = stateWith();
    const session = firstSession(state);
    const { branchOrigin, ...v7Session } = session;
    expect(branchOrigin).toBeNull();
    const old = {
      version: 7,
      state: {
        ...state,
        sessions: [
          {
            ...v7Session,
            messages: ['old message'],
            draft: 'old draft',
            runRevision: 3,
          },
        ],
      },
    };
    const bytes = JSON.stringify(old);
    await writeFile(statePath, bytes, 'utf8');
    const store = createSessionStateStore(userDataPath);
    const loaded = await store.load();
    expect(await readFile(statePath, 'utf8')).toBe(bytes);
    expect(loaded?.sessions[0]).toMatchObject({
      messages: ['old message'],
      draft: 'old draft',
      runRevision: 3,
    });
    if (!loaded) throw new Error('Expected migrated state');
    await store.save(loaded);
    const saved = SessionStateRecordSchema.parse(
      JSON.parse(await readFile(statePath, 'utf8')),
    );
    expect(saved.version).toBe(8);
    expect(
      (await createSessionStateStore(userDataPath).load())?.sessions[0]
        ?.branchOrigin,
    ).toBeUndefined();
  });

  it('loads v3 without rewriting bytes and retains dormant layouts through v5 save and restart', async () => {
    const userDataPath = await createUserDataDirectory();
    const statePath = join(userDataPath, SESSION_STATE_FILE_NAME);
    const state = legacyV3State();
    const oldSession = state.sessions[0];
    if (!oldSession) throw new Error('Expected old session');
    oldSession.layout = 'delivery';
    oldSession.dockLayouts.delivery.ratio = 41;
    oldSession.savedLayouts.review = {
      ...createDockLayout('review'),
      ratio: 37,
    };
    const bytes = JSON.stringify({ version: 3, state });
    await writeFile(statePath, bytes, 'utf8');
    const store = createSessionStateStore(userDataPath);
    const loaded = await store.load();
    expect(await readFile(statePath, 'utf8')).toBe(bytes);
    if (!loaded?.sessions[0]) throw new Error('Expected migrated state');
    expect(loaded.sessions[0].dock.ratio).toBe(41);
    loaded.sessions[0].dock.ratio = 64;
    await store.save(loaded);
    const restarted = await createSessionStateStore(userDataPath).load();
    expect(restarted?.sessions[0]?.dock.ratio).toBe(64);
    expect(restarted?.sessions[0]?.layoutHistory).toEqual({
      layout: 'delivery',
      dockLayouts: oldSession.dockLayouts,
      savedLayouts: oldSession.savedLayouts,
    });
    expect(
      SessionStateRecordSchema.parse(
        JSON.parse(await readFile(statePath, 'utf8')),
      ).version,
    ).toBe(SESSION_STATE_VERSION);
  });
  function legacyRecord(): Record<string, unknown> {
    const current = firstSession();
    const legacySession = {
      id: current.id,
      project: current.project,
      title: current.title,
      customTitle: current.customTitle,
      draft: 'legacy draft',
      messages: ['legacy message'],
      layout: 'review',
      panels: ['context'],
      panelLayouts: { focus: [], review: ['diff'], delivery: ['outputs'] },
      outputTab: 'files',
    };
    return {
      version: 1,
      state: {
        sessions: [legacySession],
        openSessionIds: [current.id],
        activeTabId: current.id,
        mruTabIds: [current.id, 'library'],
      },
    };
  }

  it('migrates a strict v1 record without losing session content', () => {
    const migrated = loadRecord(legacyRecord());
    const session = migrated.state.sessions[0];
    expect(migrated.version).toBe(SESSION_STATE_VERSION);
    expect(session?.runHistory).toEqual([]);
    expect(session?.lastActivityAt).toBeNull();
    expect(session?.draft).toBe('legacy draft');
    expect(session?.messages).toEqual(['legacy message']);
    expect(session?.dock).toEqual(createDockLayout('review', ['context']));
    expect(session?.layoutHistory?.dockLayouts.focus).toEqual(
      createDockLayout('focus'),
    );
    expect(session?.layoutHistory?.savedLayouts).toEqual({});
  });

  it('rejects unknown versions and invalid dock boundaries', () => {
    expect(() => loadRecord({ ...legacyRecord(), version: 99 })).toThrow();
    const invalid = stateWith();
    const session = invalid.sessions[0];
    if (!session) throw new Error('Expected a stored session.');
    const dock = { ...session.dock, ratio: 24 };
    expect(() =>
      SessionStateRecordSchema.parse({
        version: SESSION_STATE_VERSION,
        state: {
          ...invalid,
          sessions: [
            {
              ...session,
              dock,
            },
          ],
        },
      }),
    ).toThrow();
  });

  it('allows a hidden conversation only while another panel remains visible', () => {
    const base = record();
    const session = firstSession(base.state);
    const focus = session.dock;
    const withFocus = (candidate: unknown): unknown => ({
      ...base,
      state: {
        ...base.state,
        sessions: [
          {
            ...session,
            dock: candidate,
          },
        ],
      },
    });
    const hiddenConversation = {
      ...focus,
      hidden: ['conversation', 'capabilities', 'diff', 'outputs'],
    };
    expect(() =>
      SessionStateRecordSchema.parse(withFocus(hiddenConversation)),
    ).not.toThrow();
    expect(() =>
      SessionStateRecordSchema.parse(
        withFocus({
          ...hiddenConversation,
          hidden: [...hiddenConversation.hidden, 'context', 'runlog'],
        }),
      ),
    ).toThrow();
    expect(() =>
      SessionStateRecordSchema.parse(
        withFocus({
          ...focus,
          columns: [
            ['context', 'context', 'capabilities', 'diff', 'outputs'],
            ['conversation'],
          ],
        }),
      ),
    ).toThrow();
  });

  it('reads v1 without rewriting it, then writes the current version on the next save', async () => {
    const userDataPath = await createUserDataDirectory();
    const statePath = join(userDataPath, SESSION_STATE_FILE_NAME);
    const legacy = JSON.stringify(legacyRecord());
    await writeFile(statePath, legacy, 'utf8');
    const store = createSessionStateStore(userDataPath);
    await expect(store.load()).resolves.toMatchObject({
      sessions: [{ draft: 'legacy draft' }],
    });
    await expect(readFile(statePath, 'utf8')).resolves.toBe(legacy);
    await store.save(stateWith());
    expect(await readFile(statePath, 'utf8')).toContain(
      `"version":${String(SESSION_STATE_VERSION)}`,
    );
  });

  it('migrates v2 activity as unknown without rewriting content, then writes the current version explicitly', async () => {
    const userDataPath = await createUserDataDirectory();
    const statePath = join(userDataPath, SESSION_STATE_FILE_NAME);
    const state = legacyV3State();
    const old = {
      version: 2,
      state: {
        ...state,
        sessions: state.sessions.map(({ lastActivityAt, ...session }) => {
          expect(lastActivityAt).toBeNull();
          return session;
        }),
      },
    };
    const bytes = JSON.stringify(old);
    await writeFile(statePath, bytes, 'utf8');
    const store = createSessionStateStore(userDataPath);
    const loaded = await store.load();
    expect(loaded).toEqual(loadRecord(old).state);
    expect(loaded?.sessions[0]?.layoutHistory?.dockLayouts).toEqual(
      state.sessions[0]?.dockLayouts,
    );
    expect(await readFile(statePath, 'utf8')).toBe(bytes);
    if (!loaded) throw new Error('Expected migrated state');
    await store.save(loaded);
    expect(JSON.parse(await readFile(statePath, 'utf8'))).toEqual({
      version: SESSION_STATE_VERSION,
      state: loaded,
    });
  });

  it('rejects forged or missing v3 timestamps without changing the original file', async () => {
    const userDataPath = await createUserDataDirectory();
    const statePath = join(userDataPath, SESSION_STATE_FILE_NAME);
    for (const time of [undefined, -1, 1.5, Number.MAX_SAFE_INTEGER, 'today']) {
      const bad = JSON.stringify({
        version: 3,
        state: {
          ...legacyV3State(),
          sessions: [{ ...legacyV3State().sessions[0], lastActivityAt: time }],
        },
      });
      await writeFile(statePath, bad, 'utf8');
      await expect(
        createSessionStateStore(userDataPath).load(),
      ).rejects.toMatchObject({ code: 'INVALID_STATE' });
      expect(await readFile(statePath, 'utf8')).toBe(bad);
    }
  });
});

describe('session state v5 migration (#41 stage 2)', () => {
  function v4Record(session: SessionWorkspaceState['sessions'][number]) {
    const legacySession = {
      id: session.id,
      project: session.project,
      title: session.title,
      customTitle: session.customTitle,
      lastActivityAt: session.lastActivityAt,
      draft: session.draft,
      messages: session.messages,
      dock: session.dock,
      savedDock: session.savedDock,
      layoutHistory: session.layoutHistory,
      outputTab: session.outputTab,
    };
    return {
      version: 4,
      state: {
        ...stateWith(),
        sessions: [
          {
            ...legacySession,
            draft: '继续定位缓存键冲突',
            messages: ['读取缓存模块'],
            intentState: {
              phase: 'ready',
              draftInstruction: '定位缓存键冲突',
              intent: {
                id: `intent:${session.id}`,
                projectId: session.project.id,
                revision: 3,
                instruction: '定位缓存键冲突，不修改文件',
                steps: [{ id: 'step:1', summary: '读取缓存模块' }],
                status: 'ready',
              },
              runtime: null,
              error: null,
            },
          },
        ],
      },
    };
  }

  it('drops a stored v4 intent state on load and leaves the file untouched until a save', async () => {
    const userDataPath = await createUserDataDirectory();
    const statePath = join(userDataPath, SESSION_STATE_FILE_NAME);
    const bytes = JSON.stringify(v4Record(firstSession(stateWith())));
    await writeFile(statePath, bytes, 'utf8');

    const loaded = await createSessionStateStore(userDataPath).load();
    const session = loaded?.sessions[0];
    expect(session?.draft).toBe('继续定位缓存键冲突');
    expect(session?.messages).toEqual(['读取缓存模块']);
    expect(session).not.toHaveProperty('intentState');
    expect(await readFile(statePath, 'utf8')).toBe(bytes);
  });

  it('loads a v5 record whose session omits intentState', async () => {
    const userDataPath = await createUserDataDirectory();
    const statePath = join(userDataPath, SESSION_STATE_FILE_NAME);
    const state = stateWith();
    const session = firstSession(state);
    const withoutIntentState = {
      id: session.id,
      project: session.project,
      title: session.title,
      customTitle: session.customTitle,
      lastActivityAt: session.lastActivityAt,
      draft: '缺字段也要能打开',
      messages: ['读取缓存模块'],
      dock: session.dock,
      savedDock: session.savedDock,
      layoutHistory: session.layoutHistory,
      outputTab: session.outputTab,
    };
    const bytes = JSON.stringify({
      version: 5,
      state: { ...state, sessions: [withoutIntentState] },
    });
    await writeFile(statePath, bytes, 'utf8');

    const loaded = await createSessionStateStore(userDataPath).load();
    const restored = loaded?.sessions[0];
    expect(restored?.draft).toBe('缺字段也要能打开');
    expect(restored?.messages).toEqual(['读取缓存模块']);
    expect(restored?.runHistory).toEqual([]);
    expect(restored).not.toHaveProperty('intentState');
    expect(await readFile(statePath, 'utf8')).toBe(bytes);
  });
});

describe('session v6 migration (#17 RunLog panel)', () => {
  function legacyDock() {
    return {
      columns: [
        ['context', 'capabilities', 'diff', 'outputs'],
        ['conversation'],
      ],
      hidden: ['context', 'capabilities', 'diff', 'outputs'],
      ratio: 60,
      weights: {
        conversation: 2,
        context: 1,
        capabilities: 1,
        diff: 1,
        outputs: 1,
      },
    };
  }

  it('inserts the hidden RunLog panel into every stored layout', () => {
    const session = firstSession(stateWith());
    const legacy = {
      id: session.id,
      project: session.project,
      title: session.title,
      customTitle: session.customTitle,
      lastActivityAt: session.lastActivityAt,
      draft: '保留草稿',
      messages: ['读取缓存模块'],
      dock: legacyDock(),
      savedDock: { ...legacyDock(), ratio: 38 },
      layoutHistory: {
        layout: 'focus',
        dockLayouts: {
          focus: legacyDock(),
          review: { ...legacyDock(), ratio: 40 },
          delivery: legacyDock(),
        },
        savedLayouts: { review: { ...legacyDock(), ratio: 42 } },
      },
      outputTab: 'preview',
      runHistory: [],
    };
    const migrated = loadRecord({
      version: 6,
      state: { ...stateWith(), sessions: [legacy] },
    });
    expect(migrated.version).toBe(SESSION_STATE_VERSION);
    const restored = migrated.state.sessions[0];
    if (!restored) throw new Error('Expected migrated session');
    expect(restored.draft).toBe('保留草稿');
    expect(restored.dock).toEqual(createDockLayout('focus'));
    expect(restored.dock.columns.flat()).toContain('runlog');
    expect(restored.dock.hidden).toContain('runlog');
    expect(restored.dock.weights.runlog).toBe(1);
    expect(restored.savedDock?.columns.flat()).toContain('runlog');
    expect(restored.savedDock?.ratio).toBe(38);
    expect(restored.layoutHistory?.dockLayouts.review.columns.flat()).toContain(
      'runlog',
    );
    expect(restored.layoutHistory?.dockLayouts.review.ratio).toBe(40);
    expect(
      restored.layoutHistory?.savedLayouts.review?.columns.flat(),
    ).toContain('runlog');
    expect(restored.layoutHistory?.savedLayouts.review?.ratio).toBe(42);
  });

  it('rejects a five-panel dock in a current v7 record', () => {
    const state = stateWith();
    const session = state.sessions[0];
    if (!session) throw new Error('Expected a stored session.');
    const legacyDock = {
      columns: [
        ['context', 'capabilities', 'diff', 'outputs'],
        ['conversation'],
      ],
      hidden: ['context', 'capabilities', 'diff', 'outputs'],
      ratio: 60,
      weights: {
        conversation: 2,
        context: 1,
        capabilities: 1,
        diff: 1,
        outputs: 1,
      },
    };
    expect(() =>
      SessionStateRecordSchema.parse({
        version: SESSION_STATE_VERSION,
        state: { ...state, sessions: [{ ...session, dock: legacyDock }] },
      }),
    ).toThrow();
  });
});

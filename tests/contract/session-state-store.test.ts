import { initialIntentWorkspaceState } from '../../apps/desktop/src/shared/contracts/intent-workspace';
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
        intentState: initialIntentWorkspaceState(),
        outputTab: 'preview',
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
      ({ dock, savedDock, layoutHistory, intentState, ...base }) => {
        expect(dock).toEqual(createDockLayout('focus'));
        expect(savedDock).toBeNull();
        expect(layoutHistory).toBeNull();
        expect(intentState.phase).toBe('compose');
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
  it('loads v4 records without intentState and never rewrites the source merely by reading', async () => {
    const userDataPath = await createUserDataDirectory();
    const statePath = join(userDataPath, SESSION_STATE_FILE_NAME);
    const existing = JSON.parse(JSON.stringify(record())) as {
      version: number;
      state: { sessions: Array<Record<string, unknown>> };
    };
    const session = existing.state.sessions[0];
    if (!session) throw new Error('Expected session fixture');
    delete session.intentState;
    session.draft = '2026-10-24 的草稿';
    session.messages = ['原来的消息'];
    const original = JSON.stringify(existing);
    await writeFile(statePath, original, 'utf8');

    const store = createSessionStateStore(userDataPath);
    const loaded = await store.load();
    expect(loaded?.sessions[0]?.draft).toBe('2026-10-24 的草稿');
    expect(loaded?.sessions[0]?.messages).toEqual(['原来的消息']);
    expect(loaded?.sessions[0]?.intentState).toEqual(
      initialIntentWorkspaceState(),
    );
    expect(await readFile(statePath, 'utf8')).toBe(original);
    if (!loaded) throw new Error('Expected restored state');
    await store.save(loaded);
    expect(
      SessionStateRecordSchema.parse(
        JSON.parse(await readFile(statePath, 'utf8')),
      ).version,
    ).toBe(4);
  });

  it('ignores invalid legacy intent metadata without hiding unrelated record corruption', async () => {
    const userDataPath = await createUserDataDirectory();
    const statePath = join(userDataPath, SESSION_STATE_FILE_NAME);
    const existing = JSON.parse(JSON.stringify(record())) as {
      state: { sessions: Array<Record<string, unknown>> };
    };
    const session = existing.state.sessions[0];
    if (!session) throw new Error('Expected session fixture');
    session.intentState = { phase: 'review', intent: null };
    const bytes = JSON.stringify(existing);
    await writeFile(statePath, bytes, 'utf8');

    const store = createSessionStateStore(userDataPath);
    const loaded = await store.load();
    expect(loaded?.sessions[0]?.intentState).toEqual(
      initialIntentWorkspaceState(),
    );
    expect(await readFile(statePath, 'utf8')).toBe(bytes);

    session.dock = { ...createDockLayout('focus'), ratio: 1 };
    await writeFile(statePath, JSON.stringify(existing), 'utf8');
    await expect(store.load()).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
  });

  it('loads v3 without rewriting bytes and retains dormant layouts through v4 save and restart', async () => {
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
    ).toBe(4);
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
    expect(migrated.version).toBe(4);
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
          hidden: [...hiddenConversation.hidden, 'context'],
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

  it('reads v1 without rewriting it, then writes v4 on the next save', async () => {
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
    expect(await readFile(statePath, 'utf8')).toContain('"version":4');
  });

  it('migrates v2 activity as unknown without rewriting content, then writes v4 explicitly', async () => {
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
      version: 4,
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

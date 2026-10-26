import { describe, expect, it, vi } from 'vitest';
import { registerSessionStateIpc } from '../../apps/desktop/src/main/session-state-ipc';
import { SESSION_IPC_CHANNELS } from '../../apps/desktop/src/shared/contracts/session-ipc';
import {
  initialSessionWorkspaceState,
  sessionWorkspaceReducer,
} from '../../apps/desktop/src/renderer/state/session-workspace-reducer';
import type { IpcInvokeEventLike } from '../../apps/desktop/src/main/ipc';

function harness() {
  const handlers = new Map<
    string,
    (event: IpcInvokeEventLike, ...args: unknown[]) => Promise<unknown>
  >();
  const frame = { url: 'file:///C:/Pioneer/index.html' };
  const contents = { id: 42, mainFrame: frame, getURL: () => frame.url };
  const store = {
    load: vi.fn().mockResolvedValue(initialSessionWorkspaceState),
    save: vi.fn().mockResolvedValue(undefined),
  };
  const lifecycle = { connect: vi.fn(), finish: vi.fn() };
  registerSessionStateIpc({
    ipcMain: {
      handle: (channel, handler) => {
        handlers.set(channel, handler);
      },
    },
    mainWindow: { webContents: contents },
    expectedRendererUrl: frame.url,
    store,
    lifecycle,
  });
  const invoke = (
    channel: string,
    event: IpcInvokeEventLike,
    ...args: unknown[]
  ) => {
    const handler = handlers.get(channel);
    if (!handler) throw new Error('missing handler');
    return handler(event, ...args);
  };
  const event = { sender: contents, senderFrame: frame };
  return { handlers, frame, contents, store, lifecycle, invoke, event };
}
describe('app-owned session state IPC', () => {
  it('accepts a trusted failed-close result without accepting force or a foreign failure report', async () => {
    const h = harness();
    await h.invoke(SESSION_IPC_CHANNELS.closeResult, h.event, 'failed');
    expect(h.lifecycle.finish).toHaveBeenCalledExactlyOnceWith('failed');
    await expect(
      h.invoke(SESSION_IPC_CHANNELS.closeResult, h.event, 'force'),
    ).rejects.toThrow('Invalid');
    await expect(
      h.invoke(
        SESSION_IPC_CHANNELS.closeResult,
        { ...h.event, senderFrame: null },
        'failed',
      ),
    ).rejects.toThrow('Untrusted');
    expect(h.lifecycle.finish).toHaveBeenCalledTimes(1);
    expect(h.store.save).not.toHaveBeenCalled();
  });
  it('queries activity from a validated store without messages, writes, or close-state changes', async () => {
    const h = harness();
    const state = sessionWorkspaceReducer(initialSessionWorkspaceState, {
      type: 'CREATE_SESSION',
      id: 'session:a',
      occurredAt: 1_000,
      project: {
        id: 'alpha',
        name: 'Alpha',
        absolutePath: 'C:\\workspace\\alpha',
        description: null,
        technologies: [],
        hasGitRepository: false,
        lastModifiedAt: '2099-01-01T00:00:00.000Z',
        coverSeed: 'alpha',
      },
    });
    h.store.load.mockResolvedValue(state);
    await expect(h.invoke('session-state:activity', h.event)).resolves.toEqual({
      sessions: [
        { id: 'session:a', projectId: 'alpha', lastActivityAt: 1_000 },
      ],
      workspaces: [
        {
          projectId: 'alpha',
          lastActivityAt: 1_000,
          mostRecentSessionId: 'session:a',
        },
      ],
    });
    expect(h.store.save).not.toHaveBeenCalled();
    expect(h.lifecycle.connect).not.toHaveBeenCalled();
    expect(h.lifecycle.finish).not.toHaveBeenCalled();
    h.store.load.mockResolvedValue(null);
    await expect(h.invoke('session-state:activity', h.event)).resolves.toEqual({
      sessions: [],
      workspaces: [],
    });
  });

  it('rejects untrusted activity queries and arguments before reading, and propagates corrupt records', async () => {
    const h = harness();
    await expect(
      h.invoke('session-state:activity', {
        ...h.event,
        sender: { ...h.contents, id: 99 },
      }),
    ).rejects.toThrow('Untrusted');
    await expect(
      h.invoke('session-state:activity', h.event, {}),
    ).rejects.toThrow('Invalid');
    expect(h.store.load).not.toHaveBeenCalled();
    h.store.load.mockRejectedValue(new Error('corrupt record'));
    await expect(h.invoke('session-state:activity', h.event)).rejects.toThrow(
      'corrupt record',
    );
    expect(h.store.save).not.toHaveBeenCalled();
  });

  it('registers fixed channels and accepts only the trusted frame and validated snapshots', async () => {
    const h = harness();
    expect([...h.handlers.keys()].sort()).toEqual(
      Object.values(SESSION_IPC_CHANNELS).sort(),
    );
    await expect(h.invoke(SESSION_IPC_CHANNELS.load, h.event)).resolves.toEqual(
      initialSessionWorkspaceState,
    );
    await expect(
      h.invoke(
        SESSION_IPC_CHANNELS.save,
        h.event,
        initialSessionWorkspaceState,
      ),
    ).resolves.toBeUndefined();
    expect(h.store.save).toHaveBeenCalledWith(initialSessionWorkspaceState);
    expect(h.lifecycle.connect).toHaveBeenCalledTimes(1);
    await h.invoke(SESSION_IPC_CHANNELS.closeResult, h.event, 'saved');
    expect(h.lifecycle.finish).toHaveBeenCalledWith('saved');
  });
  it('rejects foreign, child and navigated senders before store access', async () => {
    const h = harness();
    const events = [
      { ...h.event, sender: { ...h.contents, id: 43 } },
      { ...h.event, senderFrame: { url: h.frame.url } },
      { ...h.event, senderFrame: null },
      {
        ...h.event,
        sender: { ...h.contents, getURL: () => 'https://untrusted.invalid' },
      },
    ];
    for (const event of events) {
      await expect(h.invoke(SESSION_IPC_CHANNELS.load, event)).rejects.toThrow(
        'Untrusted',
      );
      await expect(
        h.invoke(SESSION_IPC_CHANNELS.activity, event),
      ).rejects.toThrow('Untrusted');
      await expect(
        h.invoke(
          SESSION_IPC_CHANNELS.save,
          event,
          initialSessionWorkspaceState,
        ),
      ).rejects.toThrow('Untrusted');
      await expect(
        h.invoke(SESSION_IPC_CHANNELS.closeResult, event, 'discard'),
      ).rejects.toThrow('Untrusted');
    }
    h.frame.url = 'file:///C:/Other/index.html';
    await expect(h.invoke(SESSION_IPC_CHANNELS.load, h.event)).rejects.toThrow(
      'Untrusted',
    );
    await expect(
      h.invoke(SESSION_IPC_CHANNELS.activity, h.event),
    ).rejects.toThrow('Untrusted');
    expect(h.store.load).not.toHaveBeenCalled();
    expect(h.store.save).not.toHaveBeenCalled();
    expect(h.lifecycle.finish).not.toHaveBeenCalled();
  });
  it('rejects paths, surplus args, extra fields and broken references without writing', async () => {
    const h = harness();
    await expect(
      h.invoke(SESSION_IPC_CHANNELS.load, h.event, 'C:/other.json'),
    ).rejects.toThrow('Invalid');
    for (const args of [
      [],
      ['path'],
      [initialSessionWorkspaceState, 'extra'],
      [{ ...initialSessionWorkspaceState, path: 'C:/other.json' }],
      [{ ...initialSessionWorkspaceState, activeTabId: 'session:missing' }],
    ]) {
      await expect(
        h.invoke(SESSION_IPC_CHANNELS.save, h.event, ...args),
      ).rejects.toThrow('Invalid');
    }
    expect(h.store.load).not.toHaveBeenCalled();
    expect(h.store.save).not.toHaveBeenCalled();
    for (const args of [[], ['force'], ['discard', 'extra']]) {
      await expect(
        h.invoke(SESSION_IPC_CHANNELS.closeResult, h.event, ...args),
      ).rejects.toThrow('Invalid');
    }
    expect(h.lifecycle.finish).not.toHaveBeenCalled();
  });
});

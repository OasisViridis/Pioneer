import { describe, expect, it } from 'vitest';

import { registerRunIpc } from '../../apps/desktop/src/main/run-ipc';
import type { RunManager } from '../../apps/desktop/src/main/harness/run-manager';
import type { IpcInvokeEventLike } from '../../apps/desktop/src/main/ipc';
import { RUN_IPC_CHANNELS } from '../../apps/desktop/src/shared/contracts/run-ipc';

const rendererUrl = 'http://localhost:3001/index.html';
const frame = { url: rendererUrl };
const webContents = {
  id: 7,
  mainFrame: frame,
  getURL: () => rendererUrl,
};
const event: IpcInvokeEventLike = {
  sender: webContents,
  senderFrame: frame,
};

type Handler = (event: IpcInvokeEventLike, ...args: unknown[]) => unknown;

function setup(manager: Partial<RunManager>): Map<string, Handler> {
  const handlers = new Map<string, Handler>();
  registerRunIpc({
    ipcMain: {
      handle: (channel, listener) => {
        handlers.set(channel, listener);
      },
    },
    mainWindow: { webContents },
    expectedRendererUrl: 'http://localhost:3001',
    manager: manager as RunManager,
    listMaterials: () => Promise.resolve([]),
    windowEpoch: () => 3,
  });
  return handlers;
}

describe('run IPC identity forwarding', () => {
  it('passes the full run identity and window binding to ACK', async () => {
    const calls: unknown[] = [];
    const handlers = setup({
      acknowledge: (input) => {
        calls.push(input);
      },
    });
    const request = {
      sessionId: 'session:alpha',
      projectId: 'project:alpha',
      runId: 'run:alpha',
      revision: 2,
      afterSeq: 5,
    };
    await handlers.get(RUN_IPC_CHANNELS.ack)?.(event, request);
    expect(calls).toEqual([{ ...request, webContentsId: 7, windowEpoch: 3 }]);
  });

  it('passes the full run identity and window binding to unsubscribe', async () => {
    const calls: unknown[] = [];
    const handlers = setup({
      unsubscribe: (input) => {
        calls.push(input);
      },
    });
    const request = {
      sessionId: 'session:alpha',
      projectId: 'project:alpha',
      runId: 'run:alpha',
      revision: 2,
    };
    await handlers.get(RUN_IPC_CHANNELS.unsubscribe)?.(event, request);
    expect(calls).toEqual([{ ...request, webContentsId: 7, windowEpoch: 3 }]);
  });
});

import { describe, expect, it } from 'vitest';

import type { WriteController } from '../../apps/desktop/src/main/write-controller';
import { registerWriteIpc } from '../../apps/desktop/src/main/write-ipc';
import type { IpcInvokeEventLike } from '../../apps/desktop/src/main/ipc';
import { WRITE_IPC_CHANNELS } from '../../apps/desktop/src/shared/contracts/write-preview';

/**
 * P4-A (#19) IPC probes: every write request carries the window binding and the
 * run/proposal identity main needs, and an untrusted sender never reaches the
 * controller.
 */

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
const untrusted: IpcInvokeEventLike = {
  sender: { ...webContents, id: 8 },
  senderFrame: frame,
};

type Handler = (event: IpcInvokeEventLike, ...args: unknown[]) => unknown;

function setup(controller: Partial<WriteController>): Map<string, Handler> {
  const handlers = new Map<string, Handler>();
  registerWriteIpc({
    ipcMain: {
      handle: (channel, listener) => {
        handlers.set(channel, listener);
      },
    },
    mainWindow: { webContents },
    expectedRendererUrl: 'http://localhost:3001',
    controller: controller as WriteController,
    windowEpoch: () => 3,
  });
  return handlers;
}

const identity = {
  proposalId: 'proposal:0000000000001',
  sessionId: 'session:alpha',
  projectId: 'project:alpha',
  runId: 'run:alpha',
  revision: 2,
  previewRevision: 1,
};

describe('write IPC identity forwarding', () => {
  it('forwards the permission request with the window binding', async () => {
    const calls: unknown[] = [];
    const handlers = setup({
      setPermission: (input) => {
        calls.push(input);
        return Promise.resolve({ ok: true, mode: 'workspace_write' });
      },
    });
    const request = {
      sessionId: 'session:alpha',
      projectId: 'project:alpha',
      mode: 'workspace_write',
      riskAcknowledged: false,
    };
    const reply = await handlers.get(WRITE_IPC_CHANNELS.permissionSet)?.(
      event,
      request,
    );
    expect(reply).toEqual({ ok: true, mode: 'workspace_write' });
    expect(calls).toEqual([{ ...request, webContentsId: 7, windowEpoch: 3 }]);
  });

  it('forwards apply with the exact reviewed revision', async () => {
    const calls: unknown[] = [];
    const handlers = setup({
      apply: (input) => {
        calls.push(input);
        return Promise.resolve({
          ok: false,
          code: 'TARGET_CHANGED',
          report: null,
        });
      },
    });
    const reply = await handlers.get(WRITE_IPC_CHANNELS.previewApply)?.(
      event,
      identity,
    );
    expect(reply).toEqual({
      ok: false,
      code: 'TARGET_CHANGED',
      report: null,
    });
    expect(calls).toEqual([{ ...identity, webContentsId: 7, windowEpoch: 3 }]);
  });

  it('refuses an untrusted sender before any controller call', async () => {
    let called = false;
    const handlers = setup({
      apply: () => {
        called = true;
        return Promise.resolve({ ok: true, report: null as never });
      },
    });
    const reply = await handlers.get(WRITE_IPC_CHANNELS.previewApply)?.(
      untrusted,
      identity,
    );
    expect(reply).toEqual({
      ok: false,
      code: 'UNTRUSTED_SENDER',
      report: null,
    });
    expect(called).toBe(false);
  });

  it('refuses a malformed request without reaching the controller', async () => {
    let called = false;
    const handlers = setup({
      getPreview: () => {
        called = true;
        return { ok: false, code: 'PROPOSAL_NOT_FOUND' };
      },
    });
    const reply = await handlers.get(WRITE_IPC_CHANNELS.previewGet)?.(event, {
      proposalId: 'proposal:1',
    });
    expect(reply).toEqual({ ok: false, code: 'INVALID_REQUEST' });
    expect(called).toBe(false);
  });
});

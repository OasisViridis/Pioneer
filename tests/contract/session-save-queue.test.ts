import { describe, expect, it, vi } from 'vitest';
import { createSessionSaveQueue } from '../../apps/desktop/src/renderer/state/session-save-queue';
import { initialSessionWorkspaceState } from '../../apps/desktop/src/renderer/state/session-workspace-reducer';

describe('session save queue', () => {
  it('serializes in-flight writes and coalesces to the latest snapshot before flush completes', async () => {
    let release!: () => void;
    const first = new Promise<void>((resolve) => {
      release = resolve;
    });
    const save = vi
      .fn()
      .mockImplementationOnce(() => first)
      .mockResolvedValue(undefined);
    const queue = createSessionSaveQueue(save, () => undefined);
    queue.enqueue(initialSessionWorkspaceState);
    const middle = {
      ...initialSessionWorkspaceState,
      activeTabId: 'settings' as const,
    };
    const latest = {
      ...initialSessionWorkspaceState,
      mruTabIds: ['library' as const, 'settings' as const],
    };
    queue.enqueue(middle);
    queue.enqueue(latest);
    expect(save).toHaveBeenCalledTimes(1);
    release();
    await queue.flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(latest);
    expect(queue.isDirty()).toBe(false);
  });
  it('retains a failed snapshot and retries explicitly without looping or reporting it saved', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValue(undefined);
    const changed = vi.fn();
    const queue = createSessionSaveQueue(save, changed);
    queue.enqueue(initialSessionWorkspaceState);
    await expect(queue.flush()).rejects.toThrow('disk full');
    expect(queue.isDirty()).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    await queue.retry();
    expect(save).toHaveBeenCalledTimes(2);
    expect(queue.isDirty()).toBe(false);
    expect(changed).toHaveBeenLastCalledWith({ status: 'saved', error: null });
  });
});

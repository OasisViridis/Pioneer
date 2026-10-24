import { describe, expect, it, vi } from 'vitest';
import {
  createCloseCoordinator,
  createPendingSaveTracker,
  createWindowCloseBarrier,
} from '../../apps/desktop/src/main/window-lifecycle';

describe('window close coordination', () => {
  it('invalidates a save barrier on renderer replacement without closing the new renderer', async () => {
    let finish!: () => void;
    const close = vi.fn();
    const settle = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const barrier = createWindowCloseBarrier({ settle, close });
    barrier.wait();
    barrier.wait();
    expect(settle).toHaveBeenCalledTimes(1);
    barrier.invalidate();
    finish();
    await Promise.resolve();
    expect(close).not.toHaveBeenCalled();
    barrier.wait();
    finish();
    await Promise.resolve();
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('keeps a failed save actionable and accepts a later explicit retry or discard', () => {
    const notify = vi.fn();
    const close = vi.fn();
    const lifecycle = createCloseCoordinator({ notify, close });
    lifecycle.connect();
    lifecycle.request();
    lifecycle.finish('failed');
    expect(close).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledTimes(1);
    lifecycle.finish('discard');
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('keeps an accepted save pending until it settles, even before hydration', async () => {
    const writes = createPendingSaveTracker();
    let finishSave: (() => void) | undefined;
    const save = writes.track(
      new Promise<void>((resolve) => {
        finishSave = resolve;
      }),
    );
    expect(writes.hasPending()).toBe(true);
    const settled = writes.settle();
    finishSave?.();
    await save;
    await settled;
    expect(writes.hasPending()).toBe(false);
  });
  it('allows early close before hydration, but waits for the renderer after it connects', () => {
    const notify = vi.fn();
    const close = vi.fn();
    const lifecycle = createCloseCoordinator({ notify, close });
    expect(lifecycle.request()).toBe(true);
    lifecycle.connect();
    expect(lifecycle.request()).toBe(false);
    expect(lifecycle.request()).toBe(false);
    expect(notify).toHaveBeenCalledTimes(1);
    lifecycle.finish('saved');
    expect(close).toHaveBeenCalledTimes(1);
    expect(lifecycle.request()).toBe(true);
  });
  it('ignores unsolicited completion and allows cancel then explicit discard', () => {
    const notify = vi.fn();
    const close = vi.fn();
    const lifecycle = createCloseCoordinator({ notify, close });
    lifecycle.connect();
    lifecycle.finish('discard');
    expect(close).not.toHaveBeenCalled();
    lifecycle.request();
    lifecycle.finish('cancel');
    expect(close).not.toHaveBeenCalled();
    lifecycle.request();
    expect(notify).toHaveBeenCalledTimes(2);
    lifecycle.finish('discard');
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('replays a newer system close observed before the old cancel arrives', () => {
    const notify = vi.fn();
    const close = vi.fn();
    const lifecycle = createCloseCoordinator({ notify, close });
    lifecycle.connect();
    lifecycle.request();
    lifecycle.request();
    lifecycle.finish('cancel');
    expect(notify).toHaveBeenCalledTimes(2);
    expect(close).not.toHaveBeenCalled();
    lifecycle.finish('saved');
    expect(close).toHaveBeenCalledTimes(1);
  });
});

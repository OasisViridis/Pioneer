import { afterEach, expect, it, vi } from 'vitest';
import { awaitCloseFlush } from '../../apps/desktop/src/renderer/state/close-deadline';

afterEach(() => {
  vi.useRealTimers();
});
it('times out only the close wait, not the ongoing save, and clears its timer', async () => {
  vi.useFakeTimers();
  let release = (): void => {
    throw new Error('not initialized');
  };
  const save = new Promise<void>((resolve) => {
    release = resolve;
  });
  const waiting = expect(awaitCloseFlush(save)).rejects.toThrow('尚未确认保存');
  await vi.advanceTimersByTimeAsync(8000);
  await waiting;
  release();
  await expect(save).resolves.toBeUndefined();
  expect(vi.getTimerCount()).toBe(0);
});
it('preserves save rejection and clears timers on success and failure', async () => {
  vi.useFakeTimers();
  await expect(awaitCloseFlush(Promise.resolve())).resolves.toBeUndefined();
  await expect(
    awaitCloseFlush(Promise.reject(new Error('disk'))),
  ).rejects.toThrow('disk');
  expect(vi.getTimerCount()).toBe(0);
});

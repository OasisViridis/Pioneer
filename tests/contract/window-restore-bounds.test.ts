import { describe, expect, it } from 'vitest';
import { resolveWindowRestoreBounds } from '../../apps/desktop/src/main/window-restore-bounds';
const primary = { x: 0, y: 0, width: 1920, height: 1040 };
describe('current-display window restoration in logical DIP coordinates', () => {
  it('leaves a fully visible normal window unchanged', () => {
    const bounds = { x: 100, y: 80, width: 1200, height: 800 };
    expect(resolveWindowRestoreBounds(bounds, [primary])).toEqual(bounds);
  });
  it('brings a window back to the remaining display after a monitor is removed', () => {
    expect(
      resolveWindowRestoreBounds(
        { x: -2400, y: 40, width: 1200, height: 800 },
        [primary],
      ),
    ).toEqual({ x: 0, y: 40, width: 1200, height: 800 });
  });
  it('keeps negative coordinates when that display is still present', () => {
    const secondary = { x: -1920, y: 0, width: 1920, height: 1040 };
    const bounds = { x: -1600, y: 90, width: 1200, height: 800 };
    expect(resolveWindowRestoreBounds(bounds, [primary, secondary])).toEqual(
      bounds,
    );
  });
  it('selects the display with the greatest overlap, not just the primary', () => {
    const secondary = { x: 1920, y: 0, width: 1280, height: 720 };
    expect(
      resolveWindowRestoreBounds({ x: 1850, y: 80, width: 1000, height: 800 }, [
        primary,
        secondary,
      ]),
    ).toEqual({ x: 1920, y: 0, width: 1000, height: 720 });
  });
  it('clamps width, height and position to the current work area after a DPI / resolution change', () => {
    expect(
      resolveWindowRestoreBounds(
        { x: 500, y: 600, width: 1440, height: 1000 },
        [{ x: 0, y: 0, width: 960, height: 540 }],
      ),
    ).toEqual({ x: 0, y: 0, width: 960, height: 540 });
  });
  it('chooses the nearest work area for a completely off-screen old window', () => {
    expect(
      resolveWindowRestoreBounds(
        { x: -5000, y: 100, width: 800, height: 600 },
        [primary, { x: -1920, y: 0, width: 1920, height: 1040 }],
      ),
    ).toEqual({ x: -1920, y: 100, width: 800, height: 600 });
  });
  it('does not accept an empty or malformed current topology', () => {
    const bounds = { x: 0, y: 0, width: 800, height: 600 };
    expect(() => resolveWindowRestoreBounds(bounds, [])).toThrow(
      'No usable display work area',
    );
    expect(() =>
      resolveWindowRestoreBounds(bounds, [{ ...primary, width: 0 }]),
    ).toThrow('No usable display work area');
  });
  it('recovers invalid native bounds to a visible default without mutating input areas', () => {
    const before = { ...primary };
    expect(
      resolveWindowRestoreBounds(
        { x: NaN, y: Infinity, width: -1, height: 0 },
        [primary],
      ),
    ).toEqual({ x: 0, y: 0, width: 1200, height: 800 });
    expect(primary).toEqual(before);
  });
});

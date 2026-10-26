import type { WindowBounds } from './window-controls';

/** Main-owned DIP geometry only. Supply current work areas at restore time. */
export function resolveWindowRestoreBounds(
  bounds: WindowBounds,
  workAreas: readonly WindowBounds[],
): WindowBounds {
  const valid = (rectangle: WindowBounds): boolean =>
    Object.values(rectangle).every(Number.isFinite) &&
    rectangle.width >= 1 &&
    rectangle.height >= 1;
  const areas = workAreas.filter(valid);
  const first = areas[0];
  if (first === undefined) throw new Error('No usable display work area');
  if (!valid(bounds))
    return {
      x: first.x,
      y: first.y,
      width: Math.min(1200, first.width),
      height: Math.min(800, first.height),
    };
  const overlap = (area: WindowBounds): number =>
    Math.max(
      0,
      Math.min(bounds.x + bounds.width, area.x + area.width) -
        Math.max(bounds.x, area.x),
    ) *
    Math.max(
      0,
      Math.min(bounds.y + bounds.height, area.y + area.height) -
        Math.max(bounds.y, area.y),
    );
  const distance = (area: WindowBounds): number => {
    const centerX = bounds.x + bounds.width / 2,
      centerY = bounds.y + bounds.height / 2;
    const x = Math.max(area.x, Math.min(centerX, area.x + area.width));
    const y = Math.max(area.y, Math.min(centerY, area.y + area.height));
    return (centerX - x) ** 2 + (centerY - y) ** 2;
  };
  const area = areas.reduce((best, candidate) => {
    const bestOverlap = overlap(best),
      candidateOverlap = overlap(candidate);
    if (candidateOverlap > bestOverlap) return candidate;
    return candidateOverlap === bestOverlap &&
      distance(candidate) < distance(best)
      ? candidate
      : best;
  }, first);
  const width = Math.min(bounds.width, area.width),
    height = Math.min(bounds.height, area.height);
  return {
    x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)),
    width,
    height,
  };
}

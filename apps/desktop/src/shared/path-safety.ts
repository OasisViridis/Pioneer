/**
 * One rule for "may this path component appear in a project path", shared by the
 * write-permission contract and the read-only tool policy. Both paths guard the
 * same boundary, so the segment rule lives once to keep them from drifting.
 */

/** Windows reserves these device names even when a suffix follows. */
const RESERVED_DEVICE_NAME =
  /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³]|conin\$|conout\$)(?:\.|$)/i;

export function isSafePathSegment(segment: string): boolean {
  return (
    segment.length > 0 &&
    segment !== '.' &&
    segment !== '..' &&
    !/[\u0000-\u001f\u007f:<>"|?*]/.test(segment) &&
    !/[. ]$/.test(segment) &&
    !RESERVED_DEVICE_NAME.test(segment)
  );
}

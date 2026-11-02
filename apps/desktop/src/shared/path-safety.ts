/**
 * One rule for "may this path component appear in a project path", shared by the
 * write-permission contract and the read-only tool policy. Both paths guard the
 * same boundary, so the segment rule lives once to keep them from drifting.
 */

/** Windows reserves these device names even when a suffix follows. */
const RESERVED_DEVICE_NAME =
  /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³]|conin\$|conout\$)(?:\.|$)/i;

/** Both the read-only policy and the write contract cap a path at this depth. */
export const MAX_PATH_COMPONENTS = 32;

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

/**
 * Whole-segment, case-insensitive match against a list of protected paths.
 * `.git`, `.git/config`, `vendor/x/.git/config` and `.GIT/config` all match
 * `.git`; a lookalike such as `.github/workflows` does not. Shared by the
 * permission check and the observation allowance so the two cannot drift.
 */
export function matchesProtectedPath(
  path: string,
  protectedPaths: readonly string[],
): boolean {
  const wrapped = `/${path.toLowerCase()}/`;
  return protectedPaths.some((protectedPath) =>
    wrapped.includes(`/${protectedPath.toLowerCase()}/`),
  );
}

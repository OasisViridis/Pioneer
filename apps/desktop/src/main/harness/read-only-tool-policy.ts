import { lstat, realpath } from 'node:fs/promises';
import { isAbsolute, parse, relative, resolve } from 'node:path';
import { z } from 'zod';
import {
  ReadOnlyToolNameSchema,
  ReadOnlyToolRequestSchema,
  type ReadOnlyToolRejection,
  type ReadOnlyToolRequest,
} from '../../shared/contracts/read-only-tools';
import { isPathInsideRoot, normalizeRootPath } from '../catalog/path-policy';

export type ReadOnlyToolDecision =
  | ReadOnlyToolRejection
  | {
      ok: true;
      value: { request: ReadOnlyToolRequest; absolutePath: string };
    };

const messages = {
  TOOL_NOT_ALLOWED: 'This tool is not available in the read-only policy.',
  INVALID_TOOL_REQUEST:
    'The tool request does not match the read-only contract.',
  INVALID_PATH:
    'Use a plain project-relative path without traversal or special syntax.',
  PROJECT_UNAVAILABLE:
    'The selected project is unavailable or has changed location.',
  PATH_UNAVAILABLE: 'The requested project entry is unavailable.',
  PATH_OUTSIDE_PROJECT:
    'The requested entry resolves outside the selected project.',
  LINK_NOT_ALLOWED:
    'Links and path aliases are not available in the read-only policy.',
  PATH_TYPE_NOT_ALLOWED:
    'This tool requires a regular file or a directory of the expected type.',
  SENSITIVE_PATH: 'This source is excluded from the read-only policy.',
} as const;

function reject(
  code: ReadOnlyToolRejection['error']['code'],
): ReadOnlyToolRejection {
  return {
    ok: false,
    error: { code, message: messages[code], retryable: false },
  };
}

function isSafeRelativePath(path: string): boolean {
  if (path === '.') return true;
  const parts = path.split(/[\\/]/);
  return (
    parts.length <= 32 &&
    parts.every(
      (part) =>
        part !== '' &&
        part !== '.' &&
        part !== '..' &&
        !/[\x00-\x1f\x7f:<>"|?*]/.test(part) &&
        !/[. ]$/.test(part) &&
        !/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³]|conin\$|conout\$)(?:\.|$)/i.test(
          part,
        ),
    )
  );
}

/** Reusable per-entry filter for traversals: skipped entries never get enumerated outward. */
export function isSensitiveEntryName(part: string): boolean {
  return (
    part.startsWith('.') ||
    part.toLowerCase() === 'node_modules' ||
    /^(?:auth|credentials?|secrets?)(?:\.|$)/i.test(part) ||
    /^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.|$)/i.test(part) ||
    /\.(?:pem|key|p12|pfx|keystore)$/i.test(part)
  );
}

/** Main-only preflight. The root must come from main's selected project, never tool input.
 * A successful check is not an atomic filesystem capability; see the P2 policy decision.
 */
export async function checkReadOnlyToolRequest(
  projectRoot: string,
  input: unknown,
): Promise<ReadOnlyToolDecision> {
  const envelope = z.object({ tool: z.string() }).safeParse(input);
  if (!envelope.success) return reject('INVALID_TOOL_REQUEST');
  if (!ReadOnlyToolNameSchema.safeParse(envelope.data.tool).success)
    return reject('TOOL_NOT_ALLOWED');
  const parsed = ReadOnlyToolRequestSchema.safeParse(input);
  if (!parsed.success) return reject('INVALID_TOOL_REQUEST');
  if (!isSafeRelativePath(parsed.data.arguments.path))
    return reject('INVALID_PATH');
  if (
    parsed.data.arguments.path !== '.' &&
    parsed.data.arguments.path
      .split(/[\\/]/)
      .some(
        (part) =>
          part.startsWith('.') ||
          part.toLowerCase() === 'node_modules' ||
          /^(?:auth|credentials?|secrets?)(?:\.|$)/i.test(part) ||
          /^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.|$)/i.test(part) ||
          /\.(?:pem|key|p12|pfx|keystore)$/i.test(part),
      )
  )
    return reject('SENSITIVE_PATH');

  const root = normalizeRootPath(projectRoot);
  if (!isAbsolute(projectRoot) || root === parse(root).root)
    return reject('PROJECT_UNAVAILABLE');
  try {
    const rootStat = await lstat(root);
    if (
      rootStat.isSymbolicLink() ||
      !rootStat.isDirectory() ||
      relative(root, await realpath(root)) !== ''
    )
      return reject('PROJECT_UNAVAILABLE');
  } catch {
    return reject('PROJECT_UNAVAILABLE');
  }

  let current = root;
  const parts =
    parsed.data.arguments.path === '.'
      ? []
      : parsed.data.arguments.path.split(/[\\/]/);
  for (const part of parts) {
    current = resolve(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink())
        return reject('LINK_NOT_ALLOWED');
      const canonical = await realpath(current);
      if (!isPathInsideRoot(root, canonical))
        return reject('PATH_OUTSIDE_PROJECT');
      if (relative(current, canonical) !== '')
        return reject('LINK_NOT_ALLOWED');
    } catch {
      return reject('PATH_UNAVAILABLE');
    }
  }
  try {
    const entry = await lstat(current);
    if (entry.isSymbolicLink()) return reject('LINK_NOT_ALLOWED');
    if (entry.isFile() && entry.nlink !== 1) return reject('LINK_NOT_ALLOWED');
    if (
      parsed.data.tool === 'read_file' ? !entry.isFile() : !entry.isDirectory()
    )
      return reject('PATH_TYPE_NOT_ALLOWED');
  } catch {
    return reject('PATH_UNAVAILABLE');
  }
  return {
    ok: true,
    value: {
      request: parsed.data,
      absolutePath: current,
    },
  };
}

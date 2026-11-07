import {
  EDIT_FILE_BYTES,
  EditToolRequestSchema,
  type EditToolRequest,
  type RunEdit,
} from '../../shared/contracts/agent-edit';
import type { EgressMaterial } from '../../shared/contracts/egress';
import type { RunIdentity } from '../../shared/contracts/pioneer-run';
import { WritePermissionSchema } from '../../shared/contracts/write-permission';
import { isWellFormedWriteText } from '../../shared/contracts/write-execution';
import {
  executeControlledWrite,
  readProjectTarget,
  type WriteExecutionDependencies,
} from '../write-execution';
import { sha256OfBytes } from './write-permission/file-state';
import type { ToolOutcome } from './read-only-tools';

/** One narrowly scoped edit per run. The existing writer owns all disk guards. */
export async function executeAgentEdit(input: {
  request: EditToolRequest;
  identity: RunIdentity;
  webContentsId: number;
  windowEpoch: number;
  projectRoot: string;
  material: EgressMaterial;
  signal: AbortSignal;
  dependencies: WriteExecutionDependencies;
  onReceipt(receipt: RunEdit): void;
}): Promise<ToolOutcome> {
  const rejected = (): ToolOutcome => ({
    status: 'rejected',
    code: 'INVALID_TOOL_REQUEST',
  });
  const parsed = EditToolRequestSchema.safeParse(input.request);
  if (!parsed.success) return rejected();
  const { path, oldText, newText } = parsed.data.arguments;
  if (
    path !== input.material.path ||
    !isWellFormedWriteText(newText) ||
    newText.includes('\0')
  )
    return rejected();
  const permission = WritePermissionSchema.parse({
    version: 1,
    sessionId: input.identity.sessionId,
    projectId: input.identity.projectId,
    mode: 'workspace_write',
    scope: [path],
    protectedPaths: ['.git'],
    webContentsId: input.webContentsId,
    windowEpoch: input.windowEpoch,
    grantedAt: new Date().toISOString(),
    riskAcknowledged: false,
  });
  const read = await readProjectTarget(input.projectRoot, path, permission);
  if (!read.ok) return rejected();
  if (
    read.value.state.sha256 !== input.material.sha256 ||
    read.value.state.bytes !== input.material.bytes
  )
    return { status: 'rejected', code: 'CONTENT_NOT_ALLOWED' };
  const before = read.value.text;
  const offset = before.indexOf(oldText);
  if (offset < 0 || before.includes(oldText, offset + 1)) return rejected();
  const after =
    before.slice(0, offset) + newText + before.slice(offset + oldText.length);
  const bytes = Buffer.from(after, 'utf8');
  if (bytes.length > EDIT_FILE_BYTES || after === before) return rejected();
  if (input.signal.aborted) return { status: 'cancelled', code: 'CANCELLED' };
  const receipt: RunEdit = {
    path,
    before,
    after,
    state: 'pending',
    code: null,
  };
  input.onReceipt({ ...receipt });
  const result = await executeControlledWrite(
    { ...input.dependencies, signal: input.signal },
    {
      version: 1,
      ...input.identity,
      windowEpoch: input.windowEpoch,
      permission,
      targets: [
        {
          path,
          before: read.value.state,
          identity: read.value.identity,
          after: {
            kind: 'file',
            bytes: bytes.length,
            sha256: sha256OfBytes(bytes),
          },
          content: after,
        },
      ],
    },
    input,
  );
  const target = result.targets[0];
  receipt.state =
    target?.verification === 'verified_after'
      ? 'applied'
      : target?.status === 'unknown' ||
          target?.status === 'applied' ||
          target?.verification === 'failed'
        ? 'unverified'
        : 'not_applied';
  receipt.code = result.code;
  input.onReceipt({ ...receipt });
  if (!result.ok) return { status: 'failed', code: 'TOOL_FAILED' };
  // Only the verified self-written bytes become readable by this grant.
  input.material.bytes = bytes.length;
  input.material.sha256 = sha256OfBytes(bytes);
  return {
    status: 'succeeded',
    text: `已修改 ${path} 并核对写入结果。`,
    truncated: false,
  };
}

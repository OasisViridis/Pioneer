import {
  WRITE_PROTECTED_PATHS,
  WritePermissionSchema,
  type WritePermission,
  type WritePermissionMode,
} from '../../../shared/contracts/write-permission';
import { checkPermissionBinding } from './decision';

/**
 * P4-A (#19) session-scoped write permission store.
 *
 * One record per session. It is bound to the window and project that issued
 * it; a project switch, window close or main restart makes it unusable.
 * Lowering a mode replaces the record immediately; raising to a risky mode
 * needs a new risk acknowledgement, which the schema enforces.
 */

export interface WriteWindowBinding {
  webContentsId: number;
  windowEpoch: number;
}

export interface SetPermissionInput extends WriteWindowBinding {
  sessionId: string;
  projectId: string;
  mode: WritePermissionMode;
  riskAcknowledged: boolean;
}

export class WritePermissionStore {
  private readonly records = new Map<string, WritePermission>();
  private readonly now: () => Date;

  constructor(now: () => Date = () => new Date()) {
    this.now = now;
  }

  /** The permission only counts when it still belongs to this window/project. */
  get(
    sessionId: string,
    projectId: string,
    binding: WriteWindowBinding,
  ): WritePermission | null {
    const record = this.records.get(sessionId);
    if (record === undefined) return null;
    const matches = checkPermissionBinding(record, {
      sessionId,
      projectId,
      webContentsId: binding.webContentsId,
      windowEpoch: binding.windowEpoch,
    });
    return matches ? record : null;
  }

  /** Parses the record defensively; risky modes without acknowledgement throw. */
  set(input: SetPermissionInput): WritePermission {
    const record = WritePermissionSchema.parse({
      version: 1,
      sessionId: input.sessionId,
      projectId: input.projectId,
      mode: input.mode,
      // The first slice's preview is one proposal over its listed targets.
      scope: 'all_targets',
      protectedPaths: [...WRITE_PROTECTED_PATHS],
      webContentsId: input.webContentsId,
      windowEpoch: input.windowEpoch,
      grantedAt: this.now().toISOString(),
      riskAcknowledged: input.riskAcknowledged,
    });
    this.records.set(input.sessionId, record);
    return record;
  }

  /** Window/renderer gone: every record issued to it stops counting. */
  forgetWindow(webContentsId: number): void {
    for (const [sessionId, record] of this.records) {
      if (record.webContentsId === webContentsId) {
        this.records.delete(sessionId);
      }
    }
  }

  clear(): void {
    this.records.clear();
  }
}

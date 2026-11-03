import type {
  WriteApplyReport,
  WriteIpcErrorCode,
  WritePreview,
  WritePreviewState,
  WritePreviewSummary,
  WriteProposalOutcome,
  WriteProposalViewBinding,
} from '../shared/contracts/write-preview';
import type {
  WritePermissionMode,
  WriteTarget,
} from '../shared/contracts/write-permission';
import { applyWriteBatch } from './harness/write-permission/apply-write';
import {
  WritePermissionStore,
  type WriteWindowBinding,
} from './harness/write-permission/permission-store';
import {
  WriteProposalRegistry,
  type ProposeWriteRequest,
  type WriteProposalIdentity,
  type WriteProposalRevision,
} from './harness/write-permission/proposal-registry';
import type { WriteChangeJournal } from './harness/write-permission/write-journal';

/**
 * P4-A (#19) orchestration between the proposal registry, the session-scoped
 * permission and the write executor.
 *
 * All state is main-owned. The renderer only names the proposal, the run
 * identity and the reviewed `previewRevision`; it never supplies a path, bytes
 * or a permission fact. `auto_review` is the one mode that writes without a
 * per-change confirmation, as the P4-D1 decision defines; every other mode
 * applies only when the user's own request reaches this controller.
 */

export interface WriteControllerDependencies {
  proposals: WriteProposalRegistry;
  permissions: WritePermissionStore;
  journal: WriteChangeJournal;
  resolveProject(
    projectId: string,
  ): Promise<{ root: string; projectName: string } | null>;
  /** Newest run revision authorized in a session; a newer one expires previews. */
  currentRevision(sessionId: string): number;
  now?: () => string;
}

export interface PermissionSummary {
  mode: WritePermissionMode | null;
  riskAcknowledged: boolean;
}

export type SetPermissionResult =
  | { ok: true; mode: WritePermissionMode }
  | { ok: false; code: 'INVALID_REQUEST' };

export type ApplyControllerResult =
  | { ok: true; report: WriteApplyReport }
  | { ok: false; code: WriteIpcErrorCode; report: WriteApplyReport | null };

export type RefreshControllerResult =
  | {
      ok: true;
      preview: WritePreview;
      state: WritePreviewState;
      report: null;
    }
  | { ok: false; code: WriteIpcErrorCode };

export type RejectControllerResult =
  { ok: true } | { ok: false; code: WriteIpcErrorCode };

export type GetControllerResult =
  | {
      ok: true;
      preview: WritePreview;
      state: WritePreviewState;
      report: WriteApplyReport | null;
    }
  | { ok: false; code: 'PROPOSAL_NOT_FOUND' };

export type ProposeControllerRequest = ProposeWriteRequest;

export class WriteController {
  private readonly dependencies: WriteControllerDependencies;
  /** Serializes mutations so a permission change and an apply cannot interleave. */
  private chain: Promise<unknown> = Promise.resolve();

  constructor(dependencies: WriteControllerDependencies) {
    this.dependencies = dependencies;
  }

  private serialize<T>(task: () => T | Promise<T>): Promise<T> {
    const run = this.chain.then(() => task());
    // Keep the chain alive after a rejected operation; the next one still runs.
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private currentRevision(identity: WriteProposalIdentity): number {
    return this.dependencies.currentRevision(identity.sessionId);
  }

  /** A run revision newer than the reviewed one makes the old approval stale. */
  private revisionAdvanced(identity: WriteProposalIdentity): boolean {
    return this.currentRevision(identity) > identity.revision;
  }

  private now(): string {
    return this.dependencies.now?.() ?? new Date().toISOString();
  }

  getPermission(
    sessionId: string,
    projectId: string,
    binding: WriteWindowBinding,
  ): PermissionSummary {
    const record = this.dependencies.permissions.get(
      sessionId,
      projectId,
      binding,
    );
    return {
      mode: record?.mode ?? null,
      riskAcknowledged: record?.riskAcknowledged ?? false,
    };
  }

  setPermission(input: {
    sessionId: string;
    projectId: string;
    mode: WritePermissionMode;
    riskAcknowledged: boolean;
    webContentsId: number;
    windowEpoch: number;
  }): Promise<SetPermissionResult> {
    return this.serialize(() => {
      try {
        const record = this.dependencies.permissions.set(input);
        return { ok: true as const, mode: record.mode };
      } catch {
        // Risky modes without an explicit acknowledgement fail schema parsing.
        return { ok: false as const, code: 'INVALID_REQUEST' as const };
      }
    });
  }

  listPreviews(binding: WriteProposalViewBinding): WritePreviewSummary[] {
    return this.dependencies.proposals.list(binding);
  }

  getPreview(identity: WriteProposalIdentity): GetControllerResult {
    const lookup = this.dependencies.proposals.get(identity);
    if (!lookup.ok) return { ok: false, code: lookup.code };
    return {
      ok: true,
      preview: lookup.preview,
      state: lookup.state,
      report: lookup.report,
    };
  }

  refresh(identity: WriteProposalIdentity): Promise<RefreshControllerResult> {
    return this.serialize(async () => {
      if (this.revisionAdvanced(identity)) {
        this.dependencies.proposals.expire(identity);
        return { ok: false, code: 'PREVIEW_EXPIRED' };
      }
      const refreshed = await this.dependencies.proposals.refresh(identity);
      if (!refreshed.ok) return { ok: false, code: refreshed.code };
      return {
        ok: true,
        preview: refreshed.preview,
        state: 'pending',
        report: null,
      };
    });
  }

  reject(identity: WriteProposalRevision): Promise<RejectControllerResult> {
    return this.serialize(() => {
      if (this.revisionAdvanced(identity)) {
        this.dependencies.proposals.expire(identity);
        return { ok: false as const, code: 'PREVIEW_EXPIRED' as const };
      }
      const snapshot = this.dependencies.proposals.resolveForAction(identity);
      if (!snapshot.ok) return { ok: false as const, code: snapshot.code };
      this.dependencies.proposals.markState(identity, 'rejected');
      return { ok: true as const };
    });
  }

  async propose(
    request: ProposeControllerRequest,
  ): Promise<WriteProposalOutcome> {
    const created = await this.dependencies.proposals.propose(request);
    if (!created.ok) return { status: 'rejected', code: created.code };
    const identity: WriteProposalRevision = {
      proposalId: created.proposalId,
      sessionId: request.binding.sessionId,
      projectId: request.binding.projectId,
      runId: request.runId,
      revision: request.revision,
      webContentsId: request.binding.webContentsId,
      windowEpoch: request.binding.windowEpoch,
      previewRevision: created.previewRevision,
    };
    const permission = this.dependencies.permissions.get(
      request.binding.sessionId,
      request.binding.projectId,
      request.binding,
    );
    let applied = false;
    let failureCode: WriteIpcErrorCode | null = null;
    if (permission?.mode === 'auto_review') {
      // The reviewed revision and its apply report stay retrievable; only the
      // per-change confirmation is skipped, exactly as the P4-D1 decision says.
      const result = await this.serialize(() => this.applyInternal(identity));
      applied = result.ok;
      failureCode = result.ok ? null : result.code;
    }
    return {
      status: 'accepted',
      proposalId: created.proposalId,
      applied,
      failureCode,
    };
  }

  async apply(identity: WriteProposalRevision): Promise<ApplyControllerResult> {
    return this.serialize(() => this.applyInternal(identity));
  }

  private async applyInternal(
    identity: WriteProposalRevision,
  ): Promise<ApplyControllerResult> {
    if (this.revisionAdvanced(identity)) {
      this.dependencies.proposals.expire(identity);
      return { ok: false, code: 'PREVIEW_EXPIRED', report: null };
    }
    const snapshot = this.dependencies.proposals.resolveForAction(identity);
    if (!snapshot.ok) return { ok: false, code: snapshot.code, report: null };

    const permission = this.dependencies.permissions.get(
      identity.sessionId,
      identity.projectId,
      {
        webContentsId: identity.webContentsId,
        windowEpoch: identity.windowEpoch,
      },
    );
    if (permission === null) {
      // No mode has been chosen for this session yet; the proposal stays
      // pending so the user can pick one and ask again.
      return { ok: false, code: 'PERMISSION_REQUIRED', report: null };
    }

    const project = await this.dependencies.resolveProject(identity.projectId);
    if (project === null) {
      return { ok: false, code: 'PROJECT_UNAVAILABLE', report: null };
    }

    const targets: WriteTarget[] = snapshot.preview.targets.map((target) => ({
      path: target.path,
      before: target.before,
      after: target.after,
      identity: target.identity,
    }));
    const result = await applyWriteBatch({
      projectRoot: project.root,
      runId: identity.runId,
      revision: identity.revision,
      targets,
      contents: snapshot.contents,
      permission,
      journal: this.dependencies.journal,
      now: this.dependencies.now,
    });

    const reportFor = (): WriteApplyReport => ({
      proposalId: identity.proposalId,
      sessionId: identity.sessionId,
      projectId: identity.projectId,
      runId: identity.runId,
      revision: identity.revision,
      previewRevision: identity.previewRevision,
      appliedAt: this.now(),
      outcomes: result.report.outcomes,
      applied: result.report.applied,
      partial: result.report.partial,
      failure: result.report.failure,
    });

    const report = reportFor();
    // Keep the report attached to the preview even when the apply was refused,
    // so auto_review's outcome is not lost when no one clicked approve.
    this.dependencies.proposals.setReport(identity, report);

    switch (result.status) {
      case 'applied': {
        this.dependencies.proposals.markState(identity, 'applied', report);
        return { ok: true, report };
      }
      case 'denied':
        // Nothing was written; the preview stays pending so the user can
        // refresh it after a target change or pick another permission.
        return { ok: false, code: result.code, report };
      case 'journal-unavailable':
        this.dependencies.proposals.markState(identity, 'failed', report);
        return {
          ok: false,
          code: 'WRITE_JOURNAL_UNAVAILABLE',
          report,
        };
      case 'failed':
        this.dependencies.proposals.markState(identity, 'failed', report);
        return { ok: false, code: result.code, report };
    }
  }

  /** Window/renderer gone: drop the permission and the previews bound to it. */
  forgetWindow(webContentsId: number): void {
    this.dependencies.permissions.forgetWindow(webContentsId);
    this.dependencies.proposals.forgetWindow(webContentsId);
  }
}

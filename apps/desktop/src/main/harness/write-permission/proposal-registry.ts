import { randomBytes } from 'node:crypto';

import {
  WRITE_LIMITS,
  WriteTargetPathSchema,
  type WriteFileIdentity,
  type WriteFileState,
} from '../../../shared/contracts/write-permission';
import {
  WRITE_PREVIEW_LIMITS,
  WritePreviewSchema,
  type WriteApplyReport,
  type WritePreview,
  type WritePreviewState,
  type WritePreviewSummary,
  type WriteProposalRejectionCode,
  type WriteProposalViewBinding,
} from '../../../shared/contracts/write-preview';
import { BoundedReadError, readStableFile } from '../bounded-read';
import { checkReadOnlyToolRequest } from '../read-only-tool-policy';
import { platformFileIdentity } from './observe-targets';
import { sha256OfBytes } from './file-state';
import { buildUnifiedDiff } from './unified-diff';

/**
 * P4-A (#19) proposal registry: main's memory of what a run asked to write.
 *
 * A proposal is created only from bytes main read itself plus the exact
 * post-image the adapter proposed. The registry never writes; it stores the
 * reviewed revision and hands main a snapshot for the executor. Re-reading a
 * target (`refresh`) produces a new `previewRevision`, so an approval that was
 * given for older bytes can never be applied.
 */

export interface WriteProposalIdentity extends WriteProposalViewBinding {
  proposalId: string;
  runId: string;
  revision: number;
}

export interface WriteProposalRevision extends WriteProposalIdentity {
  previewRevision: number;
}

export interface ProposeWriteRequest {
  binding: WriteProposalViewBinding;
  runId: string;
  revision: number;
  projectRoot: string;
  path: string;
  content: string;
  createdAt?: string;
}

export type ProposeWriteResult =
  | { ok: true; proposalId: string; previewRevision: number }
  | { ok: false; code: WriteProposalRejectionCode };

export type ProposalLookup =
  | {
      ok: true;
      preview: WritePreview;
      state: WritePreviewState;
      /** Last apply attempt, including the one auto_review performed. */
      report: WriteApplyReport | null;
    }
  | { ok: false; code: 'PROPOSAL_NOT_FOUND' };

export type ProposalActionSnapshot =
  | {
      ok: true;
      preview: WritePreview;
      contents: ReadonlyMap<string, Buffer>;
    }
  | {
      ok: false;
      code:
        'PROPOSAL_NOT_FOUND' | 'PREVIEW_EXPIRED' | 'PREVIEW_ALREADY_RESOLVED';
    };

export type RefreshProposalResult =
  | { ok: true; preview: WritePreview }
  | {
      ok: false;
      code:
        | 'PROPOSAL_NOT_FOUND'
        | 'PREVIEW_ALREADY_RESOLVED'
        | 'PREVIEW_EXPIRED'
        | 'INVALID_REQUEST';
    };

type TextTargetRead =
  | {
      ok: true;
      state: WriteFileState;
      identity: WriteFileIdentity | null;
      text: string;
      bytes: Buffer;
    }
  | { ok: false; code: WriteProposalRejectionCode };

interface StoredProposal {
  /** Owner fields without the proposal id, which is the map key. */
  binding: WriteProposalViewBinding & {
    runId: string;
    revision: number;
  };
  /** Root main resolved when the proposal was created; refresh uses it again. */
  projectRoot: string;
  preview: WritePreview;
  contents: Map<string, Buffer>;
  state: WritePreviewState;
  retainedBytes: number;
  /** Last apply report, so auto_review's result is retrievable from the panel. */
  report: WriteApplyReport | null;
}

function rejectionForReadOnly(code: string): WriteProposalRejectionCode {
  switch (code) {
    case 'INVALID_PATH':
      return 'INVALID_TARGET';
    case 'PATH_UNAVAILABLE':
      return 'TARGET_MISSING';
    case 'LINK_NOT_ALLOWED':
      return 'TARGET_LINK_NOT_ALLOWED';
    case 'PATH_TYPE_NOT_ALLOWED':
      return 'TARGET_NOT_REGULAR_FILE';
    case 'PROJECT_UNAVAILABLE':
    case 'PATH_OUTSIDE_PROJECT':
    case 'SENSITIVE_PATH':
    case 'INVALID_TOOL_REQUEST':
    case 'TOOL_NOT_ALLOWED':
      return 'TARGET_UNREADABLE';
    default:
      return 'TARGET_UNREADABLE';
  }
}

function rejectionForBoundedRead(
  code: BoundedReadError['code'],
): WriteProposalRejectionCode {
  switch (code) {
    case 'NOT_REGULAR_FILE':
      return 'TARGET_NOT_REGULAR_FILE';
    case 'LINK_NOT_ALLOWED':
      return 'TARGET_LINK_NOT_ALLOWED';
    case 'TOO_LARGE':
      return 'TARGET_TOO_LARGE';
    case 'UNSTABLE':
      return 'TARGET_UNSTABLE';
  }
}

/**
 * Reads the target exactly as the proposal needs it: a regular, single-link,
 * non-sensitive project file that is valid UTF-8 and no larger than the write
 * budget. Protected paths are deliberately not read here; `full_access` widens
 * the later observation and apply, while the first slice never proposes `.git`.
 */
async function readTextTarget(
  projectRoot: string,
  path: string,
): Promise<TextTargetRead> {
  if (!WriteTargetPathSchema.safeParse(path).success) {
    return { ok: false, code: 'INVALID_TARGET' };
  }
  const preflight = await checkReadOnlyToolRequest(projectRoot, {
    tool: 'read_file',
    arguments: { path },
  });
  if (!preflight.ok) {
    return { ok: false, code: rejectionForReadOnly(preflight.error.code) };
  }
  let read;
  try {
    read = await readStableFile(
      preflight.value.absolutePath,
      WRITE_LIMITS.targetBytes,
    );
  } catch (error) {
    return {
      ok: false,
      code:
        error instanceof BoundedReadError
          ? rejectionForBoundedRead(error.code)
          : 'TARGET_UNREADABLE',
    };
  }
  const bytes = read.buffer.subarray(0, read.bytesRead);
  let text: string;
  try {
    // keepBOM: a leading BOM is content, not metadata; dropping it would make
    // the reviewed diff disagree with the bytes written back.
    text = new TextDecoder('utf-8', {
      fatal: true,
      ignoreBOM: true,
    }).decode(bytes);
  } catch {
    return { ok: false, code: 'TARGET_NOT_TEXT' };
  }
  if (!Buffer.from(text, 'utf-8').equals(bytes)) {
    return { ok: false, code: 'TARGET_NOT_TEXT' };
  }
  return {
    ok: true,
    state: {
      kind: 'file',
      bytes: read.bytesRead,
      sha256: sha256OfBytes(bytes),
    },
    identity: platformFileIdentity(read.before),
    text,
    bytes: Buffer.from(bytes),
  };
}

function defaultProposalId(): string {
  return `proposal:${randomBytes(16).toString('hex')}`;
}

/**
 * In-memory, window-scoped proposal table. Everything is bounded: proposals per
 * run, retained proposals and total bytes. Resolved proposals are evicted before
 * any pending one, and a proposal that no longer fits is refused instead of
 * silently dropping another review.
 */
export class WriteProposalRegistry {
  private readonly proposals = new Map<string, StoredProposal>();
  private readonly now: () => string;
  private readonly makeId: () => string;
  private readonly maxRetained: number;
  private readonly maxBytes: number;

  constructor(
    options: {
      now?: () => string;
      randomId?: () => string;
      maxRetained?: number;
      maxBytes?: number;
    } = {},
  ) {
    this.now = options.now ?? ((): string => new Date().toISOString());
    this.makeId = options.randomId ?? defaultProposalId;
    this.maxRetained =
      options.maxRetained ?? WRITE_PREVIEW_LIMITS.retainedProposals;
    this.maxBytes = options.maxBytes ?? WRITE_PREVIEW_LIMITS.retainedBytes;
  }

  private retainedBytes(): number {
    let total = 0;
    for (const proposal of this.proposals.values()) {
      total += proposal.retainedBytes;
    }
    return total;
  }

  /**
   * Drops resolved proposals until the incoming proposal fits or only pending
   * ones remain. Evicting before every acceptance is what keeps a long session
   * from rejecting the 33rd proposal while 32 resolved previews sit in memory.
   */
  private evictResolved(incomingBytes: number): void {
    while (
      this.proposals.size >= this.maxRetained ||
      this.retainedBytes() + incomingBytes > this.maxBytes
    ) {
      let victim: string | null = null;
      for (const [id, proposal] of this.proposals) {
        if (proposal.state === 'pending') continue;
        victim = id;
        break;
      }
      if (victim === null) return;
      this.proposals.delete(victim);
    }
  }

  private proposalsForRun(request: ProposeWriteRequest): StoredProposal[] {
    const matches: StoredProposal[] = [];
    for (const proposal of this.proposals.values()) {
      if (
        proposal.binding.sessionId === request.binding.sessionId &&
        proposal.binding.projectId === request.binding.projectId &&
        proposal.binding.runId === request.runId &&
        proposal.binding.revision === request.revision
      ) {
        matches.push(proposal);
      }
    }
    return matches;
  }

  private bindingMatches(
    proposal: StoredProposal,
    identity: WriteProposalIdentity,
  ): boolean {
    return (
      proposal.binding.sessionId === identity.sessionId &&
      proposal.binding.projectId === identity.projectId &&
      proposal.binding.runId === identity.runId &&
      proposal.binding.revision === identity.revision &&
      proposal.binding.webContentsId === identity.webContentsId &&
      proposal.binding.windowEpoch === identity.windowEpoch
    );
  }

  /**
   * Creates a pending preview from a run's proposal. The caller supplies the
   * project root (main state) and the proposed content; the pre-image, its
   * identity and the diff all come from main's own reads.
   */
  async propose(request: ProposeWriteRequest): Promise<ProposeWriteResult> {
    if (!WriteTargetPathSchema.safeParse(request.path).success) {
      return { ok: false, code: 'INVALID_TARGET' };
    }
    const path = request.path;
    const beforeRead = await readTextTarget(request.projectRoot, path);
    if (!beforeRead.ok) return { ok: false, code: beforeRead.code };

    const afterBytes = Buffer.from(request.content, 'utf-8');
    if (afterBytes.byteLength > WRITE_LIMITS.targetBytes) {
      return { ok: false, code: 'TARGET_TOO_LARGE' };
    }
    const after: WriteFileState = {
      kind: 'file',
      bytes: afterBytes.byteLength,
      sha256: sha256OfBytes(afterBytes),
    };
    if (
      beforeRead.state.bytes === after.bytes &&
      beforeRead.state.sha256 === after.sha256
    ) {
      return { ok: false, code: 'NO_CHANGE' };
    }

    const existing = this.proposalsForRun(request);
    if (existing.length >= WRITE_PREVIEW_LIMITS.proposalsPerRun) {
      return { ok: false, code: 'PROPOSAL_LIMIT' };
    }
    // One proposal per path per run keeps the #18 change journal unambiguous:
    // its last-record lookup assumes one write chain per run and path.
    const folded = path.toLowerCase();
    if (
      existing.some(
        (proposal) =>
          proposal.preview.targets[0]?.path.toLowerCase() === folded,
      )
    ) {
      return { ok: false, code: 'DUPLICATE_TARGET' };
    }

    const diff = buildUnifiedDiff(path, beforeRead.text, request.content, {
      maxBytes: WRITE_PREVIEW_LIMITS.previewBytes,
    });
    if (diff === null) return { ok: false, code: 'DIFF_TOO_LARGE' };

    const proposalId = this.makeId();
    const preview = WritePreviewSchema.parse({
      version: 1,
      proposalId,
      sessionId: request.binding.sessionId,
      projectId: request.binding.projectId,
      runId: request.runId,
      revision: request.revision,
      previewRevision: 1,
      createdAt: request.createdAt ?? this.now(),
      targets: [
        {
          path,
          before: beforeRead.state,
          after,
          identity: beforeRead.identity,
          diff: diff.text,
        },
      ],
    });
    const retainedBytes =
      beforeRead.state.bytes +
      after.bytes +
      Buffer.byteLength(diff.text, 'utf-8');
    this.evictResolved(retainedBytes);
    if (
      this.proposals.size >= this.maxRetained ||
      this.retainedBytes() + retainedBytes > this.maxBytes
    ) {
      return { ok: false, code: 'PROPOSAL_LIMIT' };
    }
    this.proposals.set(proposalId, {
      binding: {
        sessionId: request.binding.sessionId,
        projectId: request.binding.projectId,
        runId: request.runId,
        revision: request.revision,
        webContentsId: request.binding.webContentsId,
        windowEpoch: request.binding.windowEpoch,
      },
      projectRoot: request.projectRoot,
      preview,
      contents: new Map([[path, afterBytes]]),
      state: 'pending',
      retainedBytes,
      report: null,
    });
    return { ok: true, proposalId, previewRevision: 1 };
  }

  /** Summaries for one window and session; the diff is fetched separately. */
  list(binding: WriteProposalViewBinding): WritePreviewSummary[] {
    const summaries: WritePreviewSummary[] = [];
    for (const [proposalId, proposal] of this.proposals) {
      if (
        proposal.binding.sessionId !== binding.sessionId ||
        proposal.binding.projectId !== binding.projectId ||
        proposal.binding.webContentsId !== binding.webContentsId ||
        proposal.binding.windowEpoch !== binding.windowEpoch
      ) {
        continue;
      }
      summaries.push({
        proposalId,
        runId: proposal.binding.runId,
        revision: proposal.binding.revision,
        previewRevision: proposal.preview.previewRevision,
        createdAt: proposal.preview.createdAt,
        state: proposal.state,
        paths: proposal.preview.targets.map((target) => target.path),
      });
    }
    return summaries.reverse();
  }

  /** Full preview for one proposal; a mismatched binding is not found. */
  get(identity: WriteProposalIdentity): ProposalLookup {
    const stored = this.proposals.get(identity.proposalId);
    if (stored === undefined) return { ok: false, code: 'PROPOSAL_NOT_FOUND' };
    if (!this.bindingMatches(stored, identity)) {
      return { ok: false, code: 'PROPOSAL_NOT_FOUND' };
    }
    return {
      ok: true,
      preview: structuredClone(stored.preview),
      state: stored.state,
      report: stored.report === null ? null : structuredClone(stored.report),
    };
  }

  /**
   * Re-reads every target and rebuilds the reviewed revision. A successful
   * refresh always bumps `previewRevision`; an earlier approval is then expired.
   */
  async refresh(
    identity: WriteProposalIdentity,
  ): Promise<RefreshProposalResult> {
    const stored = this.proposals.get(identity.proposalId);
    if (stored === undefined || !this.bindingMatches(stored, identity)) {
      return { ok: false, code: 'PROPOSAL_NOT_FOUND' };
    }
    if (stored.state !== 'pending') {
      return { ok: false, code: 'PREVIEW_ALREADY_RESOLVED' };
    }
    const targets: WritePreview['targets'] = [];
    for (const target of stored.preview.targets) {
      const content = stored.contents.get(target.path);
      if (content === undefined) {
        stored.state = 'expired';
        return { ok: false, code: 'PREVIEW_EXPIRED' };
      }
      const current = await readTextTarget(stored.projectRoot, target.path);
      if (!current.ok) {
        stored.state = 'expired';
        return { ok: false, code: 'PREVIEW_EXPIRED' };
      }
      const diff = buildUnifiedDiff(
        target.path,
        current.text,
        content.toString('utf-8'),
        { maxBytes: WRITE_PREVIEW_LIMITS.previewBytes },
      );
      if (diff === null) {
        stored.state = 'expired';
        return { ok: false, code: 'PREVIEW_EXPIRED' };
      }
      targets.push({
        path: target.path,
        before: current.state,
        after: target.after,
        identity: current.identity,
        diff: diff.text,
      });
    }
    const nextPreview = WritePreviewSchema.parse({
      ...stored.preview,
      previewRevision: stored.preview.previewRevision + 1,
      targets,
    });
    const refreshedBytes = targets.reduce(
      (total, target) =>
        total +
        target.before.bytes +
        target.after.bytes +
        Buffer.byteLength(target.diff, 'utf-8'),
      0,
    );
    const delta = refreshedBytes - stored.retainedBytes;
    if (delta > 0) this.evictResolved(delta);
    const totalBytes =
      this.retainedBytes() - stored.retainedBytes + refreshedBytes;
    if (totalBytes > this.maxBytes) {
      // Do not commit the new preview: committing it while keeping the old
      // byte count would let later proposals exceed the retained budget.
      stored.state = 'expired';
      return { ok: false, code: 'PREVIEW_EXPIRED' };
    }
    stored.preview = nextPreview;
    stored.retainedBytes = refreshedBytes;
    stored.report = null;
    return { ok: true, preview: structuredClone(stored.preview) };
  }

  /**
   * Main-only snapshot for an apply/reject. The caller passes the exact
   * `previewRevision` it displayed; a stale or already resolved proposal is
   * refused before any filesystem access.
   */
  resolveForAction(identity: WriteProposalRevision): ProposalActionSnapshot {
    const stored = this.proposals.get(identity.proposalId);
    if (stored === undefined || !this.bindingMatches(stored, identity)) {
      return { ok: false, code: 'PROPOSAL_NOT_FOUND' };
    }
    if (stored.preview.previewRevision !== identity.previewRevision) {
      return { ok: false, code: 'PREVIEW_EXPIRED' };
    }
    if (stored.state !== 'pending') {
      return { ok: false, code: 'PREVIEW_ALREADY_RESOLVED' };
    }
    return {
      ok: true,
      preview: structuredClone(stored.preview),
      contents: new Map(stored.contents),
    };
  }

  /** Records the final state after an apply/reject; an authoritative no-op replay. */
  markState(
    identity: WriteProposalRevision,
    state: WritePreviewState,
    report?: WriteApplyReport | null,
  ): boolean {
    const stored = this.proposals.get(identity.proposalId);
    if (stored === undefined || !this.bindingMatches(stored, identity)) {
      return false;
    }
    if (stored.state !== 'pending') return false;
    stored.state = state;
    if (report !== undefined && report !== null) stored.report = report;
    return true;
  }

  /** Stores an apply report even when the preview stays pending (auto-review refused). */
  setReport(identity: WriteProposalIdentity, report: WriteApplyReport): void {
    const stored = this.proposals.get(identity.proposalId);
    if (stored === undefined || !this.bindingMatches(stored, identity)) return;
    stored.report = report;
  }

  /** A newer run (or a vanished project) makes a pending preview unusable. */
  expire(identity: WriteProposalIdentity): void {
    const stored = this.proposals.get(identity.proposalId);
    if (stored === undefined || !this.bindingMatches(stored, identity)) return;
    if (stored.state === 'pending') stored.state = 'expired';
  }

  /** Window gone: pending previews can no longer be applied anywhere. */
  forgetWindow(webContentsId: number): void {
    for (const [proposalId, proposal] of this.proposals) {
      if (proposal.binding.webContentsId === webContentsId) {
        this.proposals.delete(proposalId);
      }
    }
  }
}

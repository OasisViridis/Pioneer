/** Decision probe only: the production registry and authorization UI belong to #13. */
import {
  RunStartRequestSchema,
  type RunStartRequest,
} from '../../apps/desktop/src/shared/contracts/pioneer-run';

export interface ProbeBinding {
  sessionId: string;
  projectId: string;
  windowId: number;
  windowEpoch: number;
  revision: number;
  rootRevision: number;
}

export interface ProbeGrant {
  id: string;
  binding: ProbeBinding;
  expiresAt: number;
  execution: boolean;
  model: boolean;
  egress: boolean;
  revoked: boolean;
}

export class RunLaunchProbe {
  private readonly receipts = new Map<
    string,
    { request: RunStartRequest; runId: string }
  >();
  private readonly consumed = new Set<string>();
  private active = false;
  private serial = 0;

  constructor(
    public binding: ProbeBinding,
    private readonly grants: ProbeGrant[],
  ) {}

  launch(
    input: unknown,
    caller: { windowId: number; windowEpoch: number; trusted: boolean },
    now: number,
  ): { ok: true; runId: string } | { ok: false; code: string } {
    const reject = (code: string) => ({ ok: false as const, code });
    if (
      !caller.trusted ||
      caller.windowId !== this.binding.windowId ||
      caller.windowEpoch !== this.binding.windowEpoch
    )
      return reject('UNTRUSTED_SENDER');
    const parsed = RunStartRequestSchema.safeParse(input);
    if (!parsed.success) return reject('INVALID_REQUEST');
    const request = parsed.data;
    if (
      request.sessionId !== this.binding.sessionId ||
      request.projectId !== this.binding.projectId
    )
      return reject('BINDING_MISMATCH');
    if (request.expectedRevision !== this.binding.revision)
      return reject('STALE_REVISION');
    const previous = this.receipts.get(request.requestId);
    if (previous)
      return JSON.stringify(previous.request) === JSON.stringify(request)
        ? { ok: true, runId: previous.runId }
        : reject('REQUEST_CONFLICT');
    const grant = this.grants.find(
      (candidate) => candidate.id === request.grantId,
    );
    if (
      !grant ||
      grant.revoked ||
      grant.expiresAt <= now ||
      this.consumed.has(grant.id) ||
      !grant.execution ||
      !grant.model ||
      !grant.egress ||
      (Object.keys(this.binding) as (keyof ProbeBinding)[]).some(
        (key) => grant.binding[key] !== this.binding[key],
      )
    )
      return reject('AUTHORIZATION_REQUIRED');
    if (this.active) return reject('RUN_ACTIVE');
    this.active = true;
    this.consumed.add(grant.id);
    const runId = `run:${++this.serial}`;
    this.receipts.set(request.requestId, { request, runId });
    return { ok: true, runId };
  }

  settle(status: 'unknown' | 'completed' | 'failed' | 'stopped'): void {
    if (status !== 'unknown') this.active = false;
  }
}

/** Isolated executable protocol model, never imported by application code.
 * It uses real promises and AbortSignal, but has no Pi, provider, IPC or file IO.
 */
import {
  RUN_LIMITS,
  RunEventSchema,
  RunIdentitySchema,
  type RunEvent,
  type RunEventBody,
  type RunIdentity,
  type RunStatus,
  type RunFailureCode,
} from '../../apps/desktop/src/shared/contracts/pioneer-run';

type Outcome =
  { status: 'completed' } | { status: 'failed'; code: RunFailureCode };

export class RunProtocolProbe {
  readonly identity: RunIdentity;
  readonly abort = new AbortController();
  status: RunStatus = 'starting';
  private sequence = 0;
  private buffer: RunEvent[] = [];
  private bytes = 0;
  private outputBytes = 0;
  private pending = 0;
  private calls = 0;
  private activeCall: string | null = null;
  private outcome: Outcome | null = null;
  private stopRequested = false;
  private sealed = false;
  private terminalEmitted = false;
  private settledWaiters: (() => void)[] = [];

  constructor(identity: RunIdentity) {
    this.identity = Object.freeze(RunIdentitySchema.parse(identity));
    this.emit({ type: 'run.accepted' });
  }

  private emit(body: RunEventBody): void {
    if (this.terminalEmitted) return;
    const event = RunEventSchema.parse({
      ...this.identity,
      version: 1,
      seq: ++this.sequence,
      at: new Date().toISOString(),
      adapter: 'controlled',
      source:
        body.type === 'text.delta'
          ? 'model'
          : body.type.startsWith('tool.')
            ? 'tool'
            : 'host',
      body,
    });
    const size = Buffer.byteLength(JSON.stringify(event));
    this.buffer.push(event);
    this.bytes += size;
    while (
      this.buffer.length > RUN_LIMITS.retainedEvents ||
      this.bytes > RUN_LIMITS.retainedBytes
    ) {
      const removed = this.buffer.shift();
      if (removed) this.bytes -= Buffer.byteLength(JSON.stringify(removed));
    }
  }

  events(): RunEvent[] {
    return structuredClone(this.buffer);
  }

  read(afterSeq: number): {
    gap: boolean;
    status: RunStatus;
    lastSeq: number;
    events: RunEvent[];
  } {
    const first = this.buffer[0]?.seq ?? this.sequence + 1;
    return {
      gap: afterSeq < first - 1 || afterSeq > this.sequence,
      status: this.status,
      lastSeq: this.sequence,
      events: this.events().filter((event) => event.seq > afterSeq),
    };
  }

  start(model: Promise<void>): boolean {
    if (this.status !== 'starting' || this.stopRequested || this.sealed)
      return false;
    this.status = 'running';
    this.emit({ type: 'run.started' });
    this.track(model);
    return true;
  }

  private track(
    resource: Promise<void>,
    onSettled?: (failed: boolean) => void,
  ): void {
    this.pending++;
    void resource.then(
      () => this.resourceSettled(false, onSettled),
      () => this.resourceSettled(true, onSettled),
    );
  }

  private resourceSettled(
    failed: boolean,
    callback?: (failed: boolean) => void,
  ): void {
    this.pending--;
    callback?.(failed);
    if (failed && !this.stopRequested && !callback)
      this.outcome = { status: 'failed', code: 'MODEL_FAILED' };
    if (failed && !this.stopRequested) this.requestStop('host_failure');
    this.finishIfQuiescent();
  }

  text(text: string): boolean {
    if (this.status !== 'running' || this.sealed) return false;
    const size = Buffer.byteLength(text);
    if (
      size > RUN_LIMITS.textChunkBytes ||
      this.outputBytes + size > RUN_LIMITS.outputBytes
    ) {
      this.outcome = { status: 'failed', code: 'OUTPUT_LIMIT' };
      this.requestStop('host_failure');
      return false;
    }
    this.outputBytes += size;
    this.emit({ type: 'text.delta', text });
    return true;
  }

  tool(resource: Promise<void>): string | null {
    if (
      this.status !== 'running' ||
      this.sealed ||
      this.activeCall !== null ||
      this.calls >= RUN_LIMITS.toolCalls
    )
      return null;
    const callId = `call:${++this.calls}`;
    this.activeCall = callId;
    this.emit({ type: 'tool.requested', callId, tool: 'read_file' });
    this.track(resource, (failed) => {
      this.activeCall = null;
      this.emit({
        type: 'tool.result',
        callId,
        result: this.stopRequested
          ? { status: 'cancelled', code: 'CANCELLED' }
          : failed
            ? { status: 'failed', code: 'TOOL_FAILED' }
            : {
                status: 'succeeded',
                text: 'synthetic fixture result',
                truncated: false,
              },
      });
      if (failed && !this.stopRequested)
        this.outcome = { status: 'failed', code: 'TOOL_FAILED' };
    });
    return callId;
  }

  rejectTool(): void {
    if (this.status !== 'running' || this.sealed) return;
    if (this.calls >= RUN_LIMITS.toolCalls) {
      this.complete({ status: 'failed', code: 'TOOL_FAILED' });
      return;
    }
    const callId = `call:${++this.calls}`;
    this.emit({ type: 'tool.requested', callId, tool: null });
    this.emit({
      type: 'tool.result',
      callId,
      result: { status: 'rejected', code: 'TOOL_NOT_ALLOWED' },
    });
  }

  complete(outcome: Outcome = { status: 'completed' }): void {
    if (this.sealed || this.terminal()) return;
    this.sealed = true;
    // A successful adapter callback cannot erase an observed resource failure.
    if (this.outcome?.status !== 'failed') this.outcome = outcome;
    this.finishIfQuiescent();
  }

  requestStop(
    reason:
      | 'user'
      | 'window_closed'
      | 'deadline'
      | 'authorization_revoked'
      | 'host_failure' = 'user',
  ): boolean {
    if (this.terminal() || this.stopRequested) return false;
    this.stopRequested = true;
    this.sealed = true;
    if (reason === 'deadline' || reason === 'authorization_revoked') {
      this.outcome = {
        status: 'failed',
        code: reason === 'deadline' ? 'RUN_DEADLINE' : 'AUTHORIZATION_REVOKED',
      };
    }
    this.status = 'stopping';
    this.emit({ type: 'run.stop_requested', reason });
    this.abort.abort();
    this.finishIfQuiescent();
    return true;
  }

  /** Host-side force termination after the stop grace expires. The stop path
   * only ever converges to stopped or failed; a stuck teardown never lingers
   * as a live unknown state. Pending resources are force-disposed by the host
   * and their late settlement must not emit further events.
   */
  forceEnd(code: RunFailureCode): boolean {
    if (this.terminal() || !this.stopRequested) return false;
    this.sealed = true;
    this.status = 'failed';
    this.emit({ type: 'run.failed', code });
    this.terminalEmitted = true;
    for (const resolve of this.settledWaiters) resolve();
    this.settledWaiters = [];
    return true;
  }

  private finishIfQuiescent(): void {
    if (this.terminal() || this.pending !== 0) return;
    if (this.stopRequested) {
      this.status = this.outcome?.status === 'failed' ? 'failed' : 'stopped';
      this.emit(
        this.outcome?.status === 'failed'
          ? { type: 'run.failed', code: this.outcome.code }
          : { type: 'run.stopped' },
      );
    } else if (this.outcome) {
      this.status = this.outcome.status;
      this.emit(
        this.outcome.status === 'failed'
          ? { type: 'run.failed', code: this.outcome.code }
          : { type: 'run.completed', usage: null },
      );
    } else return;
    this.terminalEmitted = true;
    for (const resolve of this.settledWaiters) resolve();
    this.settledWaiters = [];
  }

  terminal(): boolean {
    return ['completed', 'failed', 'stopped'].includes(this.status);
  }

  waitForTerminal(): Promise<void> {
    return this.terminal()
      ? Promise.resolve()
      : new Promise((resolve) => this.settledWaiters.push(resolve));
  }
}

export function restoreRun(identity: RunIdentity): {
  identity: RunIdentity;
  status: 'unknown';
  canResume: false;
  grants: [];
} {
  return {
    identity: RunIdentitySchema.parse(identity),
    status: 'unknown',
    canResume: false,
    grants: [],
  };
}

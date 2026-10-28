import { z } from 'zod';

/**
 * Bounded, atomically written run journal in userData (run contract §4).
 * Accept records must be durable before adapter start; terminal records are
 * durable before the run slot is released. Any accepted run without a
 * committed terminal record is marked unknown/host_restarted at startup.
 */

const id = z.string().min(1).max(512);
const at = z.iso.datetime();

export const RunJournalAcceptSchema = z
  .object({
    kind: z.literal('accept'),
    runId: id,
    sessionId: id,
    projectId: id,
    revision: z.number().int().positive(),
    taskDigest: z.string().min(1).max(512),
    adapter: z.enum(['controlled', 'pi']),
    windowEpoch: z.number().int().nonnegative(),
    rootRevision: z.number().int().nonnegative(),
    requestId: id,
    at,
  })
  .strict();

export const RunJournalTerminalSchema = z
  .object({
    kind: z.literal('terminal'),
    runId: id,
    status: z.enum(['completed', 'failed', 'stopped']),
    code: z.string().max(64).nullable(),
    at,
    lastSeq: z.number().int().nonnegative(),
    /** Main-side wall-clock stamp of the first stop request, when one occurred. */
    stopRequestedAt: at.nullable().optional(),
  })
  .strict();

export const RunJournalTombstoneSchema = z
  .object({
    kind: z.literal('tombstone'),
    runId: id,
    reason: z.literal('host_restarted'),
    at,
  })
  .strict();

export const RunJournalRecordSchema = z.discriminatedUnion('kind', [
  RunJournalAcceptSchema,
  RunJournalTerminalSchema,
  RunJournalTombstoneSchema,
]);

export type RunJournalRecord = z.infer<typeof RunJournalRecordSchema>;
export type RunJournalAccept = z.infer<typeof RunJournalAcceptSchema>;
export type RunJournalTerminal = z.infer<typeof RunJournalTerminalSchema>;

export interface RunJournalStore {
  load(): Promise<string | null>;
  save(content: string): Promise<void>;
}

export const JOURNAL_LIMITS = Object.freeze({
  records: 512,
  bytes: 262_144,
});

export interface JournalOutcome {
  ok: boolean;
  reason?: 'LOAD_FAILED';
}

/** Whole-file rewrite keeps every durable update atomic (temp write + rename). */
export class RunJournal {
  private records: RunJournalRecord[] = [];
  private healthy = true;
  private readonly store: RunJournalStore;

  private constructor(store: RunJournalStore) {
    this.store = store;
  }

  static async open(
    store: RunJournalStore,
  ): Promise<{ journal: RunJournal; outcome: JournalOutcome }> {
    const journal = new RunJournal(store);
    try {
      const raw = await store.load();
      if (raw !== null) {
        for (const line of raw.split('\n')) {
          const trimmed = line.trim();
          if (trimmed.length === 0) continue;
          const parsed = RunJournalRecordSchema.safeParse(JSON.parse(trimmed));
          if (!parsed.success) {
            // Unknown/corrupt lines are preserved on disk, never silently dropped here.
            journal.healthy = false;
            return { journal, outcome: { ok: false, reason: 'LOAD_FAILED' } };
          }
          journal.records.push(parsed.data);
        }
      }
    } catch {
      journal.healthy = false;
      return { journal, outcome: { ok: false, reason: 'LOAD_FAILED' } };
    }
    return { journal, outcome: { ok: true } };
  }

  /**
   * Accepted runs without a committed terminal become host_restarted
   * tombstones. Already-marked runs are returned as well: the in-memory
   * tombstone has to be rebuilt on every boot, not just the first boot after a
   * crash, otherwise a second restart makes the run unreachable again.
   */
  restorePending(): { restarted: RunJournalAccept[] } {
    const terminalIds = new Set(
      this.records
        .filter(
          (record): record is RunJournalTerminal => record.kind === 'terminal',
        )
        .map((record) => record.runId),
    );
    const alreadyMarked = new Set(
      this.records
        .filter(
          (record): record is z.infer<typeof RunJournalTombstoneSchema> =>
            record.kind === 'tombstone',
        )
        .map((record) => record.runId),
    );
    const restarted = this.records.filter(
      (record): record is RunJournalAccept =>
        record.kind === 'accept' && !terminalIds.has(record.runId),
    );
    let added = 0;
    for (const accept of restarted) {
      if (alreadyMarked.has(accept.runId)) continue;
      this.records.push({
        kind: 'tombstone',
        runId: accept.runId,
        reason: 'host_restarted',
        at: new Date().toISOString(),
      });
      added += 1;
    }
    if (added > 0) void this.persist();
    return { restarted };
  }

  isAvailable(): boolean {
    return this.healthy;
  }

  private bound(): void {
    while (this.records.length > JOURNAL_LIMITS.records) {
      this.records.shift();
    }
    while (JSON.stringify(this.records).length > JOURNAL_LIMITS.bytes) {
      this.records.shift();
    }
  }

  private async persist(): Promise<boolean> {
    this.bound();
    const content =
      this.records.map((record) => JSON.stringify(record)).join('\n') + '\n';
    try {
      await this.store.save(content);
      return true;
    } catch {
      this.healthy = false;
      return false;
    }
  }

  async appendAccept(record: RunJournalAccept): Promise<boolean> {
    if (!this.healthy) return false;
    this.records.push(RunJournalAcceptSchema.parse(record));
    return this.persist();
  }

  async appendTerminal(record: RunJournalTerminal): Promise<boolean> {
    if (!this.healthy) return false;
    this.records.push(RunJournalTerminalSchema.parse(record));
    return this.persist();
  }

  snapshot(): RunJournalRecord[] {
    return structuredClone(this.records);
  }
}

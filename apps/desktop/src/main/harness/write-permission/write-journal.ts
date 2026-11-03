import { mkdir, open, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  WriteChangeJournalRecordSchema,
  type WriteChangeJournalRecord,
} from '../../../shared/contracts/write-permission';

/**
 * P4-A (#19) durable change journal.
 *
 * It records what actually happened to a target, in order: `intent` before the
 * file is touched, then `applied` with the read-back result, `failed` for a
 * target that was not written, and `recovery` for a later restore. The write
 * path refuses to start when the journal is unavailable, so a write can never
 * happen without a durable intent record.
 */

export const WRITE_JOURNAL_LIMITS = Object.freeze({
  /** In-memory records kept after a restart; the file is append-only. */
  retainedRecords: 1_024,
});

export interface WriteJournalStore {
  load(): Promise<string | null>;
  append(line: string): Promise<void>;
}

export interface WriteJournalOutcome {
  ok: boolean;
  reason?: 'LOAD_FAILED';
}

/** Append-only JSONL file; each append is synced before it returns. */
export function createFileWriteJournalStore(
  userDataPath: string,
): WriteJournalStore {
  const file = join(userDataPath, 'writes', 'journal.jsonl');
  return {
    load: async () => {
      try {
        return await readFile(file, 'utf-8');
      } catch {
        return null;
      }
    },
    append: async (line: string) => {
      await mkdir(dirname(file), { recursive: true });
      const handle = await open(file, 'a');
      try {
        await handle.writeFile(line, 'utf-8');
        // The intent record must be durable before the target is touched.
        await handle.sync();
      } finally {
        await handle.close();
      }
    },
  };
}

export class WriteChangeJournal {
  private records: WriteChangeJournalRecord[] = [];
  private healthy = true;
  private readonly store: WriteJournalStore;

  private constructor(store: WriteJournalStore) {
    this.store = store;
  }

  /**
   * Loads the journal. A corrupt line marks the journal unhealthy instead of
   * silently dropping history: unlike the run journal there is no recovery
   * consumer yet (#20), so the safe action is to stop accepting writes.
   */
  static async open(
    store: WriteJournalStore,
  ): Promise<{ journal: WriteChangeJournal; outcome: WriteJournalOutcome }> {
    const journal = new WriteChangeJournal(store);
    try {
      const raw = await store.load();
      if (raw !== null) {
        for (const line of raw.split('\n')) {
          const trimmed = line.trim();
          if (trimmed.length === 0) continue;
          const parsed = WriteChangeJournalRecordSchema.safeParse(
            JSON.parse(trimmed),
          );
          if (!parsed.success) {
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
    journal.trim();
    return { journal, outcome: { ok: true } };
  }

  isAvailable(): boolean {
    return this.healthy;
  }

  private trim(): void {
    while (this.records.length > WRITE_JOURNAL_LIMITS.retainedRecords) {
      this.records.shift();
    }
  }

  async append(record: WriteChangeJournalRecord): Promise<boolean> {
    if (!this.healthy) return false;
    const parsed = WriteChangeJournalRecordSchema.parse(record);
    try {
      await this.store.append(`${JSON.stringify(parsed)}\n`);
    } catch {
      this.healthy = false;
      return false;
    }
    this.records.push(parsed);
    this.trim();
    return true;
  }

  snapshot(): WriteChangeJournalRecord[] {
    return structuredClone(this.records);
  }

  recordsFor(runId: string): WriteChangeJournalRecord[] {
    return structuredClone(
      this.records.filter((record) => record.runId === runId),
    );
  }
}

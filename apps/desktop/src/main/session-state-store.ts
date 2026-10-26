import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { SessionWorkspaceState } from '../shared/contracts/session-workspace';
import {
  MAX_SESSION_STATE_BYTES,
  SessionStateRecordSchema,
  SESSION_STATE_VERSION,
  loadRecord,
} from '../shared/session-state';
import type { SettingsStoreFs } from './settings-store';

export const SESSION_STATE_FILE_NAME = 'pioneer-session-state.json';

export interface SessionStateStore {
  load(): Promise<SessionWorkspaceState | null>;
  save(state: SessionWorkspaceState): Promise<void>;
  settled(): Promise<void>;
}

export class SessionStateStoreError extends Error {
  readonly code: 'READ_FAILED' | 'INVALID_STATE';

  constructor(
    code: 'READ_FAILED' | 'INVALID_STATE',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'SessionStateStoreError';
    this.code = code;
  }
}

const nodeSessionStateStoreFs: SettingsStoreFs = {
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
};

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}

/**
 * Keeps one strictly validated state record below Electron's userData directory.
 * Writes are serialized and use an adjacent temporary file so a failed replacement
 * cannot mutate the previous record.
 */
export function createSessionStateStore(
  userDataPath: string,
  fs: SettingsStoreFs = nodeSessionStateStoreFs,
): SessionStateStore {
  const statePath = join(userDataPath, SESSION_STATE_FILE_NAME);
  let writeQueue: Promise<void> = Promise.resolve();

  return {
    settled: () => writeQueue,
    async load(): Promise<SessionWorkspaceState | null> {
      await writeQueue;
      let contents: string;
      try {
        contents = await fs.readFile(statePath, 'utf8');
      } catch (error) {
        if (isMissingFileError(error)) return null;
        throw new SessionStateStoreError(
          'READ_FAILED',
          'Unable to read the Pioneer session state.',
          { cause: error },
        );
      }

      if (
        new TextEncoder().encode(contents).byteLength > MAX_SESSION_STATE_BYTES
      ) {
        throw new SessionStateStoreError(
          'INVALID_STATE',
          'Pioneer session state exceeds the permitted size.',
        );
      }

      try {
        const record = loadRecord(JSON.parse(contents));
        return record.state;
      } catch (error) {
        throw new SessionStateStoreError(
          'INVALID_STATE',
          'Pioneer session state is malformed or invalid.',
          { cause: error },
        );
      }
    },

    save(state: SessionWorkspaceState): Promise<void> {
      let contents: string;
      try {
        // Parse at enqueue time: callers cannot mutate an already accepted snapshot.
        const record = SessionStateRecordSchema.parse({
          version: SESSION_STATE_VERSION,
          state,
        });
        contents = JSON.stringify(record);
        if (
          new TextEncoder().encode(contents).byteLength >
          MAX_SESSION_STATE_BYTES
        ) {
          throw new SessionStateStoreError(
            'INVALID_STATE',
            'Pioneer session state exceeds the permitted size.',
          );
        }
      } catch (error) {
        if (error instanceof SessionStateStoreError)
          return Promise.reject(error);
        return Promise.reject(
          new SessionStateStoreError(
            'INVALID_STATE',
            'Pioneer session state is malformed or invalid.',
            { cause: error },
          ),
        );
      }

      const write = async (): Promise<void> => {
        await fs.mkdir(dirname(statePath), { recursive: true });
        const temporaryPath = join(
          userDataPath,
          `.${SESSION_STATE_FILE_NAME}.${randomUUID()}.tmp`,
        );
        try {
          await fs.writeFile(temporaryPath, contents, {
            encoding: 'utf8',
            flag: 'w',
          });
          await fs.rename(temporaryPath, statePath);
        } catch (error) {
          await fs.rm(temporaryPath, { force: true });
          throw error;
        }
      };

      const result = writeQueue.then(write, write);
      writeQueue = result.catch(() => undefined);
      return result;
    },
  };
}

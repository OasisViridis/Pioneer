import { z } from 'zod';
import type { SessionWorkspaceState } from './contracts/session-workspace';
import {
  MAX_SESSION_RUN_HISTORY,
  SessionRunRecordSchema,
} from './contracts/session-run-history';
import {
  DockLayoutSchema,
  LegacySessionSchema,
  LegacyStateObjectSchema,
  validateWorkspaceState,
  loadRecord as loadLegacyRecord,
} from './legacy-session-state';
export { MAX_SESSION_STATE_BYTES } from './legacy-session-state';
export const SESSION_STATE_VERSION = 6 as const;

const SessionWorkspaceFieldsSchema = LegacySessionSchema.omit({
  layout: true,
  dockLayouts: true,
  savedLayouts: true,
}).extend({
  dock: DockLayoutSchema,
  savedDock: DockLayoutSchema.nullable(),
  layoutHistory: LegacySessionSchema.pick({
    layout: true,
    dockLayouts: true,
    savedLayouts: true,
  }).nullable(),
});

const SessionSchema = SessionWorkspaceFieldsSchema.extend({
  runHistory: z.array(SessionRunRecordSchema).max(MAX_SESSION_RUN_HISTORY),
}).strict();
export const SessionStateSchema: z.ZodType<SessionWorkspaceState> =
  LegacyStateObjectSchema.extend({
    sessions: z.array(SessionSchema).max(10_000),
  }).superRefine(validateWorkspaceState);
export const SessionStateRecordSchema = z
  .object({
    version: z.literal(SESSION_STATE_VERSION),
    state: SessionStateSchema,
  })
  .strict();
export interface SessionStateRecord {
  version: typeof SESSION_STATE_VERSION;
  state: SessionWorkspaceState;
}

/**
 * v5 records predate the per-session run history. Loading one adds an empty
 * history; the source file is not rewritten until the user saves, so an old
 * record stays byte-identical on read.
 */
const V5SessionSchema = SessionWorkspaceFieldsSchema.strict();
const V5StateSchema = LegacyStateObjectSchema.extend({
  sessions: z.array(V5SessionSchema).max(10_000),
}).superRefine(validateWorkspaceState);
const V5RecordSchema = z
  .object({ version: z.literal(5), state: V5StateSchema })
  .strict();

function migrateV5(input: unknown): SessionStateRecord {
  const old = V5RecordSchema.parse(input);
  return SessionStateRecordSchema.parse({
    version: SESSION_STATE_VERSION,
    state: {
      ...old.state,
      sessions: old.state.sessions.map((session) => ({
        ...session,
        runHistory: [],
      })),
    },
  });
}

/**
 * v4 records still carry the removed intent workspace. Loading one drops that
 * field and returns current state; the source file is not rewritten until the
 * user saves, so an old record stays byte-identical on read.
 */
const V4SessionSchema = SessionWorkspaceFieldsSchema.extend({
  intentState: z.unknown().optional(),
}).strict();
const V4StateSchema = LegacyStateObjectSchema.extend({
  sessions: z.array(V4SessionSchema).max(10_000),
}).superRefine(validateWorkspaceState);
const V4RecordSchema = z
  .object({ version: z.literal(4), state: V4StateSchema })
  .strict();

function migrateV4(input: unknown): SessionStateRecord {
  const old = V4RecordSchema.parse(input);
  return SessionStateRecordSchema.parse({
    version: SESSION_STATE_VERSION,
    state: {
      ...old.state,
      sessions: old.state.sessions.map((session) => ({
        id: session.id,
        project: session.project,
        title: session.title,
        customTitle: session.customTitle,
        lastActivityAt: session.lastActivityAt,
        draft: session.draft,
        messages: session.messages,
        dock: session.dock,
        savedDock: session.savedDock,
        layoutHistory: session.layoutHistory,
        outputTab: session.outputTab,
        runHistory: [],
      })),
    },
  });
}

/** Loading is pure: unknown or corrupt records throw, never clear or rewrite the source. */
export function loadRecord(input: unknown): SessionStateRecord {
  if (typeof input !== 'object' || input === null || !('version' in input))
    throw new Error('Unsupported session state record.');
  if (input.version === SESSION_STATE_VERSION)
    return SessionStateRecordSchema.parse(input);
  if (input.version === 5) return migrateV5(input);
  if (input.version === 4) return migrateV4(input);
  const legacy = loadLegacyRecord(input);
  return SessionStateRecordSchema.parse({
    version: SESSION_STATE_VERSION,
    state: {
      ...legacy.state,
      sessions: legacy.state.sessions.map(
        ({ layout, dockLayouts, savedLayouts, ...session }) => ({
          ...session,
          dock: dockLayouts[layout],
          savedDock: savedLayouts[layout] ?? null,
          layoutHistory: { layout, dockLayouts, savedLayouts },
          runHistory: [],
        }),
      ),
    },
  });
}

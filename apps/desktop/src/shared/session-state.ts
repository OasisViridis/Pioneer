import { z } from 'zod';
import type { SessionWorkspaceState } from './contracts/session-workspace';
import {
  MAX_SESSION_RUN_HISTORY,
  SessionRunRecordSchema,
} from './contracts/session-run-history';
import { RunSnapshotSchema } from './contracts/run-context';
import { DOCK_PANELS, addRunlogPanel } from './docking';
import {
  LegacyDockLayoutSchema,
  LegacySessionSchema,
  LegacyStateObjectSchema,
  validateWorkspaceState,
  loadRecord as loadLegacyRecord,
} from './legacy-session-state';
export { MAX_SESSION_STATE_BYTES } from './legacy-session-state';

/** v7 adds the RunLog dock panel to every stored layout (Issue #17). */
export const SESSION_STATE_VERSION = 7 as const;

const weight = z
  .number()
  .refine(Number.isFinite, 'Weight must be finite.')
  .min(0.2)
  .max(8);

/**
 * Current layout schema: exactly the v7 panel set. v1–v6 records are parsed
 * with `LegacyDockLayoutSchema` and upgraded by `addRunlogPanel` on load.
 */
const DockLayoutSchema = z
  .object({
    columns: z.tuple([
      z.array(z.enum(DOCK_PANELS)).min(0).max(DOCK_PANELS.length),
      z.array(z.enum(DOCK_PANELS)).min(0).max(DOCK_PANELS.length),
    ]),
    hidden: z.array(z.enum(DOCK_PANELS)).max(DOCK_PANELS.length),
    ratio: z
      .number()
      .refine(Number.isFinite, 'Ratio must be finite.')
      .min(25)
      .max(75),
    weights: z
      .object({
        conversation: weight,
        context: weight,
        capabilities: weight,
        runlog: weight,
        diff: weight,
        outputs: weight,
      })
      .strict(),
  })
  .strict()
  .superRefine((dock, context) => {
    const columns = dock.columns.flat();
    if (
      new Set(columns).size !== columns.length ||
      columns.length !== DOCK_PANELS.length ||
      DOCK_PANELS.some((id) => !columns.includes(id))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['columns'],
        message: 'Dock columns must contain each panel exactly once.',
      });
    }
    if (new Set(dock.hidden).size !== dock.hidden.length) {
      context.addIssue({
        code: 'custom',
        path: ['hidden'],
        message: 'Hidden panels must not contain duplicates.',
      });
    }
    if (dock.hidden.length === DOCK_PANELS.length) {
      context.addIssue({
        code: 'custom',
        path: ['hidden'],
        message: 'The conversation cannot be hidden.',
      });
    }
  });

const LayoutSchema = z.enum(['focus', 'review', 'delivery']);
const LayoutHistorySchema = z
  .object({
    layout: LayoutSchema,
    dockLayouts: z
      .object({
        focus: DockLayoutSchema,
        review: DockLayoutSchema,
        delivery: DockLayoutSchema,
      })
      .strict(),
    savedLayouts: z
      .object({
        focus: DockLayoutSchema.optional(),
        review: DockLayoutSchema.optional(),
        delivery: DockLayoutSchema.optional(),
      })
      .strict(),
  })
  .strict();

const SessionWorkspaceFieldsSchema = LegacySessionSchema.omit({
  layout: true,
  dockLayouts: true,
  savedLayouts: true,
}).extend({
  dock: DockLayoutSchema,
  savedDock: DockLayoutSchema.nullable(),
  layoutHistory: LayoutHistorySchema.nullable(),
});

const SessionSchema = SessionWorkspaceFieldsSchema.extend({
  runHistory: z.array(SessionRunRecordSchema).max(MAX_SESSION_RUN_HISTORY),
  /** Newest started run's revision; v1–v6 records start at 0. */
  runRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  /** Bounded summary of the newest run; v1–v6 records start at null. */
  lastRunView: RunSnapshotSchema.nullable(),
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

function upgradeLayoutHistory(
  history: {
    layout: 'focus' | 'review' | 'delivery';
    dockLayouts: Record<
      'focus' | 'review' | 'delivery',
      Parameters<typeof addRunlogPanel>[0]
    >;
    savedLayouts: Partial<
      Record<
        'focus' | 'review' | 'delivery',
        Parameters<typeof addRunlogPanel>[0]
      >
    >;
  } | null,
): SessionStateRecord['state']['sessions'][number]['layoutHistory'] {
  if (history === null) return null;
  return {
    layout: history.layout,
    dockLayouts: {
      focus: addRunlogPanel(history.dockLayouts.focus),
      review: addRunlogPanel(history.dockLayouts.review),
      delivery: addRunlogPanel(history.dockLayouts.delivery),
    },
    savedLayouts: {
      ...(history.savedLayouts.focus
        ? { focus: addRunlogPanel(history.savedLayouts.focus) }
        : {}),
      ...(history.savedLayouts.review
        ? { review: addRunlogPanel(history.savedLayouts.review) }
        : {}),
      ...(history.savedLayouts.delivery
        ? { delivery: addRunlogPanel(history.savedLayouts.delivery) }
        : {}),
    },
  };
}

type LegacySessionFields = z.infer<typeof LegacySessionSchema>;

function upgradeSession(
  session: Omit<
    LegacySessionFields,
    'layout' | 'dockLayouts' | 'savedLayouts'
  > & {
    dock: Parameters<typeof addRunlogPanel>[0];
    savedDock: Parameters<typeof addRunlogPanel>[0] | null;
    layoutHistory: Parameters<typeof upgradeLayoutHistory>[0];
    runHistory?: SessionStateRecord['state']['sessions'][number]['runHistory'];
  },
): SessionStateRecord['state']['sessions'][number] {
  return {
    ...session,
    dock: addRunlogPanel(session.dock),
    savedDock:
      session.savedDock === null ? null : addRunlogPanel(session.savedDock),
    layoutHistory: upgradeLayoutHistory(session.layoutHistory),
    runHistory: session.runHistory ?? [],
    runRevision: 0,
    lastRunView: null,
  };
}

/**
 * v6 records predate the RunLog panel. Loading one inserts the panel hidden
 * beside the capability panel; the source file is not rewritten until the user
 * saves, so an old record stays byte-identical on read.
 */
const LegacyFieldsSchema = LegacySessionSchema.omit({
  layout: true,
  dockLayouts: true,
  savedLayouts: true,
}).extend({
  dock: LegacyDockLayoutSchema,
  savedDock: LegacyDockLayoutSchema.nullable(),
  layoutHistory: LegacySessionSchema.pick({
    layout: true,
    dockLayouts: true,
    savedLayouts: true,
  }).nullable(),
});

const V6SessionSchema = LegacyFieldsSchema.extend({
  runHistory: z.array(SessionRunRecordSchema).max(MAX_SESSION_RUN_HISTORY),
}).strict();
const V6StateSchema = LegacyStateObjectSchema.extend({
  sessions: z.array(V6SessionSchema).max(10_000),
}).superRefine(validateWorkspaceState);
const V6RecordSchema = z
  .object({ version: z.literal(6), state: V6StateSchema })
  .strict();

function migrateV6(input: unknown): SessionStateRecord {
  const old = V6RecordSchema.parse(input);
  return SessionStateRecordSchema.parse({
    version: SESSION_STATE_VERSION,
    state: {
      ...old.state,
      sessions: old.state.sessions.map((session) =>
        upgradeSession(session as never),
      ),
    },
  });
}

/**
 * v5 records predate the per-session run history. Loading one adds an empty
 * history and the RunLog panel; the source file is not rewritten until the
 * user saves, so an old record stays byte-identical on read.
 */
const V5SessionSchema = LegacyFieldsSchema.strict();
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
      sessions: old.state.sessions.map((session) => upgradeSession(session)),
    },
  });
}

/**
 * v4 records still carry the removed intent workspace. Loading one drops that
 * field and returns current state; the source file is not rewritten until the
 * user saves, so an old record stays byte-identical on read.
 */
const V4SessionSchema = LegacyFieldsSchema.extend({
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
      sessions: old.state.sessions.map((session) =>
        upgradeSession({
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
        }),
      ),
    },
  });
}

/** Loading is pure: unknown or corrupt records throw, never clear or rewrite the source. */
export function loadRecord(input: unknown): SessionStateRecord {
  if (typeof input !== 'object' || input === null || !('version' in input))
    throw new Error('Unsupported session state record.');
  if (input.version === SESSION_STATE_VERSION)
    return SessionStateRecordSchema.parse(input);
  if (input.version === 6) return migrateV6(input);
  if (input.version === 5) return migrateV5(input);
  if (input.version === 4) return migrateV4(input);
  const legacy = loadLegacyRecord(input);
  return SessionStateRecordSchema.parse({
    version: SESSION_STATE_VERSION,
    state: {
      ...legacy.state,
      sessions: legacy.state.sessions.map(
        ({ layout, dockLayouts, savedLayouts, ...session }) =>
          upgradeSession({
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

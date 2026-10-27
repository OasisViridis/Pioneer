import { z } from 'zod';
import type {
  SessionId,
  LegacySessionWorkspaceState as SessionWorkspaceState,
} from './contracts/session-workspace';
import { LIBRARY_TAB_ID, SETTINGS_TAB_ID } from './contracts/session-workspace';
import { DOCK_PANELS, LEGACY_DOCK_PANELS, createDockLayout } from './docking';
import { ProjectSummarySchema } from './validation';
import { MAX_ACTIVITY_TIMESTAMP } from './session-activity';

export const MAX_SESSION_STATE_BYTES = 8 * 1024 * 1024;
export const SESSION_STATE_VERSION = 3 as const;
const MAX_SESSION_ID_LENGTH = 256;
const MAX_SESSION_COUNT = 10_000;
const MAX_OPEN_SESSION_COUNT = 10_000;
const MAX_MRU_TAB_COUNT = 10_002;
const MAX_MESSAGE_LENGTH = 8_000;
const MAX_DRAFT_LENGTH = 8_000;
const MAX_TITLE_LENGTH = 48;
const layouts = ['focus', 'review', 'delivery'] as const;

const SessionIdSchema = z
  .string()
  .min('session:'.length)
  .max(MAX_SESSION_ID_LENGTH)
  .regex(/^session:\S+$/)
  .transform((id) => id as SessionId);
const LayoutSchema = z.enum(layouts);
const PanelIdSchema = z.enum(['context', 'capabilities', 'diff', 'outputs']);
const DockPanelIdSchema = z.enum(DOCK_PANELS);
const weight = z
  .number()
  .refine(Number.isFinite, 'Weight must be finite.')
  .min(0.2)
  .max(8);

/**
 * v1–v6 layouts predate the RunLog panel. Their files contain the five legacy
 * panels and no `runlog` weight; `addRunlogPanel` upgrades them on load. A
 * layout that already carries `runlog` is accepted too, so an already-migrated
 * record parses through the same legacy path.
 */
export const LegacyDockLayoutSchema = z
  .object({
    columns: z.tuple([
      z.array(DockPanelIdSchema).max(DOCK_PANELS.length),
      z.array(DockPanelIdSchema).max(DOCK_PANELS.length),
    ]),
    hidden: z.array(DockPanelIdSchema).max(DOCK_PANELS.length),
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
        diff: weight,
        outputs: weight,
        /**
         * Defaulted for v1–v6 layouts that predate the RunLog panel; the load
         * path inserts the panel with the same weight, so the default never
         * disagrees with the upgraded layout.
         */
        runlog: weight.default(1),
      })
      .strict(),
  })
  .strict()
  .superRefine((dock, context) => {
    const columns = dock.columns.flat();
    const currentComplete =
      columns.length === DOCK_PANELS.length &&
      DOCK_PANELS.every((id) => columns.includes(id));
    const legacyComplete =
      columns.length === LEGACY_DOCK_PANELS.length &&
      LEGACY_DOCK_PANELS.every((id) => columns.includes(id));
    if (
      new Set(columns).size !== columns.length ||
      !(currentComplete || legacyComplete)
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

const OutputTabSchema = z.enum(['preview', 'files', 'verification']);
const TabIdSchema = z.union([
  z.literal(LIBRARY_TAB_ID),
  z.literal(SETTINGS_TAB_ID),
  SessionIdSchema,
]);
const PanelListSchema = z
  .array(PanelIdSchema)
  .max(4)
  .superRefine((panels, context) => {
    if (new Set(panels).size !== panels.length)
      context.addIssue({
        code: 'custom',
        message: 'Panel lists must not contain duplicates.',
      });
  });

const V2SessionSchema = z
  .object({
    id: SessionIdSchema,
    project: ProjectSummarySchema,
    title: z
      .string()
      .min(1)
      .max(MAX_TITLE_LENGTH)
      .refine(
        (title) => title.trim().length > 0,
        'Session titles must not be blank.',
      ),
    customTitle: z.boolean(),
    draft: z.string().max(MAX_DRAFT_LENGTH),
    messages: z.array(z.string().max(MAX_MESSAGE_LENGTH)).max(100),
    layout: LayoutSchema,
    dockLayouts: z
      .object({
        focus: LegacyDockLayoutSchema,
        review: LegacyDockLayoutSchema,
        delivery: LegacyDockLayoutSchema,
      })
      .strict(),
    savedLayouts: z
      .object({
        focus: LegacyDockLayoutSchema.optional(),
        review: LegacyDockLayoutSchema.optional(),
        delivery: LegacyDockLayoutSchema.optional(),
      })
      .strict(),
    outputTab: OutputTabSchema,
  })
  .strict();

export const LegacySessionSchema = V2SessionSchema.extend({
  lastActivityAt: z
    .number()
    .int()
    .min(0)
    .max(MAX_ACTIVITY_TIMESTAMP)
    .nullable(),
}).strict();

function ensureNoDuplicates(
  values: readonly string[],
  label: string,
  context: z.RefinementCtx,
): void {
  if (new Set(values).size !== values.length)
    context.addIssue({
      code: 'custom',
      path: [label],
      message: label + ' must not contain duplicates.',
    });
}

export function validateWorkspaceState(
  state: {
    sessions: readonly { id: string }[];
    openSessionIds: readonly string[];
    mruTabIds: readonly string[];
    activeTabId: string;
  },
  context: z.RefinementCtx,
): void {
  const sessionIds = state.sessions.map((session) => session.id);
  ensureNoDuplicates(sessionIds, 'sessions', context);
  ensureNoDuplicates(state.openSessionIds, 'openSessionIds', context);
  ensureNoDuplicates(state.mruTabIds, 'mruTabIds', context);
  const known = new Set(sessionIds);
  const open = new Set(state.openSessionIds);
  if (state.openSessionIds.some((id) => !known.has(id)))
    context.addIssue({
      code: 'custom',
      path: ['openSessionIds'],
      message: 'Open sessions must reference a stored session.',
    });
  if (
    state.mruTabIds.some(
      (id) => id !== LIBRARY_TAB_ID && id !== SETTINGS_TAB_ID && !open.has(id),
    )
  )
    context.addIssue({
      code: 'custom',
      path: ['mruTabIds'],
      message: 'MRU session tabs must reference an open session.',
    });
  if (
    state.activeTabId !== LIBRARY_TAB_ID &&
    state.activeTabId !== SETTINGS_TAB_ID &&
    !open.has(state.activeTabId)
  )
    context.addIssue({
      code: 'custom',
      path: ['activeTabId'],
      message: 'The active session tab must be open.',
    });
  if (
    new TextEncoder().encode(JSON.stringify(state)).byteLength >
    MAX_SESSION_STATE_BYTES
  )
    context.addIssue({
      code: 'custom',
      message:
        'Session state exceeds ' + String(MAX_SESSION_STATE_BYTES) + ' bytes.',
    });
}
export const LegacyStateObjectSchema = z
  .object({
    sessions: z.array(LegacySessionSchema).max(MAX_SESSION_COUNT),
    openSessionIds: z.array(SessionIdSchema).max(MAX_OPEN_SESSION_COUNT),
    activeTabId: TabIdSchema,
    mruTabIds: z.array(TabIdSchema).max(MAX_MRU_TAB_COUNT),
  })
  .strict();
const StateSchema = LegacyStateObjectSchema.superRefine(validateWorkspaceState);

export const SessionStateSchema: z.ZodType<SessionWorkspaceState> = StateSchema;
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

const V2RecordSchema = z
  .object({
    version: z.literal(2),
    state: z
      .object({
        sessions: z.array(V2SessionSchema).max(MAX_SESSION_COUNT),
        openSessionIds: z.array(SessionIdSchema).max(MAX_OPEN_SESSION_COUNT),
        activeTabId: TabIdSchema,
        mruTabIds: z.array(TabIdSchema).max(MAX_MRU_TAB_COUNT),
      })
      .strict(),
  })
  .strict();

const V1SessionSchema = z
  .object({
    id: SessionIdSchema,
    project: ProjectSummarySchema,
    title: z
      .string()
      .min(1)
      .max(MAX_TITLE_LENGTH)
      .refine((title) => title.trim().length > 0),
    customTitle: z.boolean(),
    draft: z.string().max(MAX_DRAFT_LENGTH),
    messages: z.array(z.string().max(MAX_MESSAGE_LENGTH)).max(100),
    layout: LayoutSchema,
    panels: PanelListSchema,
    panelLayouts: z
      .object({
        focus: PanelListSchema,
        review: PanelListSchema,
        delivery: PanelListSchema,
      })
      .strict(),
    outputTab: OutputTabSchema,
  })
  .strict();
const V1StateSchema = z
  .object({
    sessions: z.array(V1SessionSchema).max(MAX_SESSION_COUNT),
    openSessionIds: z.array(SessionIdSchema).max(MAX_OPEN_SESSION_COUNT),
    activeTabId: TabIdSchema,
    mruTabIds: z.array(TabIdSchema).max(MAX_MRU_TAB_COUNT),
  })
  .strict();
const V1RecordSchema = z
  .object({ version: z.literal(1), state: V1StateSchema })
  .strict();

function migrateV1(input: unknown): SessionStateRecord {
  const old = V1RecordSchema.parse(input);
  const state: SessionWorkspaceState = {
    ...old.state,
    openSessionIds: old.state.openSessionIds,
    activeTabId: old.state.activeTabId,
    mruTabIds: old.state.mruTabIds,
    sessions: old.state.sessions.map((session) => {
      const dockLayouts = Object.fromEntries(
        layouts.map((layout) => [
          layout,
          createDockLayout(
            layout,
            layout === session.layout
              ? session.panels
              : session.panelLayouts[layout],
          ),
        ]),
      ) as SessionWorkspaceState['sessions'][number]['dockLayouts'];
      return {
        id: session.id,
        project: session.project,
        title: session.title,
        customTitle: session.customTitle,
        lastActivityAt: null,
        draft: session.draft,
        messages: session.messages,
        layout: session.layout,
        dockLayouts,
        savedLayouts: {},
        outputTab: session.outputTab,
      };
    }),
  };
  return SessionStateRecordSchema.parse({
    version: SESSION_STATE_VERSION,
    state,
  });
}

export function loadRecord(input: unknown): SessionStateRecord {
  if (typeof input !== 'object' || input === null || !('version' in input))
    throw new Error('Unsupported session state record.');
  const version = (input as { version?: unknown }).version;
  if (version === 1) return migrateV1(input);
  if (version === 2) {
    const old = V2RecordSchema.parse(input);
    return SessionStateRecordSchema.parse({
      version: SESSION_STATE_VERSION,
      state: {
        ...old.state,
        sessions: old.state.sessions.map((session) => ({
          ...session,
          lastActivityAt: null,
        })),
      },
    });
  }
  if (version === SESSION_STATE_VERSION)
    return SessionStateRecordSchema.parse(input);
  throw new Error('Unsupported session state version.');
}

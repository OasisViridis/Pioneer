import { z } from 'zod';
import type { SessionWorkspaceState } from './contracts/session-workspace';
import {
  initialIntentWorkspaceState,
  IntentWorkspaceStateSchema,
} from './contracts/intent-workspace';
import {
  DockLayoutSchema,
  LegacySessionSchema,
  LegacyStateObjectSchema,
  validateWorkspaceState,
  loadRecord as loadLegacyRecord,
} from './legacy-session-state';
export { MAX_SESSION_STATE_BYTES } from './legacy-session-state';
export const SESSION_STATE_VERSION = 4 as const;

const SessionSchema = LegacySessionSchema.omit({
  layout: true,
  dockLayouts: true,
  savedLayouts: true,
})
  .extend({
    dock: DockLayoutSchema,
    savedDock: DockLayoutSchema.nullable(),
    layoutHistory: LegacySessionSchema.pick({
      layout: true,
      dockLayouts: true,
      savedLayouts: true,
    }).nullable(),
    intentState: IntentWorkspaceStateSchema,
  })
  .strict()
  .superRefine((session, context) => {
    const intent = session.intentState.intent;
    if (
      intent &&
      (intent.projectId !== session.project.id ||
        intent.id !== `intent:${session.id}`)
    )
      context.addIssue({
        code: 'custom',
        path: ['intentState', 'intent'],
        message: 'Intent must belong to this project and conversation.',
      });
  });
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

/** Loading is pure: unknown or corrupt records throw, never clear or rewrite the source. */
export function loadRecord(input: unknown): SessionStateRecord {
  if (typeof input !== 'object' || input === null || !('version' in input))
    throw new Error('Unsupported session state record.');
  if (input.version === SESSION_STATE_VERSION)
    return SessionStateRecordSchema.parse(input);
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
          intentState: initialIntentWorkspaceState(),
        }),
      ),
    },
  });
}

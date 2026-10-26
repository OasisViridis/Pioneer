import { z } from 'zod';
import type {
  SessionId,
  SessionWorkspaceState,
} from './contracts/session-workspace';

/** Largest UTC millisecond value representable by Date; activity is not authority. */
export const MAX_ACTIVITY_TIMESTAMP = 8_640_000_000_000_000;

export function isActivityTimestamp(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_ACTIVITY_TIMESTAMP
  );
}

export interface SessionActivitySummary {
  id: SessionId;
  projectId: string;
  lastActivityAt: number | null;
}
export interface WorkspaceActivitySummary {
  projectId: string;
  lastActivityAt: number | null;
  mostRecentSessionId: SessionId;
}
export interface SessionActivitySnapshot {
  sessions: SessionActivitySummary[];
  workspaces: WorkspaceActivitySummary[];
}

const ActivitySessionIdSchema = z
  .string()
  .max(256)
  .regex(/^session:\S+$/)
  .transform((id) => id as SessionId);
const ActivityTimeSchema = z
  .number()
  .int()
  .min(0)
  .max(MAX_ACTIVITY_TIMESTAMP)
  .nullable();
const ActivityProjectIdSchema = z.string().min(1).max(256);
export const SessionActivitySnapshotSchema: z.ZodType<SessionActivitySnapshot> =
  z
    .object({
      sessions: z
        .array(
          z
            .object({
              id: ActivitySessionIdSchema,
              projectId: ActivityProjectIdSchema,
              lastActivityAt: ActivityTimeSchema,
            })
            .strict(),
        )
        .max(10_000),
      workspaces: z
        .array(
          z
            .object({
              projectId: ActivityProjectIdSchema,
              lastActivityAt: ActivityTimeSchema,
              mostRecentSessionId: ActivitySessionIdSchema,
            })
            .strict(),
        )
        .max(10_000),
    })
    .strict();

function compareCodePoints(a: string, b: string): number {
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < a.length && rightIndex < b.length) {
    const left = a.codePointAt(leftIndex) ?? 0;
    const right = b.codePointAt(rightIndex) ?? 0;
    if (left !== right) return left - right;
    leftIndex += left > 0xffff ? 2 : 1;
    rightIndex += right > 0xffff ? 2 : 1;
  }
  return leftIndex < a.length ? 1 : rightIndex < b.length ? -1 : 0;
}

/** New summaries only; never mutates input, exposes message content, or favors open tabs. */
export function querySessionActivity(
  state: SessionWorkspaceState,
): SessionActivitySnapshot {
  const sessions = state.sessions
    .map(({ id, project, lastActivityAt }) => ({
      id,
      projectId: project.id,
      lastActivityAt,
    }))
    .sort((a, b) => {
      if (a.lastActivityAt !== b.lastActivityAt) {
        if (a.lastActivityAt === null) return 1;
        if (b.lastActivityAt === null) return -1;
        return b.lastActivityAt - a.lastActivityAt;
      }
      return compareCodePoints(a.id, b.id);
    });
  const seen = new Set<string>();
  const workspaces: WorkspaceActivitySummary[] = [];
  for (const session of sessions) {
    if (seen.has(session.projectId)) continue;
    seen.add(session.projectId);
    workspaces.push({
      projectId: session.projectId,
      lastActivityAt: session.lastActivityAt,
      mostRecentSessionId: session.id,
    });
  }
  return { sessions, workspaces };
}

/** Pure logical-clock advance; an invalid host clock supplies no activity evidence. */
export function advanceActivityAt(
  highWater: number | null,
  occurredAt: number | undefined,
): number | null {
  if (!isActivityTimestamp(occurredAt)) return null;
  return highWater === null
    ? occurredAt
    : Math.max(occurredAt, Math.min(highWater + 1, MAX_ACTIVITY_TIMESTAMP));
}

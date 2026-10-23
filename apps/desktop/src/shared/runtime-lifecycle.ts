import {
  RuntimeLifecycleSchema,
  runtimeEventId,
  type RuntimeLifecycleResult,
} from './contracts/runtime-lifecycle';
import { RuntimeSessionSchema } from './contracts/runtime-session';

function eventIdentity(
  sessionId: string,
  sequence: number,
): { id: string; sessionId: string; sequence: number } {
  return { id: runtimeEventId(sessionId, sequence), sessionId, sequence };
}

function deepFreeze(value: unknown): void {
  if (value === null || typeof value !== 'object') return;

  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }

  Object.freeze(value);
}

export function createRuntimeLifecycle(
  session: unknown,
): RuntimeLifecycleResult {
  const parsedSession = RuntimeSessionSchema.safeParse(session);
  if (!parsedSession.success) {
    return { ok: false, error: 'INVALID_SESSION' };
  }

  const lifecycle = RuntimeLifecycleSchema.safeParse({
    session: parsedSession.data,
    status: 'initialized',
    events: [
      {
        ...eventIdentity(parsedSession.data.id, 1),
        type: 'session.initialized',
        approvedIntentRevision: parsedSession.data.approvedIntent.revision,
      },
    ],
  });
  if (!lifecycle.success) {
    return { ok: false, error: 'INVALID_LIFECYCLE' };
  }

  deepFreeze(lifecycle.data);

  return { ok: true, value: lifecycle.data };
}

export function requestRuntimeStart(
  lifecycle: unknown,
): RuntimeLifecycleResult {
  const parsedLifecycle = RuntimeLifecycleSchema.safeParse(lifecycle);
  if (!parsedLifecycle.success) {
    return { ok: false, error: 'INVALID_LIFECYCLE' };
  }

  const initialized = parsedLifecycle.data;
  if (initialized.status !== 'initialized') {
    return { ok: false, error: 'INVALID_LIFECYCLE_TRANSITION' };
  }

  const next = RuntimeLifecycleSchema.safeParse({
    ...initialized,
    status: 'start_requested',
    events: [
      ...initialized.events,
      {
        ...eventIdentity(initialized.session.id, initialized.events.length + 1),
        type: 'runtime.start_requested',
      },
    ],
  });
  if (!next.success) {
    return { ok: false, error: 'INVALID_LIFECYCLE' };
  }

  deepFreeze(next.data);

  return { ok: true, value: next.data };
}

import { describe, expect, it } from 'vitest';

import {
  RuntimeLifecycleSchema,
  runtimeEventId,
} from '../../apps/desktop/src/shared/contracts/runtime-lifecycle';
import type { RuntimeSession } from '../../apps/desktop/src/shared/contracts/runtime-session';
import {
  createRuntimeLifecycle,
  requestRuntimeStart,
} from '../../apps/desktop/src/shared/runtime-lifecycle';

const sessionFixture = (): RuntimeSession => ({
  id: 'session:intent:project-alpha:r2',
  projectId: 'project-alpha',
  approvedIntent: {
    id: 'intent:project-alpha',
    projectId: 'project-alpha',
    revision: 2,
    instruction: '只建立生命周期骨架。',
    steps: [{ id: 'scope', summary: '锁定边界' }],
    status: 'ready',
  },
  status: 'initialized',
  capabilities: {
    modelAccess: false,
    toolExecution: false,
    fileMutation: false,
  },
});

describe('runtime lifecycle event skeleton', () => {
  it('rejects invalid runtime sessions', () => {
    expect(createRuntimeLifecycle({ status: 'initialized' })).toEqual({
      ok: false,
      error: 'INVALID_SESSION',
    });
  });

  it('rejects starting a lifecycle that is not an initialized lifecycle', () => {
    expect(requestRuntimeStart({ status: 'initialized' })).toEqual({
      ok: false,
      error: 'INVALID_LIFECYCLE',
    });
  });

  it('creates an initialized lifecycle with exactly one event', () => {
    const result = createRuntimeLifecycle(sessionFixture());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.status).toBe('initialized');
    expect(result.value.events).toEqual([
      {
        id: runtimeEventId(result.value.session.id, 1),
        sessionId: result.value.session.id,
        sequence: 1,
        type: 'session.initialized',
        approvedIntentRevision: 2,
      },
    ]);
  });

  it('clones the runtime session into lifecycle state', () => {
    const source = sessionFixture();
    const result = createRuntimeLifecycle(source);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    source.approvedIntent.instruction = 'mutated after lifecycle creation';

    expect(result.value.session.approvedIntent.instruction).toBe(
      '只建立生命周期骨架。',
    );
  });

  it('appends one start-requested event without enabling capabilities', () => {
    const initialized = createRuntimeLifecycle(sessionFixture());
    expect(initialized.ok).toBe(true);
    if (!initialized.ok) return;

    const result = requestRuntimeStart(initialized.value);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.status).toBe('start_requested');
    expect(result.value.events).toHaveLength(2);
    expect(result.value.events[1]).toEqual({
      id: runtimeEventId(result.value.session.id, 2),
      sessionId: result.value.session.id,
      sequence: 2,
      type: 'runtime.start_requested',
    });
    expect(result.value.session.capabilities).toEqual({
      modelAccess: false,
      toolExecution: false,
      fileMutation: false,
    });
  });

  it('rejects duplicate start requests', () => {
    const initialized = createRuntimeLifecycle(sessionFixture());
    expect(initialized.ok).toBe(true);
    if (!initialized.ok) return;

    const requested = requestRuntimeStart(initialized.value);
    expect(requested.ok).toBe(true);
    if (!requested.ok) return;

    expect(requestRuntimeStart(requested.value)).toEqual({
      ok: false,
      error: 'INVALID_LIFECYCLE_TRANSITION',
    });
  });

  it('rejects malformed event identity and ordering', () => {
    const initialized = createRuntimeLifecycle(sessionFixture());
    expect(initialized.ok).toBe(true);
    if (!initialized.ok) return;

    const malformed = {
      ...initialized.value,
      status: 'start_requested',
      events: [
        initialized.value.events[0],
        {
          id: 'wrong-event-id',
          sessionId: 'another-session',
          sequence: 3,
          type: 'runtime.start_requested',
        },
      ],
    };

    expect(RuntimeLifecycleSchema.safeParse(malformed).success).toBe(false);
  });

  it('rejects each malformed event attribute independently', () => {
    const initialized = createRuntimeLifecycle(sessionFixture());
    expect(initialized.ok).toBe(true);
    if (!initialized.ok) return;

    const { session, events } = initialized.value;
    const startRequested = {
      id: runtimeEventId(session.id, 2),
      sessionId: session.id,
      sequence: 2,
      type: 'runtime.start_requested' as const,
    };
    const lifecycleWith = (secondEvent: unknown) => ({
      ...initialized.value,
      status: 'start_requested' as const,
      events: [events[0], secondEvent],
    });

    expect(
      RuntimeLifecycleSchema.safeParse(lifecycleWith(startRequested)).success,
    ).toBe(true);
    expect(
      RuntimeLifecycleSchema.safeParse(
        lifecycleWith({ ...startRequested, id: 'wrong-event-id' }),
      ).success,
    ).toBe(false);
    expect(
      RuntimeLifecycleSchema.safeParse(
        lifecycleWith({ ...startRequested, sessionId: 'another-session' }),
      ).success,
    ).toBe(false);
    expect(
      RuntimeLifecycleSchema.safeParse(
        lifecycleWith({ ...startRequested, sequence: 3 }),
      ).success,
    ).toBe(false);
  });

  it('rejects a status that disagrees with the recorded events', () => {
    const initialized = createRuntimeLifecycle(sessionFixture());
    expect(initialized.ok).toBe(true);
    if (!initialized.ok) return;

    expect(
      RuntimeLifecycleSchema.safeParse({
        ...initialized.value,
        status: 'start_requested',
      }).success,
    ).toBe(false);
  });

  it('leaves the given lifecycle untouched when appending a start request', () => {
    const initialized = createRuntimeLifecycle(sessionFixture());
    expect(initialized.ok).toBe(true);
    if (!initialized.ok) return;

    const before = structuredClone(initialized.value);
    const requested = requestRuntimeStart(initialized.value);

    expect(requested.ok).toBe(true);
    expect(initialized.value).toEqual(before);
  });

  it('freezes the returned lifecycle so recorded history cannot be edited', () => {
    const initialized = createRuntimeLifecycle(sessionFixture());
    expect(initialized.ok).toBe(true);
    if (!initialized.ok) return;

    expect(Object.isFrozen(initialized.value)).toBe(true);
    expect(Object.isFrozen(initialized.value.events)).toBe(true);
    expect(() => {
      initialized.value.events.pop();
    }).toThrow();
  });
});

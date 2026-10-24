import { describe, expect, it } from 'vitest';
import {
  RunLaunchProbe,
  type ProbeBinding,
  type ProbeGrant,
} from '../helpers/run-launch-probe';

const binding: ProbeBinding = {
  sessionId: 'session:one',
  projectId: 'project:one',
  windowId: 1,
  windowEpoch: 1,
  revision: 2,
  rootRevision: 1,
};
const caller = { windowId: 1, windowEpoch: 1, trusted: true };
const request = {
  sessionId: binding.sessionId,
  projectId: binding.projectId,
  expectedRevision: 2,
  requestId: 'request:1',
  grantId: 'grant:1',
};
const grant = (): ProbeGrant => ({
  id: 'grant:1',
  binding: { ...binding },
  expiresAt: 1000,
  execution: true,
  model: true,
  egress: true,
  revoked: false,
});

describe('P2 main authority decision probe', () => {
  it('accepts one explicit authorized launch without requiring a READY flag', () => {
    const probe = new RunLaunchProbe(binding, [grant()]);
    const first = probe.launch(request, caller, 0);
    expect(first).toEqual({ ok: true, runId: 'run:1' });
    expect(probe.launch({ ...request }, caller, 1)).toEqual(first);
  });

  it.each(['execution', 'model', 'egress'] as const)(
    'READY cannot replace missing %s authorization',
    (permission) => {
      const permissionGrant = grant();
      permissionGrant[permission] = false;
      expect(
        new RunLaunchProbe(binding, [permissionGrant]).launch(
          request,
          caller,
          0,
        ),
      ).toEqual({ ok: false, code: 'AUTHORIZATION_REQUIRED' });
    },
  );

  it('rejects expiry, revocation, root drift and an unrecognized grant', () => {
    for (const permissionGrant of [
      { ...grant(), expiresAt: 0 },
      { ...grant(), revoked: true },
      { ...grant(), binding: { ...binding, rootRevision: 2 } },
      { ...grant(), id: 'another' },
    ])
      expect(
        new RunLaunchProbe(binding, [permissionGrant]).launch(
          request,
          caller,
          0,
        ),
      ).toEqual({ ok: false, code: 'AUTHORIZATION_REQUIRED' });
  });

  it('rejects cross-session, stale revision and untrusted or recreated windows before idempotent lookup', () => {
    const probe = new RunLaunchProbe(binding, [grant()]);
    probe.launch(request, caller, 0);
    expect(
      probe.launch({ ...request, sessionId: 'other' }, caller, 0),
    ).toMatchObject({ ok: false, code: 'BINDING_MISMATCH' });
    expect(
      probe.launch({ ...request, expectedRevision: 1 }, caller, 0),
    ).toMatchObject({ ok: false, code: 'STALE_REVISION' });
    for (const source of [
      { ...caller, trusted: false },
      { ...caller, windowId: 2 },
      { ...caller, windowEpoch: 2 },
    ]) {
      expect(probe.launch(request, source, 0)).toMatchObject({
        ok: false,
        code: 'UNTRUSTED_SENDER',
      });
    }
  });

  it('rejects a request id reused for a different grant', () => {
    const probe = new RunLaunchProbe(binding, [grant()]);
    probe.launch(request, caller, 0);
    expect(probe.launch({ ...request, grantId: 'grant:2' }, caller, 0)).toEqual(
      { ok: false, code: 'REQUEST_CONFLICT' },
    );
  });

  it('holds the slot for unknown runs, and requires a new grant after convergence', () => {
    const probe = new RunLaunchProbe(binding, [
      grant(),
      { ...grant(), id: 'grant:2' },
    ]);
    probe.launch(request, caller, 0);
    probe.settle('unknown');
    const next = { ...request, requestId: 'request:2', grantId: 'grant:2' };
    expect(probe.launch(next, caller, 0)).toEqual({
      ok: false,
      code: 'RUN_ACTIVE',
    });
    probe.settle('stopped');
    expect(
      probe.launch({ ...next, grantId: 'grant:1' }, caller, 0),
    ).toMatchObject({ ok: false, code: 'AUTHORIZATION_REQUIRED' });
    expect(probe.launch(next, caller, 0)).toEqual({ ok: true, runId: 'run:2' });
  });
});

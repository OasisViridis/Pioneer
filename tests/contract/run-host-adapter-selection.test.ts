import { describe, expect, it } from 'vitest';

import {
  selectRunHostAdapter,
  type RunHostEnvironment,
} from '../../apps/desktop/src/main/run-host';

const developmentGate = {
  isPackaged: false,
  acceptanceRunScriptPath: null,
} as const;

describe('run host adapter selection', () => {
  it('uses the Pi adapter when no launch seam is active', () => {
    expect(selectRunHostAdapter({}, developmentGate)).toEqual({
      kind: 'pi',
      scriptPath: null,
    });
    expect(
      selectRunHostAdapter(
        { PIONEER_E2E_RUN_ADAPTER: 'controlled' },
        developmentGate,
      ),
    ).toEqual({ kind: 'pi', scriptPath: null });
    expect(selectRunHostAdapter({ PIONEER_E2E: '1' }, developmentGate)).toEqual(
      {
        kind: 'pi',
        scriptPath: null,
      },
    );
  });

  it('keeps the development E2E guard behavior for the controlled adapter', () => {
    const environment: RunHostEnvironment = {
      PIONEER_E2E: '1',
      PIONEER_E2E_RUN_ADAPTER: 'controlled',
    };

    expect(selectRunHostAdapter(environment, developmentGate)).toEqual({
      kind: 'controlled',
      scriptPath: null,
    });
    expect(
      selectRunHostAdapter(
        {
          ...environment,
          PIONEER_E2E_RUN_SCRIPT: 'C:\\evidence\\run-script.json',
        },
        developmentGate,
      ),
    ).toEqual({
      kind: 'controlled',
      scriptPath: 'C:\\evidence\\run-script.json',
    });
  });

  it('ignores the development E2E variables inside a packaged build', () => {
    expect(
      selectRunHostAdapter(
        {
          PIONEER_E2E: '1',
          PIONEER_E2E_RUN_ADAPTER: 'controlled',
          PIONEER_E2E_RUN_SCRIPT: 'C:\\evidence\\run-script.json',
        },
        { isPackaged: true, acceptanceRunScriptPath: null },
      ),
    ).toEqual({ kind: 'pi', scriptPath: null });
  });

  it('selects the controlled adapter only from a packaged acceptance script', () => {
    expect(
      selectRunHostAdapter(
        {},
        {
          isPackaged: true,
          acceptanceRunScriptPath: 'C:\\evidence\\run-script.json',
        },
      ),
    ).toEqual({
      kind: 'controlled',
      scriptPath: 'C:\\evidence\\run-script.json',
    });
  });
});

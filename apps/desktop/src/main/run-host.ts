import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { RunJournal, type RunJournalStore } from './harness/run-journal';
import {
  RunManager,
  type ProjectBinding,
  type RunManagerDependencies,
  type RunSenderPort,
  type WindowBindingPort,
} from './harness/run-manager';
import type { HarnessAdapterFactory } from './harness/adapter-seam';
import {
  createControlledAdapterFactory,
  loadControlledScript,
} from './harness/controlled-adapter';
import {
  createPiAdapterFactory,
  piCredentialPresent,
  resolvePiRuntimeConfig,
} from './harness/pi-adapter';

/** Atomic whole-file journal storage: temp write + rename in userData/runs. */
export function createFileJournalStore(userDataPath: string): RunJournalStore {
  const directory = join(userDataPath, 'runs');
  const file = join(directory, 'journal.jsonl');
  const temp = join(directory, 'journal.tmp');
  return {
    load: async () => {
      try {
        return await readFile(file, 'utf-8');
      } catch {
        return null;
      }
    },
    save: async (content: string) => {
      await mkdir(directory, { recursive: true });
      await writeFile(temp, content, 'utf-8');
      await rename(temp, file);
    },
  };
}

export interface RunHostEnvironment {
  PIONEER_E2E?: string;
  PIONEER_E2E_RUN_ADAPTER?: string;
  PIONEER_E2E_RUN_SCRIPT?: string;
  PIONEER_PI_PROVIDER_ID?: string;
  PIONEER_PI_MODEL_ID?: string;
  PIONEER_PI_ENDPOINT?: string;
  PIONEER_PI_API_KEY_ENV?: string;
  [key: string]: string | undefined;
}

export interface AssembledRunHost {
  manager: RunManager;
  journal: RunJournal;
  adapterKind: 'controlled' | 'pi';
  adapterAvailable: boolean;
  modelName: string | null;
}

type RunManagerResolveProject = RunManagerDependencies['resolveProject'];
export type { ProjectBinding, WindowBindingPort, RunSenderPort };

export interface RunHostAdapterSelection {
  kind: 'controlled' | 'pi';
  scriptPath: string | null;
}

export interface RunHostLaunchGate {
  isPackaged: boolean;
  /** Resolved by the packaged acceptance seam; null in every other launch. */
  acceptanceRunScriptPath: string | null;
}

/**
 * Decides which adapter source this launch may use. A packaged build never
 * reads the development E2E variables at all: it selects the controlled
 * adapter only through a script path the acceptance seam already validated.
 * A development launch keeps the E2E guard unchanged. A renderer request
 * cannot reach either branch.
 */
export function selectRunHostAdapter(
  environment: RunHostEnvironment,
  gate: RunHostLaunchGate,
): RunHostAdapterSelection {
  if (gate.isPackaged) {
    return gate.acceptanceRunScriptPath === null
      ? { kind: 'pi', scriptPath: null }
      : { kind: 'controlled', scriptPath: gate.acceptanceRunScriptPath };
  }

  if (
    environment.PIONEER_E2E === '1' &&
    environment.PIONEER_E2E_RUN_ADAPTER === 'controlled'
  ) {
    const scriptPath = environment.PIONEER_E2E_RUN_SCRIPT;
    return {
      kind: 'controlled',
      scriptPath:
        scriptPath === undefined || scriptPath.length === 0 ? null : scriptPath,
    };
  }

  return { kind: 'pi', scriptPath: null };
}

/**
 * Assembles the run host. The controlled adapter is injected only through the
 * development/E2E launch guard or the packaged acceptance seam (never a
 * renderer request); production uses the Pi adapter, which without an
 * authorized provider config refuses admission and is recorded as NOT_RUN
 * instead of replaying anything.
 */
export async function assembleRunHost(dependencies: {
  userDataPath: string;
  environment?: RunHostEnvironment;
  resolveProject: RunManagerResolveProject;
  windowBindings: WindowBindingPort;
  sender: RunSenderPort;
  /** Says whether this launch is a packaged build and, if so, the acceptance script. */
  launchGate: RunHostLaunchGate;
}): Promise<AssembledRunHost> {
  const environment = dependencies.environment ?? process.env;
  const journalStore = createFileJournalStore(dependencies.userDataPath);
  const { journal } = await RunJournal.open(journalStore);

  const selection = selectRunHostAdapter(environment, dependencies.launchGate);

  let adapterFactory: HarnessAdapterFactory;
  let adapterKind: 'controlled' | 'pi';
  let adapterAvailable: boolean;
  let modelName: string | null = null;

  if (selection.kind === 'controlled') {
    adapterKind = 'controlled';
    adapterAvailable = true;
    adapterFactory =
      selection.scriptPath !== null
        ? createControlledAdapterFactory(
            await loadControlledScript(selection.scriptPath),
          )
        : createControlledAdapterFactory();
  } else {
    adapterKind = 'pi';
    const config = resolvePiRuntimeConfig(environment);
    adapterAvailable =
      config !== null && piCredentialPresent(config, process.env);
    adapterFactory =
      config !== null
        ? createPiAdapterFactory(config)
        : (): never => {
            throw new Error('Pi run adapter is not configured.');
          };
    modelName = config?.modelId ?? null;
  }

  const manager = new RunManager({
    journal,
    adapterFactory,
    adapterKind,
    modelName,
    adapterAvailable,
    resolveProject: dependencies.resolveProject,
    windowBindings: dependencies.windowBindings,
    sender: dependencies.sender,
  });

  const restored = journal.restorePending();
  for (const accept of restored.restarted) {
    manager.restoreTombstone(accept);
  }

  return { manager, journal, adapterKind, adapterAvailable, modelName };
}

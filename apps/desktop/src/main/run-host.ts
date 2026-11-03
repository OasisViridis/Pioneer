import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { writeFileAtomic } from './atomic-file';

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
import {
  createFileWriteJournalStore,
  WriteChangeJournal,
} from './harness/write-permission/write-journal';
import { WritePermissionStore } from './harness/write-permission/permission-store';
import { WriteProposalRegistry } from './harness/write-permission/proposal-registry';
import { WriteController } from './write-controller';
import type { WriteProposalOutcome } from '../shared/contracts/write-preview';

/**
 * Atomic whole-file journal storage on top of the shared writer, so two writers
 * can never share one temporary file and a failed write leaves no fragment.
 */
export function createFileJournalStore(userDataPath: string): RunJournalStore {
  const directory = join(userDataPath, 'runs');
  const file = join(directory, 'journal.jsonl');
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
      await writeFileAtomic(file, content);
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
  /** P4-A write surface assembled in the same main process as the run host. */
  write: {
    controller: WriteController;
    proposals: WriteProposalRegistry;
    permissions: WritePermissionStore;
    journal: WriteChangeJournal;
  };
}

type RunManagerResolveProject = RunManagerDependencies['resolveProject'];
export type { ProjectBinding, WindowBindingPort, RunSenderPort };

/**
 * The adapter source this launch may use. `controlled` carries the script it
 * must load (null means the adapter's default script); `pi` carries nothing, so
 * an illegal "Pi with a script" state cannot be written down.
 */
export type RunHostAdapterSelection =
  | { readonly kind: 'controlled'; readonly scriptPath: string | null }
  | { readonly kind: 'pi' };

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
      ? { kind: 'pi' }
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

  return { kind: 'pi' };
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

  const adapterKind = selection.kind;
  let adapterFactory: HarnessAdapterFactory;
  let adapterAvailable: boolean;
  let modelName: string | null = null;
  let writeController: WriteController | null = null;

  if (selection.kind === 'controlled') {
    adapterAvailable = true;
    adapterFactory =
      selection.scriptPath !== null
        ? createControlledAdapterFactory(
            await loadControlledScript(selection.scriptPath),
          )
        : createControlledAdapterFactory();
  } else {
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
    writeProposal: (input) => {
      const controller = writeController;
      if (controller === null) {
        return Promise.resolve<WriteProposalOutcome>({
          status: 'rejected',
          code: 'WRITE_UNAVAILABLE',
        });
      }
      return controller.propose(input);
    },
  });

  const writeJournalStore = createFileWriteJournalStore(
    dependencies.userDataPath,
  );
  const { journal: writeJournal } =
    await WriteChangeJournal.open(writeJournalStore);
  const proposals = new WriteProposalRegistry();
  const permissions = new WritePermissionStore();
  writeController = new WriteController({
    proposals,
    permissions,
    journal: writeJournal,
    resolveProject: dependencies.resolveProject,
    currentRevision: (sessionId) => manager.lastRevisionFor(sessionId),
  });

  const restored = journal.restorePending();
  for (const accept of restored.restarted) {
    manager.restoreTombstone(accept);
  }

  return {
    manager,
    journal,
    adapterKind,
    adapterAvailable,
    modelName,
    write: {
      controller: writeController,
      proposals,
      permissions,
      journal: writeJournal,
    },
  };
}

import { writeFileAtomic } from './atomic-file';
import { IPC_CHANNELS } from '../shared/contracts/ipc';
import { RUN_IPC_CHANNELS } from '../shared/contracts/run-ipc';
import {
  SESSION_CLOSE_REQUESTED_CHANNEL,
  SESSION_IPC_CHANNELS,
} from '../shared/contracts/session-ipc';

/** One project as the package scanner saw it. */
export interface PackagedAcceptanceProject {
  id: string;
  name: string;
  absolutePath: string;
}

/** One workspace-scan warning as the package scanner saw it. */
export interface PackagedAcceptanceWarning {
  code: string;
  path: string;
}

/** Facts the main process knows before it builds the report. */
interface PackagedAcceptanceStartupFacts {
  isPackaged: boolean;
  electronVersion: string;
  nodeVersion: string;
  platform: string;
  processId: number;
  startedAt: string;
  userDataRoot: string;
  executablePath: string;
}

/**
 * Startup facts a packaged acceptance run can read back without trusting the
 * renderer. The main process writes the report after the workspace scan, the
 * run host and the window exist, so it describes what this launch actually
 * assembled; the acceptance test reads it while the app keeps running.
 */
export interface PackagedAcceptanceReport extends PackagedAcceptanceStartupFacts {
  kind: 'pioneer-packaged-acceptance-startup';
  schemaVersion: 1;
  reportedAt: string;
  workspaceRoot: string | null;
  projects: PackagedAcceptanceProject[];
  warnings: PackagedAcceptanceWarning[];
  adapterKind: 'controlled' | 'pi';
  adapterAvailable: boolean;
  modelName: string | null;
  channels: string[];
}

/**
 * Every IPC channel name this build wires, in one place. The report records it
 * and the acceptance spec compares the whole list with the shared contract
 * maps, so adding a channel cannot silently leave the report behind.
 */
export function acceptanceChannels(): string[] {
  return [
    ...Object.values(IPC_CHANNELS),
    ...Object.values(SESSION_IPC_CHANNELS),
    SESSION_CLOSE_REQUESTED_CHANNEL,
    ...Object.values(RUN_IPC_CHANNELS),
  ];
}

/** Everything the main process already knows when it builds the report. */
export interface PackagedAcceptanceReportInput extends PackagedAcceptanceStartupFacts {
  catalog: {
    rootPath: string | null;
    projects: readonly PackagedAcceptanceProject[];
    warnings: readonly PackagedAcceptanceWarning[];
  };
  runHost: {
    adapterKind: 'controlled' | 'pi';
    adapterAvailable: boolean;
    modelName: string | null;
  };
  now: () => Date;
}

export function buildPackagedAcceptanceReport(
  input: PackagedAcceptanceReportInput,
): PackagedAcceptanceReport {
  return {
    kind: 'pioneer-packaged-acceptance-startup',
    schemaVersion: 1,
    isPackaged: input.isPackaged,
    electronVersion: input.electronVersion,
    nodeVersion: input.nodeVersion,
    platform: input.platform,
    processId: input.processId,
    startedAt: input.startedAt,
    reportedAt: input.now().toISOString(),
    userDataRoot: input.userDataRoot,
    executablePath: input.executablePath,
    workspaceRoot: input.catalog.rootPath,
    projects: input.catalog.projects.map((project) => ({
      id: project.id,
      name: project.name,
      absolutePath: project.absolutePath,
    })),
    warnings: input.catalog.warnings.map((warning) => ({
      code: warning.code,
      path: warning.path,
    })),
    adapterKind: input.runHost.adapterKind,
    adapterAvailable: input.runHost.adapterAvailable,
    modelName: input.runHost.modelName,
    channels: acceptanceChannels(),
  };
}

/** Write through a uniquely named temporary sibling so no reader sees half a report. */
export async function writePackagedAcceptanceReport(
  reportPath: string,
  report: PackagedAcceptanceReport,
): Promise<void> {
  await writeFileAtomic(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

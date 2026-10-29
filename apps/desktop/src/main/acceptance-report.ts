import { writeFile } from 'node:fs/promises';

/**
 * Startup facts a packaged acceptance run can read back without trusting the
 * renderer. Written by the main process once the workspace scan and the run
 * host are assembled, before the window reports anything.
 */
export interface PackagedAcceptanceReport {
  kind: 'pioneer-packaged-acceptance-startup';
  schemaVersion: 1;
  isPackaged: boolean;
  electronVersion: string;
  nodeVersion: string;
  platform: string;
  processId: number;
  startedAt: string;
  reportedAt: string;
  userDataRoot: string;
  workspaceRoot: string | null;
  projects: { id: string; name: string; absolutePath: string }[];
  warnings: { code: string; path: string }[];
  adapterKind: 'controlled' | 'pi';
  adapterAvailable: boolean;
  modelName: string | null;
  channels: string[];
}

export async function writePackagedAcceptanceReport(
  reportPath: string,
  report: PackagedAcceptanceReport,
): Promise<void> {
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
}

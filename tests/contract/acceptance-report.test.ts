import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  acceptanceChannels,
  buildPackagedAcceptanceReport,
  writePackagedAcceptanceReport,
} from '../../apps/desktop/src/main/acceptance-report';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

const fixedNow = (): Date => new Date('2026-11-02T00:00:00.000Z');

describe('packaged acceptance startup report', () => {
  it('copies the catalog and run host facts without sharing their arrays', () => {
    const report = buildPackagedAcceptanceReport({
      isPackaged: true,
      electronVersion: '44.2.0',
      nodeVersion: 'v24.20.0',
      platform: 'win32',
      processId: 4242,
      startedAt: '2026-11-02T00:00:00.000Z',
      userDataRoot: 'C:\\profile',
      executablePath: 'C:\\app\\@pioneer-desktop.exe',
      catalog: {
        rootPath: 'C:\\workspace',
        projects: [
          {
            id: 'project-1',
            name: 'alpha-app',
            absolutePath: 'C:\\workspace\\alpha-app',
          },
        ],
        warnings: [{ code: 'METADATA_INVALID', path: 'C:\\workspace\\bad' }],
      },
      runHost: {
        adapterKind: 'controlled',
        adapterAvailable: true,
        modelName: null,
      },
      now: fixedNow,
    });

    expect(report).toEqual({
      kind: 'pioneer-packaged-acceptance-startup',
      schemaVersion: 1,
      isPackaged: true,
      electronVersion: '44.2.0',
      nodeVersion: 'v24.20.0',
      platform: 'win32',
      processId: 4242,
      startedAt: '2026-11-02T00:00:00.000Z',
      reportedAt: '2026-11-02T00:00:00.000Z',
      userDataRoot: 'C:\\profile',
      executablePath: 'C:\\app\\@pioneer-desktop.exe',
      workspaceRoot: 'C:\\workspace',
      projects: [
        {
          id: 'project-1',
          name: 'alpha-app',
          absolutePath: 'C:\\workspace\\alpha-app',
        },
      ],
      warnings: [{ code: 'METADATA_INVALID', path: 'C:\\workspace\\bad' }],
      adapterKind: 'controlled',
      adapterAvailable: true,
      modelName: null,
      channels: acceptanceChannels(),
    });
    expect(report.channels).not.toBe(acceptanceChannels());
  });

  it('writes the report through a temporary sibling and leaves no temp file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pioneer-report-'));
    temporaryDirectories.push(directory);
    const reportPath = join(directory, 'startup-report.json');
    const report = buildPackagedAcceptanceReport({
      isPackaged: true,
      electronVersion: '44.2.0',
      nodeVersion: 'v24.20.0',
      platform: 'win32',
      processId: 4242,
      startedAt: '2026-11-02T00:00:00.000Z',
      userDataRoot: 'C:\\profile',
      executablePath: 'C:\\app\\@pioneer-desktop.exe',
      catalog: { rootPath: null, projects: [], warnings: [] },
      runHost: {
        adapterKind: 'pi',
        adapterAvailable: false,
        modelName: null,
      },
      now: fixedNow,
    });

    await writePackagedAcceptanceReport(reportPath, report);

    expect(JSON.parse(await readFile(reportPath, 'utf-8'))).toEqual(report);
    expect(await readdir(directory)).toEqual(['startup-report.json']);
  });
});

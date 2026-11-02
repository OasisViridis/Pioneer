import { defineConfig } from '@playwright/test';
import path from 'node:path';

/**
 * Packaged acceptance is deliberately outside the default gate (`pnpm check`):
 * it repackages the desktop app and drives the shipped executable through CDP.
 * `pnpm acceptance:packaged` builds the package first; `test:e2e` never runs
 * this file because its own config lists its specs explicitly.
 */
export default defineConfig({
  testDir: '.',
  testMatch: ['packaged-acceptance.e2e.spec.ts'],
  outputDir: path.join(process.cwd(), 'tmp', 'issue53-acceptance', 'artifacts'),
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  // The individual waits (CDP 45 s, window 60 s, run 90 s, cleanup 30 s) can
  // add up on a slow machine; the test budget must stay above their sum.
  timeout: 360_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    trace: 'off',
  },
});

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'design-visual.e2e.spec.ts',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  updateSnapshots: 'none',
  snapshotPathTemplate: '{testDir}/visual-baselines/{arg}{ext}',
  outputDir: 'test-output/visual/artifacts',
  reporter: [
    ['line'],
    ['html', { outputFolder: 'test-output/visual/report', open: 'never' }],
    ['json', { outputFile: 'test-output/visual/results.json' }],
  ],
  expect: {
    timeout: 5000,
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      maxDiffPixels: 0,
      threshold: 0.1,
    },
  },
  use: { trace: 'retain-on-failure' },
});

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: [
    'pioneer.e2e.spec.ts',
    'design-mappings.e2e.spec.ts',
    'design-decoration.e2e.spec.ts',
    'tab-strip.e2e.spec.ts',
    'catalog-state.e2e.spec.ts',
    'offline-fonts.e2e.spec.ts',
    'p1-session.e2e.spec.ts',
    'session-lifecycle.e2e.spec.ts',
    'p2-run.e2e.spec.ts',
    'p3-panels.e2e.spec.ts',
  ],
  outputDir: 'test-output/artifacts',
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  timeout: 30_000,
  expect: {
    timeout: 4_000,
  },
  use: {
    trace: 'retain-on-failure',
  },
});

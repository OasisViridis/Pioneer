import { defineConfig } from '@playwright/test';
import config from './playwright.visual.config';

// Candidate images never overwrite the reviewed baseline directory.
export default defineConfig(config, {
  metadata: { candidate: true },
  updateSnapshots: 'all',
  snapshotPathTemplate: '{testDir}/test-output/visual/candidates/{arg}{ext}',
});

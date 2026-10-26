// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  // 'legacy/' contains all quarantined pre-V3 specs — cannot pass in browser mode
  // because there is no in-browser PDF engine. See tests/e2e/legacy/LEGACY_E2E_README.md.
  testIgnore: ['**/python/**', '**/legacy/**'],
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:1420',
    headless: true,
    viewport: { width: 1440, height: 900 },
    // Keep screenshots only on failure
    screenshot: 'only-on-failure',
    // No video — keeps context lean
    video: 'off',
  },
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { channel: 'chromium' },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:1420',
    reuseExistingServer: !process.env.CI,
    // The dev server's own output goes into the job log, so a start that times out
    // says why (native-smoke timed out at 120 s on the WSL runner, 21-10, silently).
    stdout: 'pipe',
    stderr: 'pipe',
    // The dev server's start time on the shared WSL runner is not a constant: 10 s
    // in the run of 00:35Z, about 140 s at 02:51Z (the first goto then ran into its
    // own 30 s limit and passed on retry), and over 120 s at 10:57Z (native-smoke
    // died with "Timed out waiting 120000ms from config.webServer", 21-10). A
    // limit of 5 minutes covers that; a server that really does not start still
    // fails, and its own output is in the log (stdout/stderr below).
    timeout: 300_000,
  },
});

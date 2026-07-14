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
    timeout: 30_000,
  },
});

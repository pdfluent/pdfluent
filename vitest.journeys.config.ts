// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// The journey suite: the real app, driven end to end (tests/journeys/README.md).
// Not part of `npx vitest run`: these need a built e2e app and take minutes.
// CI runs them in the `journeys:<os>` jobs with
//   npx vitest run --config vitest.journeys.config.ts
// One app at a time: every journey launches its own process, and two on one
// desktop would fight over focus, the clipboard and the app data folder.

import { defineConfig } from 'vitest/config';

// PDFLUENT_JOURNEYS_BAIL=<n>: stop the run after n failed journeys. A runner
// whose app does not start fails every journey the same way, and each failure
// can cost minutes; the job is red either way and the judge reports every
// journey that did not run as "no result". Unset = run them all.
const bail = Number(process.env.PDFLUENT_JOURNEYS_BAIL ?? 0);

export default defineConfig({
  test: {
    include: ['tests/journeys/**/*.e2e.ts'],
    environment: 'node',
    globalSetup: ['tests/journeys/lib/warmup.ts'],
    pool: 'forks',
    // One worker: vitest 5 dropped poolOptions.forks.singleFork.
    maxWorkers: 1,
    bail: Number.isFinite(bail) && bail > 0 ? bail : 0,
    fileParallelism: false,
    testTimeout: 300_000,
    hookTimeout: 120_000,
    reporters: ['verbose', 'junit', 'json'],
    outputFile: {
      junit: 'journey-results/junit.xml',
      json: 'journey-results/vitest.json',
    },
  },
});

// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// The store-screenshot scenes (tests/screenshots/README.md). Run by hand, in
// the build round; never part of `npx vitest run` or CI. One app at a time,
// as with the journeys: two windows on one desktop would fight over focus.
//   npx vitest run --config vitest.screenshots.config.ts [tests/screenshots/scenes/01]

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/screenshots/scenes/**/*.shot.ts'],
    environment: 'node',
    globalSetup: ['tests/journeys/lib/warmup.ts'],
    pool: 'forks',
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 300_000,
    hookTimeout: 120_000,
    reporters: ['verbose'],
  },
});

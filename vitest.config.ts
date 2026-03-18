// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/__tests__/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: ["tests/e2e/**"],
    environment: "node",
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
    },
    reporters: ['verbose'],
    outputFile: {
      junit: 'test-results.xml'
    }
  },
});

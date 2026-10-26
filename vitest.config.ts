// SPDX-License-Identifier: LicenseRef-PDFluent-Proprietary
// Copyright (c) 2026 Innovation Trigger B.V.

import { defineConfig } from "vitest/config";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

// Files that do not run on this platform, each with its reason
// (tests/platform-exclusions.json). Said out loud once per run: a file left out
// without a line on stderr is indistinguishable from a file that passed.
const platformExclusions = (() => {
  const all = JSON.parse(readFileSync(new URL("./tests/platform-exclusions.json", import.meta.url), "utf8")) as Record<string, unknown>;
  const mine = (all[process.platform] ?? {}) as Record<string, string>;
  for (const [file, reason] of Object.entries(mine)) {
    process.stderr.write(`SKIPPED (not a pass): ${file} on ${process.platform} — ${reason}\n`);
  }
  return Object.keys(mine);
})();

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    include: ["src/**/__tests__/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: ["tests/e2e/**", ...platformExclusions],
    environment: "node",
    // English UI whatever the runner's OS language is (tests/setup/english-locale.ts).
    setupFiles: ["tests/setup/english-locale.ts"],
    // Explicit, because the default of 5 s is a number nobody chose. Many files
    // here start node, git or cargo subprocesses and need 10-30 s on a shared
    // runner (release-suite, ci guards, compliance generator); with vitest 5 on a
    // loaded machine they timed out where vitest 2 had not, and "slow is allowed,
    // a coverage gap is not" (CLAUDE.md). Files that need more set their own.
    testTimeout: 120_000,
    hookTimeout: 120_000,
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

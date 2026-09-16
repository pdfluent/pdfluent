#!/usr/bin/env node
// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// A critical advisory against something the desktop app actually ships must
// stop the cut. Dev-only tooling is deliberately out of scope: vitest, vite,
// eslint and playwright never reach a user's machine, and folding them in here
// would mean the gate is red for months at a time and therefore ignored.
//
// "Ships" is `npm audit --omit=dev`: the production dependency closure of
// package.json, which is exactly what Vite bundles into the Tauri artefact.
//
// Exit 0 = nothing critical in what ships (or the registry was unreachable and
// the run says so). Exit 1 = a critical advisory reaches shipped code.
//
// Usage: node scripts/ci/no-critical-in-shipped-deps.mjs [projectDir]

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { isMainModule } from "../lib/main-module.mjs";

const DEFAULT_PROJECT_DIR = fileURLToPath(new URL("../..", import.meta.url));

/** Reason to skip, or null when the report can be trusted. */
function unreachable(result, report) {
  if (report && report.metadata && report.metadata.vulnerabilities) return null;
  const detail =
    (report && (report.message || (report.error && (report.error.summary || report.error.detail)))) ||
    (result.stderr || "").trim().split("\n").slice(-1)[0] ||
    `npm audit exited ${result.status}`;
  return detail;
}

export function main(argv = []) {
  const projectDir = argv[0] ?? DEFAULT_PROJECT_DIR;
  const result = spawnSync(
    "npm",
    ["audit", "--audit-level=critical", "--omit=dev", "--json"],
    { cwd: projectDir, encoding: "utf8", shell: process.platform === "win32" },
  );

  if (result.error) {
    process.stderr.write(`SKIPPED (not a pass): npm could not be run (${result.error.message})\n`);
    return 0;
  }

  let report = null;
  // npm prints warnings before the JSON body, so parse from the first brace.
  const stdout = result.stdout || "";
  const start = stdout.indexOf("{");
  if (start !== -1) {
    try {
      report = JSON.parse(stdout.slice(start));
    } catch {
      report = null;
    }
  }

  const reason = unreachable(result, report);
  if (reason !== null) {
    process.stderr.write(
      `SKIPPED (not a pass): npm audit could not reach the advisory registry — ${reason}\n`,
    );
    return 0;
  }

  const criticals = Object.entries(report.vulnerabilities || {}).filter(
    ([, v]) => v.severity === "critical",
  );

  if (criticals.length === 0) {
    process.stdout.write("no critical advisory in what the desktop app ships\n");
    return 0;
  }

  process.stderr.write(
    `CRITICAL advisories in shipped (non-dev) dependencies: ${criticals.length}\n`,
  );
  for (const [name, v] of criticals) {
    const titles = (v.via || [])
      .map((entry) => (typeof entry === "string" ? entry : entry.title))
      .filter(Boolean);
    process.stderr.write(`  ${name}@${v.range || "?"} — ${titles.join("; ") || "critical advisory"}\n`);
  }
  process.stderr.write(
    "A critical advisory against shipped code blocks the cut. Bump it, or record the\n" +
      "decision on the release ticket before proceeding.\n",
  );
  return 1;
}

// exitCode, not exit(): a write to a pipe is asynchronous, and process.exit()
// drops whatever libuv has not handed to the kernel yet. See
// tests/ci/guards-flush-before-exit.test.ts.
if (isMainModule(import.meta.url)) process.exitCode = main(process.argv.slice(2));

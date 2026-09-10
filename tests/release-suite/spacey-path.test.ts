// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// The suite run from a path with a space in it.
//
// `import.meta.url` is a URL and percent-encodes a space; `process.argv[1]` is
// a path and does not. Comparing them as strings is the usual way to write
// "only when run directly", and it is silently false for any checkout whose
// path contains a space — the module loads, defines everything, and does
// nothing.
//
// Found by installing the nightly, which keeps its own checkout under
// ~/Library/Application Support. The run made every probe, printed every skip,
// wrote no report, and exited 0. A suite that judges nothing and says it passed
// is the one outcome this whole directory exists to make impossible, so it gets
// a case rather than a fix and a shrug.

import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runToFile } from "../ci/run";
import { REPO_ROOT } from "./helpers";

describe("a checkout whose path contains a space", () => {
  it("still writes the report it judged", () => {
    // A copy, not a symlink: node resolves a symlinked path before it fills in
    // import.meta.url, so a link would prove something else entirely. The
    // renderer imports nothing but node builtins, so one file and a work
    // directory are the whole fixture.
    // realpath: the system temp directory is itself behind a symlink on macOS,
    // and node resolves a symlinked entry point, which would make this pass for
    // the wrong reason.
    const dir = realpathSync(mkdtempSync(path.join(tmpdir(), "pdfluent-spacey-")));
    const spacey = path.join(dir, "a checkout with spaces");
    mkdirSync(path.join(spacey, "work"), { recursive: true });
    mkdirSync(path.join(spacey, "out"), { recursive: true });
    copyFileSync(path.join(REPO_ROOT, "scripts/quality/suite/report.mjs"), path.join(spacey, "report.mjs"));

    writeFileSync(path.join(spacey, "work", "meta.json"), JSON.stringify({
      run_id: "spacey", version: "9.9.9", platform: "fake", machine: "test-fake",
      date: new Date().toISOString(), not_measured: [],
    }), "utf8");
    writeFileSync(path.join(spacey, "work", "steps.ndjson"),
      JSON.stringify({ step: "S0", id: "preflight", capability: "suite", status: "PASS", ms: 0, numbers: {}, reason: "", evidence: [] }) + "\n",
      "utf8");

    const r = runToFile("node", [
      path.join(spacey, "report.mjs"),
      "--work", path.join(spacey, "work"),
      "--out", path.join(spacey, "out"),
    ], { cwd: spacey, env: process.env });

    expect(readdirSync(path.join(spacey, "out")),
      `the renderer exited ${r.status} and wrote nothing:\n${r.out}${r.err}`).toContain("9.9.9-fake.json");
    expect(r.status).toBe(0);
  });

  // The idiom is easy to reach for and wrong the same way every time, so it is
  // kept out of this directory rather than corrected once it has cost a night.
  it("is not reintroduced anywhere the suite runs", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, name.name);
        if (name.isDirectory()) { walk(full); continue; }
        if (!full.endsWith(".mjs")) continue;
        if (/import\.meta\.url\s*===\s*`file:\/\/\$\{process\.argv\[1\]\}`/.test(readFileSync(full, "utf8"))) {
          offenders.push(path.relative(REPO_ROOT, full));
        }
      }
    };
    walk(path.join(REPO_ROOT, "scripts", "quality"));
    expect(offenders, `these compare a URL to a path and go quiet on a checkout with a space:\n  ${offenders.join("\n  ")}`)
      .toEqual([]);
  });
});

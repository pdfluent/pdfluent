// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// A skipped case that says nothing is indistinguishable from a passing one.
// This directory is where a release is judged, so a skip here has to say why,
// out loud, in the same place the test runner is already looking.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./helpers";

const DIR = path.join(REPO_ROOT, "tests", "release-suite");

describe("release-suite tests do not skip quietly", () => {
  it("every skip prints its reason within three lines", () => {
    const offenders: string[] = [];
    for (const f of readdirSync(DIR)) {
      if (!f.endsWith(".test.ts")) continue;
      const lines = readFileSync(path.join(DIR, f), "utf8").split("\n");
      lines.forEach((line, i) => {
        if (!/\b(it|test|describe)\.skip\(|\bskipIf\(/.test(line)) return;
        const window = lines.slice(Math.max(0, i - 3), i + 4).join("\n");
        if (!window.includes("SKIPPED (not a pass)")) offenders.push(`${f}:${i + 1}`);
      });
    }
    expect(offenders, `these skips say nothing on stderr:\n  ${offenders.join("\n  ")}`).toEqual([]);
  });
});

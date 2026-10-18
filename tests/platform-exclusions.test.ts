// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// tests/platform-exclusions.json is the one place a test file may be left out
// of a platform's run, and only with a reason. This keeps it honest: no entry
// without a reason, no entry for a file that is gone (a stale entry hides the
// next file that takes the name), and no platform other than Windows -- Linux
// and macOS run everything.

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LIST = JSON.parse(readFileSync(path.join(ROOT, "tests/platform-exclusions.json"), "utf8")) as Record<string, unknown>;

describe("platform exclusions", () => {
  it("names only Windows", () => {
    expect(Object.keys(LIST).filter((k) => !k.startsWith("_"))).toEqual(["win32"]);
  });

  const win = LIST.win32 as Record<string, string>;
  for (const [file, reason] of Object.entries(win)) {
    it(`${file} exists and carries a reason`, () => {
      expect(existsSync(path.join(ROOT, file)), `${file} is gone; drop its entry`).toBe(true);
      expect(file).toMatch(/^tests\/.+\.test\.ts$/);
      expect(reason.trim().length, `${file} has no reason`).toBeGreaterThan(30);
    });
  }

  it("is wired into the config and announced", () => {
    const cfg = readFileSync(path.join(ROOT, "vitest.config.ts"), "utf8");
    expect(cfg).toContain("...platformExclusions");
    expect(cfg).toContain("SKIPPED (not a pass): ${file} on ${process.platform}");
  });
});

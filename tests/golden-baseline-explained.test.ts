// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// golden_pdfa.rs already refuses a row that records a cost without a reason:
// "a cost is allowed to be a known fact, never an unexplained one". It can only
// refuse the rows for the platform it is running on, and a bless writes the new
// platform's rows with "-" in the note column. So the way this rule is broken
// is exactly the way it was broken on 2026-09-08: linux rows blessed from the
// runner, four of them above 2x with no reason, the darwin gate green on the
// laptop and the trunk red on the runner for hours.
//
// This reads every row of the file and applies the same rule to all platforms,
// in the cheap job, so the reason is written before the baseline lands.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const BASELINE = join(ROOT, "src-tauri/tests/golden/pdfa-baseline.tsv");

// Mirrored from src-tauri/tests/golden_pdfa.rs. Kept as literals rather than
// parsed out of the Rust: a threshold that silently follows the source is a
// threshold that stops being a decision.
const MIN_RETENTION = 0.95;
const MAX_UNEXPLAINED_SIZE_RATIO = 2.0;

type Row = Record<string, string>;

function rows(): Row[] {
  const lines = readFileSync(BASELINE, "utf8").split("\n").filter((line) => line.trim() !== "");
  const header = lines[0].split("\t");
  return lines.slice(1).map((line) => {
    const fields = line.split("\t");
    return Object.fromEntries(header.map((name, index) => [name, fields[index] ?? ""]));
  });
}

function costs(row: Row): string[] {
  const found: string[] = [];
  if (row.converts !== "true") found.push("it does not convert");
  if (row.compliant !== "true") found.push("the output is not conformant");
  if (Number(row.size_ratio) > MAX_UNEXPLAINED_SIZE_RATIO) {
    found.push(`the output is ${row.size_ratio}x the input`);
  }
  if (Number(row.retention) < MIN_RETENTION) found.push(`retention is ${row.retention}`);
  return found;
}

describe("every cost in the golden PDF/A baseline has a reason", () => {
  const all = rows();

  it("reads a baseline with rows on more than one platform", () => {
    // Guards the guard: a parse that silently produced nothing would make every
    // case below vacuously green, which is the failure this file exists to stop.
    expect(all.length).toBeGreaterThan(20);
    expect(new Set(all.map((row) => row.platform)).size).toBeGreaterThan(1);
  });

  for (const row of all) {
    const reasons = costs(row);
    if (reasons.length === 0) continue;
    it(`${row.name} on ${row.platform} says why: ${reasons.join(", ")}`, () => {
      expect(
        row.note === "-" || row.note.trim() === "",
        `${row.name} (${row.platform}) records ${reasons.join(" and ")} with nothing in the note ` +
          `column. Write what is known about it, the way the other platform's row does, or fix ` +
          `the row.`,
      ).toBe(false);
    });
  }
});

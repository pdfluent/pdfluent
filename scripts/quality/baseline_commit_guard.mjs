// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// A baseline is a promise about what the code does today. Editing one inside a
// commit that also changes the code turns the promise into a description of
// whatever just happened, and nobody reviewing the diff can tell which came
// first. So a commit that touches quality/axes/ must:
//
//   1. touch nothing but quality/axes/, quality/runs/ and the changelog,
//   2. name a ticket (#NNN) in its message,
//   3. carry a `why` on every value that moved in the bad direction.
//
// Usage: node scripts/quality/baseline_commit_guard.mjs --range <A>..<B> [--repo <dir>]

import { execFileSync, spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};

const repo = option("--repo") ?? process.cwd();
const range = option("--range");
if (!range) {
  console.error("baseline_commit_guard: --range <A>..<B> is required");
  process.exit(2);
}

const git = (...argv) =>
  execFileSync("git", ["-C", repo, ...argv], { encoding: "utf8" }).replace(/\s+$/, "");

const AXES = "quality/axes/";
// What may travel with a baseline change: the run the numbers came from, and
// the changelog line that says why anyone agreed to them. Source may not.
const ALLOWED = ["quality/axes/", "quality/runs/", "quality/QUALITY_CHANGELOG.md"];

/** Columns of quality/axes/*.tsv, mirrored from scripts/quality/ratchet.py. */
const COLUMNS = [
  "doc", "platform", "machine", "completes", "speed_p50_ms", "speed_p95_ms",
  "fidelity", "fidelity_metric", "size_ratio", "tol_speed_pct", "tol_speed_ms",
  "tol_fidelity", "tol_size_pct", "run_id", "why",
];

/** Axis columns and which direction is the better one. */
const AXIS_DIRECTION = {
  completes: "higher",
  fidelity: "higher",
  size_ratio: "lower",
  speed_p50_ms: "lower",
  speed_p95_ms: "lower",
};

function parseRows(text) {
  const rows = new Map();
  for (const line of text.split("\n")) {
    if (!line.trim() || line.startsWith("#") || line.startsWith("doc\t")) continue;
    const fields = line.split("\t");
    if (fields.length !== COLUMNS.length) continue;
    const row = Object.fromEntries(COLUMNS.map((name, index) => [name, fields[index]]));
    rows.set(`${row.doc} ${row.platform} ${row.machine} ${row.fidelity_metric}`, row);
  }
  return rows;
}

function numeric(value) {
  if (value === "-" || value === "") return undefined;
  if (value === "true") return 1;
  if (value === "false") return 0;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

const problems = [];

for (const sha of git("rev-list", "--reverse", range).split("\n").filter(Boolean)) {
  const files = git("show", "--name-only", "--format=", sha).split("\n").filter(Boolean);
  const axesFiles = files.filter((file) => file.startsWith(AXES));
  if (axesFiles.length === 0) continue;

  const strays = files.filter((file) => !ALLOWED.some((prefix) => file.startsWith(prefix)));
  if (strays.length > 0) {
    problems.push(
      `${sha.slice(0, 8)}: a baseline commit may not also change ${strays.join(", ")}`,
    );
  }

  const message = git("log", "-1", "--format=%B", sha);
  if (!/#\d+/.test(message)) {
    problems.push(
      `${sha.slice(0, 8)}: a baseline commit must name the ticket it was agreed on (#NNN)`,
    );
  }

  for (const file of axesFiles) {
    // A new baseline file has nothing to lower. Asked for directly rather
    // than caught from a throw: `git show` on a missing path writes "fatal:"
    // to stderr, and a caught error that still prints reads like a failure.
    const existedBefore = spawnSync(
      "git",
      ["-C", repo, "cat-file", "-e", `${sha}^:${file}`],
      { stdio: "ignore" },
    ).status === 0;
    if (!existedBefore) continue;
    const before = parseRows(git("show", `${sha}^:${file}`));
    const after = parseRows(git("show", `${sha}:${file}`));
    for (const [key, row] of after) {
      const was = before.get(key);
      if (!was) continue;
      const lowered = Object.entries(AXIS_DIRECTION).filter(([column, direction]) => {
        const a = numeric(was[column]);
        const b = numeric(row[column]);
        if (a === undefined || b === undefined) return false;
        return direction === "higher" ? b < a : b > a;
      });
      if (lowered.length > 0 && (row.why === "-" || row.why === "")) {
        problems.push(
          `${sha.slice(0, 8)}: ${file} ${row.doc} accepts a worse ` +
            `${lowered.map(([column]) => column).join(", ")} with no why`,
        );
      }
    }
  }
}

if (problems.length > 0) {
  console.error("baseline_commit_guard: a baseline moved without the paperwork:");
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(`baseline_commit_guard: OK (${range})`);

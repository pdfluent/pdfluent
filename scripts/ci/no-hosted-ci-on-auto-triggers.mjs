// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// Guard: every job in .github/workflows runs on our own runner.
//
// `origin` of this repository is a private tracker. Every minute a hosted
// `ubuntu-*`/`macos-*`/`windows-*` runner spends there is billed, and on
// 2026-08-21 three such workflows fired on a push and failed, which is how the
// cost was noticed at all.
//
// Until 2026-09-08 the rule was narrower: hosted was allowed as long as a human
// pressed the button (`workflow_dispatch`), because the gates that mattered ran
// elsewhere and whatever was left on GitHub was a leftover. #465 moves the
// pipeline here, onto a self-hosted runner on our own build host, so the
// exemption has nothing left to protect: a dispatched hosted minute is billed
// exactly like a pushed one, and a workflow that is hosted "for now" is the one
// that quietly bills for a year. Every job must therefore carry
// `runs-on: [self-hosted, ...]`.
//
// A job the guard cannot read is a violation, not a pass: no `runs-on` at all,
// a `runs-on` it cannot resolve, and a reusable workflow from another
// repository (whose runner travels with that file, which is not in this tree).
//
// Mirrors the engine repository's "no hosted Linux on automatic triggers" rule.
//
// Usage: node scripts/ci/no-hosted-ci-on-auto-triggers.mjs [workflow-dir]

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Drop block scalars (`run: |`) before any line-based reading: their bodies are
 * arbitrary shell, and a heredoc that happens to contain `runs-on:` would
 * otherwise be read as configuration.
 */
function stripBlockScalars(source) {
  const lines = source.split("\n");
  const kept = [];
  let blockIndent = null;
  for (const line of lines) {
    if (blockIndent !== null) {
      const indent = line.search(/\S/);
      if (line.trim() === "" || indent > blockIndent) {
        kept.push("");
        continue;
      }
      blockIndent = null;
    }
    const opener = /^(\s*)(?:- )?[^#\s][^:]*:\s*[|>][-+0-9]*\s*(?:#.*)?$/.exec(line);
    if (opener) {
      blockIndent = opener[1].length;
      kept.push("");
      continue;
    }
    kept.push(line);
  }
  return kept.join("\n");
}

function parseInlineValues(raw) {
  const value = raw.replace(/#.*$/, "").trim();
  if (value === "") return [];
  if (value.startsWith("[")) {
    return value
      .replace(/^\[/, "")
      .replace(/\]$/, "")
      .split(",")
      .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean);
  }
  return [value.replace(/^['"]|['"]$/g, "")];
}

/**
 * The jobs of one workflow, each with the lines that belong to it. A job key
 * sits at indent 2 under a top-level `jobs:`; anything else at column 0 ends
 * the block. Line-based like the rest of this file, and for the same reason:
 * the workflows carry shell that a permissive scan reads as configuration.
 */
function readJobs(source) {
  const lines = source.split("\n");
  const jobs = [];
  let inJobs = false;
  let current = null;

  const close = (until) => {
    if (!current) return;
    jobs.push({ name: current.name, body: lines.slice(current.from + 1, until).join("\n") });
    current = null;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === "" || /^\s*#/.test(line)) continue;
    const indent = line.search(/\S/);
    if (indent === 0) {
      close(i);
      inJobs = /^jobs\s*:\s*$/.test(line);
      continue;
    }
    if (!inJobs || indent !== 2) continue;
    close(i);
    const key = /^\s{2}([A-Za-z_][\w-]*)\s*:\s*(?:#.*)?$/.exec(line);
    if (key) current = { name: key[1], from: i };
  }
  close(lines.length);

  return jobs;
}

/** key -> values, for every `key: value` inside a `matrix:` block. */
function readMatrixValues(source) {
  const lines = source.split("\n");
  const values = new Map();
  let matrixIndent = null;
  for (const line of lines) {
    if (line.trim() === "" || /^\s*#/.test(line)) continue;
    const indent = line.search(/\S/);
    if (matrixIndent !== null && indent <= matrixIndent) matrixIndent = null;
    if (/^\s*matrix\s*:\s*$/.test(line)) {
      matrixIndent = indent;
      continue;
    }
    if (matrixIndent === null) continue;
    const entry = /^\s*(?:- )?([A-Za-z_][\w-]*)\s*:\s*(\S.*)$/.exec(line);
    if (!entry) continue;
    const list = values.get(entry[1]) ?? [];
    list.push(...parseInlineValues(entry[2]));
    values.set(entry[1], list);
  }
  return values;
}

/** Every runner label a job in this workflow can land on. */
function readRunnerLabels(source) {
  const lines = source.split("\n");
  const matrix = readMatrixValues(source);
  const labels = [];
  for (let i = 0; i < lines.length; i += 1) {
    const head = /^(\s*)runs-on\s*:(.*)$/.exec(lines[i]);
    if (!head) continue;
    const inline = parseInlineValues(head[2]);
    if (inline.length > 0) {
      labels.push(...inline);
    } else {
      for (let j = i + 1; j < lines.length; j += 1) {
        const item = /^\s+- (.*)$/.exec(lines[j]);
        if (!item) break;
        labels.push(...parseInlineValues(item[1]));
      }
    }
  }
  return labels.flatMap((label) => {
    const expression = /^\$\{\{\s*matrix\.([A-Za-z_][\w-]*)\s*\}\}$/.exec(label);
    // An unresolvable expression is treated as hosted: a guard that shrugs at
    // what it cannot read is the guard that let the 2026-08-21 runs through.
    if (!expression) return [label];
    return matrix.get(expression[1]) ?? [label];
  });
}

/**
 * Every job that is not pinned to our own runner, with the reason. One entry
 * per job: "the file has a hosted label somewhere" was enough while the rule
 * was about a leftover workflow, and is useless when the file holds thirteen
 * gates and one of them is wrong.
 */
export function findJobsOffOurRunner(directory) {
  const violations = [];
  const files = readdirSync(directory)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .sort();
  for (const file of files) {
    const source = stripBlockScalars(readFileSync(join(directory, file), "utf8"));
    for (const job of readJobs(source)) {
      // A reusable workflow brings its own `runs-on`. One from this repository
      // is scanned as its own file; one from anywhere else is not in this tree
      // and cannot be judged, so it does not get the benefit of the doubt.
      const reused = /^\s{4}uses\s*:\s*(\S+)/m.exec(job.body);
      if (reused) {
        if (!reused[1].startsWith("./")) {
          violations.push({ file, job: job.name, reason: `reusable workflow ${reused[1]}` });
        }
        continue;
      }
      const labels = readRunnerLabels(job.body);
      if (labels.length === 0) {
        violations.push({ file, job: job.name, reason: "no runs-on" });
        continue;
      }
      if (!labels.some((label) => /self-hosted/i.test(label))) {
        violations.push({ file, job: job.name, reason: `runs-on ${[...new Set(labels)].join(", ")}` });
      }
    }
  }
  return violations;
}

function main() {
  const directory = process.argv[2] ?? ".github/workflows";
  let violations;
  try {
    violations = findJobsOffOurRunner(directory);
  } catch (error) {
    console.error(`no-hosted-ci-on-auto-triggers: cannot read ${directory}: ${error.message}`);
    process.exit(2);
  }
  if (violations.length === 0) {
    console.log(`no-hosted-ci-on-auto-triggers: OK (${directory})`);
    return;
  }
  console.error("no-hosted-ci-on-auto-triggers: jobs that are not on our own runner\n");
  for (const violation of violations) {
    console.error(`  ${violation.file}: job ${violation.job}: ${violation.reason}`);
  }
  console.error(
    "\nEvery job belongs on the self-hosted runner: runs-on: [self-hosted, linux, pdfluent-editor].",
  );
  process.exit(1);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();

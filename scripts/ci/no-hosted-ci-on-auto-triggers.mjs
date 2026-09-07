// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// Guard: no GitHub-hosted runner may be started by an automatic trigger.
//
// `origin` of this repository is a private tracker. Every minute a hosted
// `ubuntu-*`/`macos-*`/`windows-*` runner spends there is billed, and on
// 2026-08-21 three such workflows fired on a push and failed, which is how the
// cost was noticed at all. Releases and gates run on our own runner through
// GitLab; whatever is left on GitHub must be started by a human
// (`workflow_dispatch`) or run on `self-hosted`.
//
// Mirrors the engine repository's "no hosted Linux on automatic triggers" rule.
//
// Usage: node scripts/ci/no-hosted-ci-on-auto-triggers.mjs [workflow-dir]

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// A trigger nobody has to type. `schedule` is here because a cron on a hosted
// runner bills for as long as it is forgotten, which is the failure mode this
// guard exists for.
const AUTOMATIC_TRIGGERS = new Set([
  "push",
  "pull_request",
  "pull_request_target",
  "schedule",
]);

const HOSTED_LABEL = /^(ubuntu|macos|macOS|windows)[-.]/;

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

/** Triggers declared in the top-level `on:` block. */
function readTriggers(source) {
  const lines = source.split("\n");
  const triggers = new Set();
  for (let i = 0; i < lines.length; i += 1) {
    const head = /^(?:["']?on["']?):(.*)$/.exec(lines[i]);
    if (!head) continue;
    for (const value of parseInlineValues(head[1])) triggers.add(value);
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j];
      if (line.trim() === "" || /^\s*#/.test(line)) continue;
      const indent = line.search(/\S/);
      if (indent === 0) break;
      const child = /^\s+(?:- )?([A-Za-z_][\w-]*)\s*:?\s*$/.exec(line);
      if (child && indent <= 4) triggers.add(child[1]);
    }
    break;
  }
  return triggers;
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

export function findHostedAutoTriggers(directory) {
  const violations = [];
  const files = readdirSync(directory)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .sort();
  for (const name of files) {
    const source = stripBlockScalars(readFileSync(join(directory, name), "utf8"));
    const triggers = [...readTriggers(source)].filter((t) => AUTOMATIC_TRIGGERS.has(t));
    if (triggers.length === 0) continue;
    const labels = readRunnerLabels(source);
    const hosted = labels.filter(
      (label) => !/self-hosted/i.test(label) && (HOSTED_LABEL.test(label) || /^\$\{\{/.test(label)),
    );
    if (hosted.length > 0) {
      violations.push({ file: name, triggers, hosted: [...new Set(hosted)] });
    }
  }
  return violations;
}

function main() {
  const directory = process.argv[2] ?? ".github/workflows";
  let violations;
  try {
    violations = findHostedAutoTriggers(directory);
  } catch (error) {
    console.error(`no-hosted-ci-on-auto-triggers: cannot read ${directory}: ${error.message}`);
    process.exit(2);
  }
  if (violations.length === 0) {
    console.log(`no-hosted-ci-on-auto-triggers: OK (${directory})`);
    return;
  }
  console.error("no-hosted-ci-on-auto-triggers: hosted runners on automatic triggers\n");
  for (const violation of violations) {
    console.error(
      `  ${violation.file}: on ${violation.triggers.join(", ")} -> ${violation.hosted.join(", ")}`,
    );
  }
  console.error(
    "\nGate the workflow to workflow_dispatch, move it to a self-hosted runner, or delete it.",
  );
  process.exit(1);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();

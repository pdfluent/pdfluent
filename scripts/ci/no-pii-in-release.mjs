// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// Personal-data detection is parked (owner decision 19-10): the code stays, a
// release build has no way to reach it. Three things hold that, and this
// checks all three:
//
//   1. the cargo feature `pii` is not in `default`;
//   2. every personal-data command is registered behind `#[cfg(feature = "pii")]`;
//   3. a built bundle (`--dist <dir>`) names no personal-data command and
//      carries no personal-data control.
//
// usage: node scripts/ci/no-pii-in-release.mjs [--dist dist]
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isMainModule } from "../lib/main-module.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PII_COMMANDS = [
  "detect_pii", "redact_pii", "pii_component_status", "install_pii_component", "remove_pii_component",
];
export const PII_MARKERS = ["pii-controls", "pii-model-offer", "pii-model-download"];

/** Problems with the cargo manifest: `pii` or `pii-model` reachable from `default`. */
export function manifestProblems(cargoToml) {
  const problems = [];
  const features = /^\[features\]\n([\s\S]*?)(?=^\[|$(?![\s\S]))/m.exec(cargoToml)?.[1] ?? "";
  const lines = Object.fromEntries(
    [...features.matchAll(/^([A-Za-z0-9_-]+)\s*=\s*\[([^\]]*)\]/gm)].map((m) => [m[1], m[2]]),
  );
  const reach = (name, seen = new Set()) => {
    if (seen.has(name)) return seen;
    seen.add(name);
    for (const dep of (lines[name] ?? "").matchAll(/"([^"]+)"/g)) reach(dep[1], seen);
    return seen;
  };
  if (!("pii" in lines)) problems.push("Cargo.toml has no `pii` feature to put the commands behind.");
  const reached = reach("default");
  for (const f of ["pii", "pii-model"]) {
    if (reached.has(f)) problems.push(`the feature \`${f}\` is reachable from \`default\`: a release build would carry personal-data detection.`);
  }
  return problems;
}

/** Problems with the command list: a personal-data command registered without its cfg. */
export function handlerProblems(libRs) {
  const problems = [];
  const lines = libRs.split("\n");
  for (const name of PII_COMMANDS) {
    const at = lines.findIndex((l) => l.trim() === `${name},`);
    if (at === -1) { problems.push(`${name} is not in the command list: say so here if it was removed on purpose.`); continue; }
    if (lines[at - 1].trim() !== '#[cfg(feature = "pii")]') problems.push(`${name} is registered without #[cfg(feature = "pii")].`);
    const def = lines.findIndex((l) => new RegExp(`^(async )?fn ${name}\\(`).test(l));
    if (def === -1) problems.push(`${name} has no definition.`);
    else {
      let k = def - 1;
      while (k >= 0 && (lines[k].startsWith("#[") || lines[k].startsWith("///"))) k--;
      const attrs = lines.slice(k + 1, def).join("\n");
      if (!attrs.includes('#[cfg(feature = "pii")]')) problems.push(`${name} is defined without #[cfg(feature = "pii")].`);
    }
  }
  return problems;
}

function* files(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (/\.(js|mjs|css|html)$/.test(entry)) yield path;
  }
}

/** Problems with a built bundle: a command name or a control marker in it. */
export function bundleProblems(dist) {
  const problems = [];
  let scanned = 0;
  for (const file of files(dist)) {
    scanned++;
    const text = readFileSync(file, "utf8");
    for (const needle of [...PII_COMMANDS, ...PII_MARKERS]) {
      if (text.includes(needle)) problems.push(`${file.slice(dist.length + 1)} contains "${needle}".`);
    }
  }
  if (scanned === 0) problems.push(`${dist} has no JavaScript to look at: a check that scanned nothing proves nothing.`);
  return problems;
}

function main(argv) {
  const problems = [
    ...manifestProblems(readFileSync(join(ROOT, "src-tauri", "Cargo.toml"), "utf8")),
    ...handlerProblems(readFileSync(join(ROOT, "src-tauri", "src", "lib.rs"), "utf8")),
  ];
  const at = argv.indexOf("--dist");
  if (at !== -1) problems.push(...bundleProblems(resolve(argv[at + 1])));
  else console.log("SKIPPED (not a pass): no --dist given, the built bundle was not scanned");
  if (problems.length) {
    console.error("no-pii-in-release: personal-data detection is reachable from a release build:\n");
    for (const p of problems) console.error("  - " + p);
    return 1;
  }
  console.log("no-pii-in-release: OK (feature off by default, commands gated" + (at !== -1 ? ", bundle clean)" : ")"));
  return 0;
}

if (isMainModule(import.meta.url)) process.exitCode = main(process.argv.slice(2));

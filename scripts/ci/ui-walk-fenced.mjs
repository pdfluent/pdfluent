#!/usr/bin/env node
// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// The ui-walk build must not reach anything that ships (#471, condition 1).
//
//   node scripts/ci/ui-walk-fenced.mjs                  the source and the pipelines
//   node scripts/ci/ui-walk-fenced.mjs --bundle <dir>   a built web bundle (dist/)
//   node scripts/ci/ui-walk-fenced.mjs --bundle <dir> --expect-walk
//                                                       a walk bundle: the marker MUST be there
//
// The second form is the proof on the bytes: the walker's marker string is a
// literal that exists only in src/viewer/uiWalk. If it is in a shipped dist/, the
// fence failed. --expect-walk keeps the check honest the other way round: a scan
// that cannot find the marker in the walk build is not evidence about the shipped
// one.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isMainModule } from "../lib/main-module.mjs";
import { WALK_MARKER } from "../lib/walk-build.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Files that may name the feature: they are the walk build itself and its guards. */
const ALLOWED = new Set([
  "scripts/build-ui-walk.sh",
  "scripts/ci/ui-walk-fenced.mjs",
  "scripts/lib/walk-build.mjs",
  ".github/workflows/ui-walk.yml",
  "src-tauri/Cargo.toml",
  "src-tauri/tauri.ui-walk.conf.json",
]);

/** The features listed as `default` in a Cargo.toml. */
export function defaultFeatures(cargoToml) {
  const m = /^default\s*=\s*\[([^\]]*)\]/m.exec(cargoToml);
  return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
}

/** True when a text turns the walk build on: the cargo feature or the frontend flag. */
export function turnsOnWalk(text) {
  return /--features[ =][^\n]*\bui-walk\b/.test(text)
    || /\bfeatures\s*[:=][^\n]*\bui-walk\b/.test(text)
    || /\bVITE_UI_WALK\s*[=:]\s*["']?1/.test(text);
}

function listFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "target" || name === ".git") continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) listFiles(p, out);
    else out.push(p);
  }
  return out;
}

/** Every problem in the source and pipelines, as one line each. Empty is clean. */
export function sourceProblems(root = REPO) {
  const problems = [];
  const cargo = readFileSync(path.join(root, "src-tauri/Cargo.toml"), "utf8");
  if (defaultFeatures(cargo).includes("ui-walk")) problems.push("src-tauri/Cargo.toml: ui-walk is in the default features");
  if (!/^ui-walk\s*=/m.test(cargo)) problems.push("src-tauri/Cargo.toml: the ui-walk feature is not declared, so the fence has nothing to fence");
  const pkg = readFileSync(path.join(root, "package.json"), "utf8");
  if (turnsOnWalk(pkg)) problems.push("package.json: a script turns the walk build on");
  const files = [
    ...listFiles(path.join(root, ".github")),
    ...listFiles(path.join(root, "scripts")),
    ...listFiles(path.join(root, "packaging")),
  ];
  for (const f of files) {
    const rel = path.relative(root, f).split(path.sep).join("/");
    if (ALLOWED.has(rel) || !/\.(ya?ml|sh|mjs|ps1|json|toml)$/.test(rel)) continue;
    if (turnsOnWalk(readFileSync(f, "utf8"))) problems.push(`${rel}: turns the walk build on, and only the walk build's own files may`);
  }
  for (const rel of ["src-tauri/tauri.conf.json", "src-tauri/tauri.ci.conf.json"]) {
    if (existsSync(path.join(root, rel)) && /ui-?walk/i.test(readFileSync(path.join(root, rel), "utf8"))) {
      problems.push(`${rel}: names the walk build; it has its own config (tauri.ui-walk.conf.json)`);
    }
  }
  return problems;
}

/** Does a built web bundle contain the walker? */
export function bundleHasWalker(dir) {
  return listFiles(dir)
    .filter((p) => /\.(js|mjs|html|css)$/.test(p))
    .some((p) => readFileSync(p, "utf8").includes(WALK_MARKER));
}

function main(argv) {
  const at = argv.indexOf("--bundle");
  if (at >= 0) {
    const dir = path.resolve(argv[at + 1] ?? "dist");
    const files = listFiles(dir).filter((p) => /\.(js|mjs|html|css)$/.test(p));
    if (files.length === 0) { console.error(`ui-walk-fenced: no js/css/html in ${dir}, nothing was scanned`); return 1; }
    const has = bundleHasWalker(dir);
    if (argv.includes("--expect-walk")) {
      if (!has) { console.error("ui-walk-fenced: the walk bundle does not contain the walker; this scan cannot see it, so its clean result on a shipped bundle means nothing"); return 1; }
      console.log(`ui-walk-fenced: the walker is in the walk bundle (${files.length} files scanned). OK`);
      return 0;
    }
    if (has) { console.error(`ui-walk-fenced: ${dir} contains the ui-walk walker. A shipped bundle must not.`); return 1; }
    console.log(`ui-walk-fenced: ${files.length} files scanned in ${dir}, no walker. OK`);
    return 0;
  }
  const problems = sourceProblems();
  for (const p of problems) console.error(`ui-walk-fenced: ${p}`);
  if (problems.length === 0) console.log("ui-walk-fenced: the walk build is turned on by nothing that ships. OK");
  return problems.length ? 1 : 0;
}

if (isMainModule(import.meta.url)) process.exitCode = main(process.argv.slice(2));

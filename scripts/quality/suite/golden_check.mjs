#!/usr/bin/env node
// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// Confirm the golden documents on this machine are the ones the baseline was
// measured on. Prints how they were verified on success; prints the mismatch
// and exits 1 otherwise. The build host has its own checkout, so this runs on
// both sides of a Windows run.
import { readFileSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { isMainModule } from "../../lib/main-module.mjs";

const root = process.argv[2] || process.cwd();
const dir = path.join(root, "src-tauri/tests/golden");
const manifestPath = path.join(dir, "MANIFEST.json");
const tsvPath = path.join(dir, "baseline.tsv");

// Returns the exit code rather than taking it: `return bail(...)` at the call
// site ends main() with the output still in flight behind it.
function bail(msg) { console.error(msg); return 1; }

function main() {
  if (!existsSync(tsvPath)) return bail(`src-tauri/tests/golden/baseline.tsv is missing — nothing says which documents these are`);
  const rows = readFileSync(tsvPath, "utf8").trim().split("\n").slice(1)
    .map((l) => l.split("\t")).filter((c) => c.length > 4)
    .map((c) => ({ name: c[0], bytes: Number.parseInt(c[4], 10) }));
  if (!rows.length) return bail("baseline.tsv holds no rows");

  // The manifest lists documents as objects with a name, a file and a sha256
  // (#412's golden-17 set). Flattened here to file name -> sha256.
  let manifest = null;
  if (existsSync(manifestPath)) {
    try {
      const m = JSON.parse(readFileSync(manifestPath, "utf8"));
      const list = Array.isArray(m?.documents) ? m.documents : Array.isArray(m) ? m : null;
      if (list) {
        manifest = {};
        for (const d of list) {
          if (d?.sha256) manifest[d.file ?? `${d.name}.pdf`] = d.sha256;
        }
      }
    } catch { manifest = null; }
  }

  const problems = [];
  for (const r of rows) {
    const f = path.join(dir, `${r.name}.pdf`);
    if (!existsSync(f)) { problems.push(`${r.name}.pdf is missing`); continue; }
    const size = statSync(f).size;
    if (size !== r.bytes) problems.push(`${r.name}.pdf is ${size} bytes, baseline.tsv says ${r.bytes}`);
  }

  // A sha manifest, when there is one, beats a size check: two documents can
  // share a length. The report says which of the two decided.
  let verifiedBy = "baseline.tsv bytes";
  if (manifest && !problems.length) {
    let checked = 0;
    for (const r of rows) {
      const entry = manifest[`${r.name}.pdf`] ?? manifest[r.name];
      const want = typeof entry === "string" ? entry : entry?.sha256;
      if (!want) continue;
      const got = createHash("sha256").update(readFileSync(path.join(dir, `${r.name}.pdf`))).digest("hex");
      if (got !== want) problems.push(`${r.name}.pdf sha256 ${got.slice(0, 12)} != manifest ${String(want).slice(0, 12)}`);
      checked++;
    }
    if (checked === rows.length && !problems.length) verifiedBy = "MANIFEST.json sha256";
  }

  if (problems.length) return bail(`the golden set does not match its baseline:\n  · ${problems.join("\n  · ")}`);
  // With --with-version the first line is package.json's version and the second
  // is the golden summary. One node start instead of two: the preflight needed
  // both facts and paid a full interpreter boot for each, thirteen times over in
  // the suite's own cases.
  const summary = JSON.stringify({ count: rows.length, verified_by: verifiedBy });
  if (process.argv.includes("--with-version")) {
    const version = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;
    process.stdout.write(`${version}\n${summary}`);
  } else {
    process.stdout.write(summary);
  }
  return 0;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
// Run directly, not imported. Nothing imports this file today, which is how the
// unconditional form survives: the first test or sibling that reaches in for one
// function gets the whole run as a side effect of the import. The answer is
// decided on the file -- same device, same inode -- so it stays true through a
// symlink, a copy and a renamed link, and says so on stderr when it cannot tell.
// See scripts/lib/main-module.mjs.
//
// exitCode, not exit(): a write to a pipe is asynchronous, and process.exit()
// drops whatever libuv has not handed to the kernel yet. See
// tests/ci/guards-flush-before-exit.test.ts.
if (isMainModule(import.meta.url)) process.exitCode = main();

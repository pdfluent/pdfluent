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

const root = process.argv[2] || process.cwd();
const dir = path.join(root, "src-tauri/tests/golden");
const manifestPath = path.join(dir, "MANIFEST.json");
const tsvPath = path.join(dir, "baseline.tsv");

function bail(msg) { console.error(msg); process.exit(1); }

if (!existsSync(tsvPath)) bail(`src-tauri/tests/golden/baseline.tsv is missing — nothing says which documents these are`);
const rows = readFileSync(tsvPath, "utf8").trim().split("\n").slice(1)
  .map((l) => l.split("\t")).filter((c) => c.length > 4)
  .map((c) => ({ name: c[0], bytes: Number.parseInt(c[4], 10) }));
if (!rows.length) bail("baseline.tsv holds no rows");

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

if (problems.length) bail(`the golden set does not match its baseline:\n  · ${problems.join("\n  · ")}`);
process.stdout.write(JSON.stringify({ count: rows.length, verified_by: verifiedBy }));

#!/usr/bin/env node
// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// Find the updater payload beside its signature and hash it.
//
// The signature answers who produced the bytes. This answers which bytes were
// judged, and the publish guard compares that number with the payload it is
// about to name in latest.json — the step between "signed" and "checked".
import { readFileSync, readdirSync, existsSync, writeFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { isMainModule } from "../../lib/main-module.mjs";

function main() {
  const dir = process.argv[2];
  const work = process.argv[3];
  const sigs = readdirSync(dir).filter((f) => f.endsWith(".sig"));
  if (!sigs.length) { console.error(`no .sig under ${dir}`); return 1; }
  if (sigs.length > 1) { console.error(`${sigs.length} signatures under ${dir}; expected exactly one payload`); return 1; }
  const payload = path.join(dir, sigs[0].replace(/\.sig$/, ""));
  if (!existsSync(payload) || !statSync(payload).isFile()) {
    console.error(`${sigs[0]} has no payload beside it: ${path.basename(payload)} is missing`);
    return 1;
  }
  const sha256 = createHash("sha256").update(readFileSync(payload)).digest("hex");
  writeFileSync(path.join(work, "updater.json"), JSON.stringify({ name: path.basename(payload), sha256, bytes: statSync(payload).size }, null, 2));
  process.stdout.write(`${path.basename(payload)} ${sha256}\n`);
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

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

const dir = process.argv[2];
const work = process.argv[3];
const sigs = readdirSync(dir).filter((f) => f.endsWith(".sig"));
if (!sigs.length) { console.error(`no .sig under ${dir}`); process.exit(1); }
if (sigs.length > 1) { console.error(`${sigs.length} signatures under ${dir}; expected exactly one payload`); process.exit(1); }
const payload = path.join(dir, sigs[0].replace(/\.sig$/, ""));
if (!existsSync(payload) || !statSync(payload).isFile()) {
  console.error(`${sigs[0]} has no payload beside it: ${path.basename(payload)} is missing`);
  process.exit(1);
}
const sha256 = createHash("sha256").update(readFileSync(payload)).digest("hex");
writeFileSync(path.join(work, "updater.json"), JSON.stringify({ name: path.basename(payload), sha256, bytes: statSync(payload).size }, null, 2));
process.stdout.write(`${path.basename(payload)} ${sha256}\n`);

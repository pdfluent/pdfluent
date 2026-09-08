#!/usr/bin/env node
// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// Write $WORK/meta.json: everything the steps and the renderer need to know
// about this run that is not a probe result.
//
// The artefact's sha256 is computed HERE, from the bytes on disk. It is never
// copied out of a probe's output: the publish guard compares the file it is
// about to upload against this number, and a number the artefact told us about
// itself would make that comparison say nothing.
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";

const argv = process.argv.slice(2);
const a = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith("--")) {
    const k = argv[i].slice(2);
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) a[k] = "";
    else { a[k] = v; i++; }
  }
}

const repo = path.resolve(a.repo);
const git = (args, fallback = null) => {
  try { return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim(); }
  catch { return fallback; }
};

const version = JSON.parse(readFileSync(path.join(repo, "package.json"), "utf8")).version;
const tauriConf = JSON.parse(readFileSync(path.join(repo, "src-tauri/tauri.conf.json"), "utf8"));
const artefact = path.resolve(a.artefact);
const suiteCommit = git(["rev-parse", "HEAD"]);
const builtFrom = a.commit || suiteCommit;

const PLATFORM_KEY = { macos: "darwin-aarch64", windows: "windows-x86_64", fake: "fake" };

let tools = {};
try { tools = JSON.parse(a.tools || "{}"); } catch { tools = {}; }
let golden = null;
try { golden = JSON.parse(a.golden || "null"); } catch { golden = null; }

const meta = {
  run_id: `${a.machine}-${new Date().toISOString().slice(0, 10)}-${a.platform}-${String(builtFrom).slice(0, 7)}`,
  version,
  platform: a.platform,
  platform_key: PLATFORM_KEY[a.platform] ?? a.platform,
  machine: a.machine,
  os: a.os || null,
  load1: a.load1 ? Number.parseFloat(a.load1) : null,
  artefacts: {
    primary: {
      name: path.basename(artefact),
      sha256: createHash("sha256").update(readFileSync(artefact)).digest("hex"),
      bytes: statSync(artefact).size,
    },
    updater: null,
  },
  built_from: {
    commit: builtFrom,
    // The suite records which commit the operator says this came from and
    // checks it is a commit in this repository. It cannot prove the bytes came
    // from it — the same status docs/SHIPPED.json evidence has.
    asserted_by: a.commit ? "operator" : "suite checkout",
    on_this_branch: builtFrom ? git(["merge-base", "--is-ancestor", builtFrom, "HEAD"], null) !== null : false,
    frontend_fingerprint: null,
    // Read at the commit the artefact claims, not at the checkout: a report
    // about an older build that names today's engine pin says something false
    // about what was in those bytes.
    xfa_sdk_rev: (
      (git(["show", `${builtFrom}:src-tauri/Cargo.toml`], null)
        ?? readFileSync(path.join(repo, "src-tauri/Cargo.toml"), "utf8")
      ).match(/rev\s*=\s*"([0-9a-f]{7,40})"/) || []
    )[1] ?? null,
  },
  suite_commit: suiteCommit,
  tools,
  golden_set: golden,
  expected_version: version,
  expected_bundle_id: tauriConf.identifier ?? "com.pdfluent.app",
  open_timeout_s: 60,
  expect_updater: a["expect-updater"] === "1",
  // Updater default on: the startup check reaches pdfluent.com and nothing
  // else. Resolved once, here, and recorded, so the observe step judges against
  // addresses rather than against a name it would have to resolve mid-run.
  allowed_remotes: (process.env.PDFLUENT_ALLOWED_REMOTES || "").split(",").map((s) => s.trim()).filter(Boolean),
  not_measured: [
    "first_paint (#402 C2)",
    "window count via accessibility (#411b)",
    "zero-connection run with the updater switched off (S3.c, not attempted)",
  ],
  date: new Date().toISOString(),
};

if (!existsSync(path.join(a.work))) throw new Error(`work dir ${a.work} is gone`);
writeFileSync(path.join(a.work, "meta.json"), JSON.stringify(meta, null, 2) + "\n", "utf8");

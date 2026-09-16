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
import { promises as dns } from "node:dns";
import path from "node:path";
import { startupCheckDelayMs, s2HoldMs } from "./startup_window.mjs";
import { isMainModule } from "../../lib/main-module.mjs";

const PLATFORM_KEY = { macos: "darwin-aarch64", windows: "windows-x86_64", fake: "fake" };

/**
 * The addresses the app's own startup update check is allowed to reach.
 *
 * S2 now holds a launch open long enough for that check to fire (#551), so the
 * offline row sees it — and a row that cannot tell the declared call from an
 * intruder turns every macOS release run red on the one connection the product
 * documents and defaults to on.
 *
 * The hosts come from the updater endpoints in `src-tauri/tauri.conf.json`,
 * which is what the shipped app dials; nothing here writes a host name down a
 * second time. They are resolved ONCE, here, because the samplers see addresses
 * and because a lookup during the run would land inside the window being
 * measured.
 *
 * What this cannot do is tell two tenants of one address apart: the endpoint is
 * behind a shared front end, so an address on this list clears anything else
 * served from it. That is the limit of judging a peer address, named in
 * docs/OUTBOUND_ENDPOINTS.md rather than left for a reader to discover.
 */
const LOOKUP_TIMEOUT_MS = 2_000;

async function declaredRemotes(conf) {
  const endpoints = conf?.plugins?.updater?.endpoints ?? [];
  const remotes = [];
  const unresolved = [];
  const hosts = [...new Set(endpoints.map((e) => { try { return new URL(e); } catch { return null; } })
    .filter(Boolean)
    .map((u) => `${u.hostname}|${u.port || (u.protocol === "https:" ? "443" : "80")}`))];
  for (const entry of hosts) {
    const [host, port] = entry.split("|");
    let found = [];
    try {
      // Bounded. A runner whose resolver is pointed at nothing blocks for the
      // system timeout on every lookup, and the suite's own cases write this
      // file two dozen times -- a gate that takes two minutes longer because
      // DNS is down is a gate people start skipping.
      found = (await Promise.race([
        dns.lookup(host, { all: true }),
        new Promise((_, reject) => {
          const t = setTimeout(() => reject(new Error(`resolving ${host} timed out`)), LOOKUP_TIMEOUT_MS);
          if (typeof t.unref === "function") t.unref();
        }),
      ])).map((a) => a.address);
    } catch {
      found = [];
    }
    // No address is not "nothing to allow": it is this run being unable to say
    // whether a peer it sees is the declared one. Recorded, so the row can say
    // that instead of naming an intruder it cannot rule in.
    if (!found.length) unresolved.push(host);
    for (const a of found) remotes.push(`${a}:${port}`);
  }
  return { remotes: [...new Set(remotes)], unresolved, hosts: hosts.map((h) => h.split("|")[0]) };
}

async function main(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const k = argv[i].slice(2);
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) a[k] = "";
      else { a[k] = v; i++; }
    }
  }

  // A straight-line script that is handed no arguments used to die inside
  // path.resolve with a TypeError about undefined -- a stack trace where a
  // refusal belongs, and nothing in it says which argument was missing.
  for (const need of ["repo", "artefact", "work"]) {
    if (!a[need]) {
      console.error("usage: write_meta.mjs --repo <dir> --artefact <file> --work <dir> [--platform <name>] ...");
      console.error(`write_meta: --${need} is required`);
      return 2;
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

  const declared = await declaredRemotes(tauriConf);

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
    // The app's one unprompted outbound moment, and how long S2 holds a launch
    // open to cover it (#551). Both are read out of src/lib/updater.ts here, so
    // the driver that holds and the judge that weighs the window are looking at
    // the same number and neither carries a copy of it.
    startup_check_delay_ms: startupCheckDelayMs(repo),
    s2_hold_ms: s2HoldMs(repo),
    expect_updater: a["expect-updater"] === "1",
    // Updater default on: the startup check reaches the updater endpoint and
    // nothing else. Resolved once, above, so the observe step judges against
    // addresses rather than against a name it would have to resolve mid-run. The
    // environment variable adds to that list; it does not replace it, because an
    // operator forgetting to set it used to mean the declared endpoint read as an
    // intruder — which nothing noticed while no window was long enough to see it.
    allowed_remotes: [...new Set([
      ...declared.remotes,
      ...(process.env.PDFLUENT_ALLOWED_REMOTES || "").split(",").map((s) => s.trim()).filter(Boolean),
    ])],
    allowed_remotes_hosts: declared.hosts,
    allowed_remotes_unresolved: declared.unresolved,
    not_measured: [
      "first_paint (#402 C2)",
      "window count via accessibility (#411b)",
      "zero-connection run with the updater switched off (S3.c, not attempted)",
    ],
    date: new Date().toISOString(),
  };

  if (!existsSync(path.join(a.work))) {
    console.error(`work dir ${a.work} is gone`);
    return 1;
  }
  writeFileSync(path.join(a.work, "meta.json"), JSON.stringify(meta, null, 2) + "\n", "utf8");
  return 0;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
// Run directly, not imported. Everything above used to be top-level statements,
// so the first test or sibling that reached in for one of them would have
// written a meta.json as a side effect of the import. The answer is decided on
// the file -- same device, same inode -- so it stays true through a symlink, a
// copy and a renamed link, and says so on stderr when it cannot tell. See
// scripts/lib/main-module.mjs.
//
// exitCode, not exit(): a write to a pipe is asynchronous, and process.exit()
// drops whatever libuv has not handed to the kernel yet. See
// tests/ci/guards-flush-before-exit.test.ts.
if (isMainModule(import.meta.url)) process.exitCode = await main(process.argv.slice(2));

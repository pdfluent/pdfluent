#!/usr/bin/env node
// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// S5, the driving half (#471): start the ui-walk build on a copy of the golden
// document, let its in-page walker (src/viewer/uiWalk) cover the register, and
// leave the probe where the judge reads it.
//
//   node ui_walk_run.mjs --accept <result.json> --work <dir> --built-from <sha>     (a result fetched from another host)
//   node ui_walk_run.mjs --binary <exe> --fixture <pdf> --work <dir> --built-from <sha> [--repo <root>] [--timeout-s 180]
//
// The binary is the walk build's executable (macOS: Contents/MacOS/<name> inside
// the .app; Windows: the .exe), never the shipped one: the shipped binary has no
// walker and nothing here would answer. Nothing listens on a port. The build is
// told where to read its targets and where to write its result through the
// environment of this one process, and quits itself when it has written it.
//
// Exit 0: a probe was written (it may still be a gap the judge turns into SKIPPED).
// Exit 2: could not run. The caller leaves ui_walk.out absent, and the judge reports
// SKIPPED rows with the reason on stderr; an absent probe is never a pass.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isMainModule } from "../../lib/main-module.mjs";
import { walkTargets, WALK_BUILD_MARKER } from "./ui_walk.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The checked-in test certificate (src-tauri/tests/fixtures/signer-test.p12) and the
 * password its config file records. A test credential for a self-signed certificate
 * that signs nothing but test documents, read from the project, never typed here.
 */
export function readSigner(repo) {
  const dir = path.join(repo, "src-tauri", "tests", "fixtures");
  const conf = JSON.parse(readFileSync(path.join(dir, "signer-test.json"), "utf8"));
  return { certificate: path.join(dir, conf.file), password: conf.password };
}

export function parseArgs(argv) {
  const a = { timeoutS: 180 };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--binary") a.binary = v;
    else if (k === "--fixture") a.fixture = v;
    else if (k === "--work") a.work = v;
    else if (k === "--built-from") a.builtFrom = v;
    else if (k === "--repo") a.repo = v;
    else if (k === "--timeout-s") a.timeoutS = Number(v);
    else if (k === "--accept") a.accept = v;
    else throw new Error(`unknown argument ${k}`);
  }
  for (const need of a.accept ? ["work", "builtFrom"] : ["binary", "fixture", "work", "builtFrom"]) {
    if (!a[need]) throw new Error(`missing --${need.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())}`);
  }
  return a;
}

/**
 * Run the walk. Returns { ok, reason, probePath }. A probe is accepted only if it
 * is JSON that names the ui-walk build; anything else is a failure to walk, not a
 * walk, and the judge never sees it as one.
 */
export async function runWalkBuild(a) {
  const repo = path.resolve(a.repo ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", ".."));
  const probes = path.join(a.work, "probes");
  mkdirSync(probes, { recursive: true });
  const targetsFile = path.join(a.work, "ui_walk_targets.json");
  const resultFile = path.join(a.work, "ui_walk_result.json");
  // The page answers native dialogs itself: saves go to the scratch folder, an
  // open returns the walk document (src/viewer/uiWalk/boot.ts).
  const scratch = path.join(a.work, "ui-walk-scratch");
  mkdirSync(scratch, { recursive: true });
  const signer = readSigner(repo);
  writeFileSync(targetsFile, JSON.stringify({
    targets: walkTargets(repo), scratch, document: a.fixture,
    certificate: signer.certificate, certificatePassword: signer.password,
  }));
  if (!existsSync(a.binary)) return { ok: false, reason: `the ui-walk build is not at ${a.binary}` };

  const child = spawn(a.binary, [a.fixture], {
    stdio: "ignore",
    env: { ...process.env, PDFLUENT_UI_WALK_TARGETS: targetsFile, PDFLUENT_UI_WALK_OUT: resultFile },
  });
  let exited = false;
  child.on("exit", () => { exited = true; });
  child.on("error", () => { exited = true; });

  const until = Date.now() + a.timeoutS * 1000;
  while (!existsSync(resultFile) && !exited && Date.now() < until) await sleep(500);
  // The host writes the file and then quits; give the quit a moment, then end it.
  await sleep(1500);
  if (!exited) child.kill();

  if (!existsSync(resultFile)) {
    return { ok: false, reason: exited ? "the ui-walk build exited without writing a result" : `no result within ${a.timeoutS} s` };
  }
  return acceptResult(resultFile, a);
}

/**
 * Take a result the walk build wrote (here, or on another host and fetched back)
 * and make it the probe the judge reads. Accepted only if it is JSON that names the
 * ui-walk build; anything else is a failure to walk, not a walk. The commit it was
 * built from is stamped here, by the suite, not trusted from the build.
 */
export function acceptResult(resultFile, a) {
  const probes = path.join(a.work, "probes");
  mkdirSync(probes, { recursive: true });
  let probe;
  try { probe = JSON.parse(readFileSync(resultFile, "utf8")); } catch (e) {
    return { ok: false, reason: `the walk result is not JSON: ${String(e.message).split("\n")[0]}` };
  }
  if (probe?.build !== "ui-walk" || probe?.marker !== WALK_BUILD_MARKER) {
    return { ok: false, reason: "the result does not come from the ui-walk build" };
  }
  probe.built_from = a.builtFrom;
  const out = path.join(probes, "ui_walk.out");
  writeFileSync(out, JSON.stringify(probe, null, 2) + "\n");
  writeFileSync(path.join(probes, "ui_walk.rc"), "0\n");
  return { ok: true, reason: "", probePath: out };
}

if (isMainModule(import.meta.url)) {
  let args;
  try { args = parseArgs(process.argv.slice(2)); } catch (e) {
    process.stderr.write(`ui_walk_run: ${e.message}\n`);
    process.exitCode = 2;
  }
  if (args) {
    const r = args.accept ? acceptResult(args.accept, args) : await runWalkBuild(args);
    if (!r.ok) {
      process.stderr.write(`SKIPPED (not a pass): ui walk — ${r.reason}\n`);
      process.exitCode = 2;
    }
  }
}

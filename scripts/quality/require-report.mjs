#!/usr/bin/env node
// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// require-report.mjs — the publish slot.
//
// Nothing reaches R2 or the updater feed until the release quality suite has
// run against exactly these bytes and passed. The binding is the sha256: the
// report names the file it judged, this compares that number with the file
// about to be uploaded, and a report for a different build refuses.
//
//   node scripts/quality/require-report.mjs --version 1.0.0 --file dist-release/PDFluent_1.0.0_universal.dmg --platform darwin-aarch64
//   node scripts/quality/require-report.mjs --version 1.0.0 --artifacts artifacts [--updater]
//
// Exit 0 = may publish. Exit 1 = refused, with the reason and the two commands
// that fix it. Exit 2 = cannot judge (a shallow clone has no ancestry).
//
// Override: PDFLUENT_PUBLISH_WITHOUT_REPORT=<ticket number>. It publishes, and
// it writes the override next to the reports so the exception is a file in the
// release rather than a decision that lived in one terminal for ten minutes.

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const KNOWN_SCHEMAS = new Set(["pdfluent-release-suite/1"]);

export const PLATFORM_KEYS = {
  "darwin-aarch64": "macos",
  "darwin-x86_64": "macos",
  "windows-x86_64": "windows",
  macos: "macos",
  windows: "windows",
};

class Refused extends Error {
  constructor(message, code = 1) { super(message); this.code = code; }
}

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function isAncestor(sha, trunk, cwd) {
  try { git(["merge-base", "--is-ancestor", sha, trunk], cwd); return true; } catch { return false; }
}

function commitExists(sha, cwd) {
  try { git(["rev-parse", "--verify", "--quiet", `${sha}^{commit}`], cwd); return true; } catch { return false; }
}

export function sha256OfFile(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

export function platformKeyFor(platform) {
  if (platform === "linux-x86_64" || platform === "linux") {
    throw new Refused(
      "Linux is not a release platform: the desktop release ships macOS and Windows only, and nothing should reach the download manifest through this path by accident.",
    );
  }
  const key = PLATFORM_KEYS[platform];
  if (!key) throw new Refused(`unknown platform "${platform}"; expected one of ${Object.keys(PLATFORM_KEYS).join(", ")}`);
  return key;
}

const HOWTO = (reportPath) =>
  `\n  Run the suite against these bytes:\n` +
  `    scripts/quality/release_suite.sh --platform <macos|windows> --artefact <file> --commit <sha> --machine <class>\n` +
  `  It writes ${reportPath}. To publish without one anyway:\n` +
  `    PDFLUENT_PUBLISH_WITHOUT_REPORT=<ticket number> <the publish command>`;

/**
 * @returns {{ok: true, report: object, reportPath: string}} on success.
 * @throws {Refused} with a message naming the expected path or value.
 */
export function requireQualityReport({
  version,
  platform,
  file,
  reportsDir = "quality/reports",
  trunk = "HEAD",
  updater = false,
  root = process.cwd(),
}) {
  const platformKey = platformKeyFor(platform);
  const reportPath = path.resolve(root, reportsDir, `${version}-${platformKey}.json`);

  if (!existsSync(reportPath)) {
    throw new Refused(`no quality report at ${path.relative(root, reportPath)} — ${path.basename(file ?? "this artefact")} has not been judged.${HOWTO(path.relative(root, reportPath))}`);
  }
  let report;
  try { report = JSON.parse(readFileSync(reportPath, "utf8")); }
  catch (e) { throw new Refused(`${path.relative(root, reportPath)} is not valid JSON: ${String(e.message).split("\n")[0]}`); }

  if (!KNOWN_SCHEMAS.has(report.schema)) {
    throw new Refused(`${path.relative(root, reportPath)} says schema "${report.schema}", which this guard does not know how to read.`);
  }
  if (report.verdict !== "PASS" || report.exit_code !== 0) {
    throw new Refused(`${path.relative(root, reportPath)} says ${report.verdict} (exit ${report.exit_code}). Only a PASS publishes.${HOWTO(path.relative(root, reportPath))}`);
  }
  if (report.version !== version) {
    throw new Refused(`${path.relative(root, reportPath)} judged ${report.version}, and this publish is ${version}.`);
  }

  if (file) {
    const slot = updater ? report.artefacts?.updater : report.artefacts?.primary;
    if (!slot) {
      throw new Refused(
        updater
          ? `${path.relative(root, reportPath)} carries no updater artefact, so nothing in it covers ${path.basename(file)}. A latest.json naming an unjudged payload is the one thing the feed must never say.`
          : `${path.relative(root, reportPath)} names no artefact.`,
      );
    }
    const got = sha256OfFile(file);
    if (got !== slot.sha256) {
      throw new Refused(
        `${path.basename(file)} is not the file that was judged.\n` +
        `    report: ${slot.sha256}\n` +
        `    file:   ${got}${HOWTO(path.relative(root, reportPath))}`,
      );
    }
  }

  // Ancestry: the report has to be about code that is on this branch. A shallow
  // clone answers "no" to every ancestor question for the wrong reason, so it
  // is a refusal to judge rather than a judgement.
  let shallow = "false";
  try { shallow = git(["rev-parse", "--is-shallow-repository"], root); } catch { shallow = "false"; }
  if (shallow === "true") {
    throw new Refused("cannot judge ancestry in a shallow clone — set GIT_DEPTH: 0 on this job.", 2);
  }
  for (const [label, sha] of [["built_from.commit", report.built_from?.commit], ["suite_commit", report.suite_commit]]) {
    if (!sha) throw new Refused(`${path.relative(root, reportPath)} has no ${label}.`);
    if (!commitExists(sha, root)) throw new Refused(`${path.relative(root, reportPath)} names ${label} ${String(sha).slice(0, 12)}, which is not a commit in this repository.`);
    if (!isAncestor(sha, trunk, root)) throw new Refused(`${path.relative(root, reportPath)} names ${label} ${String(sha).slice(0, 7)}, which is not an ancestor of ${trunk}.`);
  }

  return { ok: true, report, reportPath };
}

/** The override, checked before anything else so it also covers a missing report. */
export function overrideOr(fn, { version, platform, file, reportsDir = "quality/reports", root = process.cwd() }) {
  const raw = process.env.PDFLUENT_PUBLISH_WITHOUT_REPORT;
  if (raw === undefined || raw === "") return fn();
  if (!/^#?\d+$/.test(raw.trim())) {
    console.error("✘ PDFLUENT_PUBLISH_WITHOUT_REPORT needs a ticket number (digits, optionally with a leading #). An override without a ticket is an override nobody has to answer for.");
    process.exit(1);
  }
  const ticket = raw.trim().replace(/^#/, "");
  const platformKey = platformKeyFor(platform);
  const outPath = path.resolve(root, reportsDir, `${version}-${platformKey}.override.json`);
  mkdirSync(path.dirname(outPath), { recursive: true });
  const sha = file && existsSync(file) ? sha256OfFile(file) : null;
  let by = "";
  try { by = git(["config", "user.email"], root); } catch { by = ""; }
  writeFileSync(outPath, JSON.stringify({ ticket, sha256: sha, file: file ? path.basename(file) : null, platform: platformKey, version, date: new Date().toISOString(), by }, null, 2) + "\n", "utf8");
  console.error(`OVERRIDE ticket #${ticket}: publishing ${file ? path.basename(file) : version} (sha256 ${sha ?? "unknown"}) without a PASS report — recorded in ${path.relative(root, outPath)}`);
  return { ok: true, overridden: true };
}

const PRIMARY = /\.(dmg|msi|AppImage)$/i;

function artefactsIn(dir) {
  const found = [];
  for (const sub of ["macos", "windows", "linux"]) {
    const d = path.join(dir, sub);
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d)) {
      if (!PRIMARY.test(f)) continue;
      found.push({ platform: sub === "macos" ? "macos" : sub === "windows" ? "windows" : "linux", file: path.join(d, f) });
    }
  }
  return found;
}

function updaterPayloadsIn(dir) {
  const found = [];
  for (const sub of ["macos", "windows", "linux"]) {
    const d = path.join(dir, sub);
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d)) {
      if (!f.endsWith(".sig")) continue;
      const payload = path.join(d, f.replace(/\.sig$/, ""));
      if (!existsSync(payload) || !statSync(payload).isFile()) continue;
      found.push({ platform: sub === "macos" ? "macos" : sub === "windows" ? "windows" : "linux", file: payload });
    }
  }
  return found;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
// Run directly, not imported -- compared as paths, both resolved.
//
// The usual spelling of this test compares `import.meta.url` to
// `file://${process.argv[1]}`. One is a URL and percent-encodes a space, the
// other is a path and does not, so on any checkout whose path contains one the
// comparison is quietly false: the module loads, defines everything and does
// nothing. The nightly keeps its checkout under ~/Library/Application Support,
// and the first run there made every probe, printed every skip, wrote no report
// and exited 0. Node also resolves a symlinked entry point before filling in
// import.meta.url, which the same comparison gets wrong in the other direction.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const k = argv[i].slice(2);
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) a[k] = true;
      else { a[k] = v; i++; }
    }
  }
  const root = process.cwd();
  const version = a.version && a.version !== true ? String(a.version) : null;
  if (!version) { console.error("✘ --version is required"); process.exit(1); }
  const reportsDir = a["reports-dir"] && a["reports-dir"] !== true ? String(a["reports-dir"]) : "quality/reports";
  const trunk = a.trunk && a.trunk !== true ? String(a.trunk) : "HEAD";
  const updater = a.updater === true;

  let targets = [];
  if (a.artifacts && a.artifacts !== true) {
    const dir = path.resolve(root, String(a.artifacts));
    targets = updater ? updaterPayloadsIn(dir) : artefactsIn(dir);
    if (!targets.length) {
      console.error(`✘ no ${updater ? "updater payloads" : "artefacts"} under ${path.relative(root, dir)}/{macos,windows,linux}/ — nothing to judge, and nothing to publish.`);
      process.exit(1);
    }
    // Linux is out of scope for the gated release; it is skipped here rather
    // than refused, so a Linux artefact that happens to be present does not
    // stop the macOS and Windows publish it has nothing to do with.
    targets = targets.filter((t) => {
      if (t.platform === "linux") { console.error(`SKIPPED (not a pass): ${path.basename(t.file)} — Linux is not a gated release platform`); return false; }
      return true;
    });
  } else if (a.file && a.file !== true) {
    const file = path.resolve(root, String(a.file));
    if (!existsSync(file)) { console.error(`✘ --file not found: ${file}`); process.exit(1); }
    const platform = a.platform && a.platform !== true ? String(a.platform) : null;
    if (!platform) { console.error("✘ --platform is required with --file"); process.exit(1); }
    targets = [{ platform, file }];
  } else {
    console.error("✘ provide --file <path> --platform <key>, or --artifacts <dir>");
    process.exit(1);
  }

  try {
    for (const t of targets) {
      const result = overrideOr(
        () => requireQualityReport({ version, platform: t.platform, file: t.file, reportsDir, trunk, updater, root }),
        { version, platform: t.platform, file: t.file, reportsDir, root },
      );
      if (!result.overridden) {
        console.log(`✓ ${path.basename(t.file)} — ${path.relative(root, result.reportPath)} says PASS and covers exactly these bytes`);
      }
    }
  } catch (e) {
    if (e instanceof Refused) { console.error(`✘ ${e.message}`); process.exit(e.code); }
    throw e;
  }
}

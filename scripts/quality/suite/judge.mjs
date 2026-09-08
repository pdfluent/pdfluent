#!/usr/bin/env node
// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// judge.mjs — the one place a tool's exit code or output text is interpreted.
//
// The suite is split in two on purpose. Probes touch tools and the app and are
// the only part that needs a Mac, a signed artefact or a build host; judgement
// reads what a probe wrote and decides PASS / FAIL / SKIPPED. Judgement runs
// identically everywhere, so the Linux runner can drive every case through the
// fake driver and a wrong reading of `spctl` output is caught on every push
// instead of on a release evening.
//
// A probe whose output file is absent is SKIPPED, never PASS: a step that did
// not run has not agreed with anything.
//
//   node judge.mjs --work <dir> --step S1 --checks 'codesign,spctl@spctl_app'
//
// Check syntax: `<id>[@<probe>]`. The probe name defaults to the id with the
// colon and dashes turned into underscores.

import { readFileSync, existsSync, appendFileSync, statSync } from "node:fs";
import { walkTargets, judgeWalk } from "./ui_walk.mjs";
import { createHash } from "node:crypto";
import path from "node:path";

// Windows PowerShell's `Set-Content -Encoding utf8` writes a byte order mark
// first, and every judge that anchors a pattern to the start of a probe then
// matches the mark instead of the text. The first real run on the build host
// reported a correctly signed installer as "no RESULT line", for that reason
// alone. Stripped here, once, rather than in each judge: the next tool to write
// a probe on that platform will do the same thing.
const withoutBom = (s) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

export function readProbe(work, name) {
  const outPath = path.join(work, "probes", `${name}.out`);
  const rcPath = path.join(work, "probes", `${name}.rc`);
  if (!existsSync(outPath) && !existsSync(rcPath)) return { missing: true, out: "", rc: null };
  return {
    missing: false,
    out: existsSync(outPath) ? withoutBom(readFileSync(outPath, "utf8")) : "",
    rc: existsSync(rcPath) ? Number.parseInt(withoutBom(readFileSync(rcPath, "utf8")).trim(), 10) : 0,
  };
}

const pass = (numbers = {}) => ({ status: "PASS", reason: "", numbers });
const fail = (reason, numbers = {}) => ({ status: "FAIL", reason, numbers });
const skip = (reason) => ({ status: "SKIPPED", reason, numbers: {} });
const na = (reason) => ({ status: "NOT_APPLICABLE", reason, numbers: {} });

const firstLine = (s) => s.split("\n").map((l) => l.trim()).filter(Boolean)[0] ?? "";

/**
 * Every check the suite can make. `capability` is the axis vocabulary the run
 * files use (#412), so a report row can be read next to a ratchet row.
 */
export const JUDGES = {
  // ── S0 preflight ───────────────────────────────────────────────────────────
  preflight: {
    step: "S0", capability: "suite",
    run: (p) => (p.rc === 0 ? pass() : fail(firstLine(p.out) || `preflight rc ${p.rc}`)),
  },

  // ── S1 identity ────────────────────────────────────────────────────────────
  mount: {
    step: "S1", capability: "artefact",
    run: (p) => (p.rc === 0 && firstLine(p.out) ? pass() : fail(`could not mount the artefact: ${firstLine(p.out) || `rc ${p.rc}`}`)),
  },
  version: {
    step: "S1", capability: "artefact", probe: "bundle_version",
    run: (p, meta) => {
      const got = firstLine(p.out);
      if (!got) return fail("the bundle reports no version string");
      // The exact string, not the numeric core: 1.0.0 and 1.0.0-beta.21 are
      // different builds and a suite that cannot tell them apart certifies the
      // wrong bytes.
      if (got === meta.expected_version) return pass({ bundle_version: got });
      // Except in an MSI, where it cannot be. Windows Installer's
      // ProductVersion is numeric and holds no prerelease tag, so Tauri names
      // the installer by the numeric core; comparing the whole string there
      // fails every prerelease build for a reason about the format rather than
      // about the bytes. What it costs is checked, not waved through: the full
      // string is asserted in S2 against what the running binary writes into
      // its own session log, so a 1.0.0 installer claiming to be beta.21 is
      // still caught -- by the binary, not by the package metadata.
      const core = String(meta.expected_version).split("-")[0];
      if (meta.platform === "windows" && got === core) {
        return pass({ bundle_version: got, expected_version: meta.expected_version });
      }
      return fail(`bundle ${got} != package.json ${meta.expected_version}`, { bundle_version: got });
    },
  },
  bundle_id: {
    step: "S1", capability: "artefact",
    run: (p, meta) => {
      const got = firstLine(p.out);
      return got === meta.expected_bundle_id ? pass() : fail(`bundle identifier ${got || "(none)"} != ${meta.expected_bundle_id}`);
    },
  },
  codesign: {
    step: "S1", capability: "signature", probe: "codesign_verify",
    run: (p) => {
      if (p.rc !== 0) return fail(`codesign --verify rc ${p.rc}: ${firstLine(p.out)}`);
      const info = readProbe(p.work, "codesign_info");
      if (info.missing) return skip("codesign -dv output was not captured");
      if (!/^Authority=Developer ID Application: Innovation Trigger/m.test(info.out)) {
        return fail("no `Authority=Developer ID Application: Innovation Trigger` line in codesign -dv output");
      }
      if (!/^CodeDirectory .*\bflags=.*runtime/m.test(info.out)) {
        return fail("the signature does not carry the hardened runtime flag");
      }
      const team = /^TeamIdentifier=(\S+)/m.exec(info.out);
      return pass({ team_identifier: team ? team[1] : null });
    },
  },
  // `accepted` on its own line. `spctl` prints `rejected` together with a
  // `source=` line, and a substring match on either word reads a rejection as
  // an acceptance — the exact mutation this parser exists to survive.
  spctl: {
    step: "S1", capability: "signature", probe: "spctl_app",
    run: (p) => {
      if (/^\s*\S.*:\s*rejected\s*$/m.test(p.out)) {
        const src = /^\s*source=(.*)$/m.exec(p.out);
        return fail(`spctl rejected the app${src ? ` (source=${src[1].trim()})` : ""}`);
      }
      if (!/^\s*\S.*:\s*accepted\s*$/m.test(p.out)) return fail(`spctl did not accept the app: ${firstLine(p.out) || `rc ${p.rc}`}`);
      if (p.rc !== 0) return fail(`spctl printed accepted but exited ${p.rc}`);
      const src = /^\s*source=(.*)$/m.exec(p.out);
      // Recorded verbatim rather than asserted: the wording of this line is
      // Apple's and has changed between releases.
      return pass({ spctl_source: src ? src[1].trim() : null });
    },
  },
  stapler: {
    step: "S1", capability: "signature", probe: "stapler_app",
    run: (p) => (p.rc === 0 ? pass() : fail(`stapler validate rc ${p.rc}: ${firstLine(p.out) || "no ticket stapled"}`)),
  },
  authenticode: {
    step: "S1", capability: "signature",
    run: (p) => {
      // PowerShell exits 0 whatever the signature says, so the text decides.
      const m = /^RESULT authenticode=(\S+)/m.exec(p.out);
      if (!m) return fail("no `RESULT authenticode=` line in the probe output");
      return m[1] === "PASS" ? pass() : fail(`Authenticode ${m[1]}`);
    },
  },
  msi_install: {
    step: "S1", capability: "artefact",
    run: (p) => (p.rc === 0 ? pass() : fail(`msiexec /i exited ${p.rc}: ${firstLine(p.out)}`)),
  },
  embed: {
    step: "S1", capability: "artefact", probe: "embed_gate",
    run: (p) => (p.rc === 0 ? pass() : fail(`the artefact embeds a frontend that is not this dist/: ${firstLine(p.out)}`)),
  },
  entitlements: {
    step: "S1", capability: "artefact",
    run: (p) => {
      const sandboxed = /com\.apple\.security\.app-sandbox/.test(p.out);
      return pass({ app_sandbox: sandboxed });
    },
  },

  // ── S2 launch, open, quit ──────────────────────────────────────────────────
  // The suite watches the application's own log for the parse mark, so an
  // application that writes no log at all cannot be judged on anything in S2.
  // Said once, here, instead of as one 60-second timeout per document: the
  // build host's July installer starts and opens its web view perfectly and
  // predates the durable log entirely, and seventeen identical timeouts read as
  // seventeen broken documents.
  applog: {
    step: "S2", capability: "open", probe: "applog_missing",
    run: (p) => fail(`the installed application wrote no log file, so no parse mark could appear: ${firstLine(p.out) || "(no path reported)"}`),
  },
  open: {
    step: "S2", capability: "open", probe: "wait_log",
    run: (p, meta, ctx) => {
      if (p.rc === 125) return fail(firstLine(p.out) || "the run stopped before this document was opened");
      if (p.rc === 124) return fail(`timeout after ${meta.open_timeout_s} s, no "document parsed OK"`);
      if (!/document parsed OK/.test(p.out)) return fail(`no "document parsed OK" in the log delta (rc ${p.rc})`);
      return pass(ctx.numbers ?? {});
    },
  },
  alive: {
    step: "S2", capability: "open",
    run: (p) => (p.rc === 0 && firstLine(p.out) ? pass() : fail("the process was gone after the document parsed")),
  },
  clean_quit: {
    step: "S2", capability: "quit", probe: "session_delta",
    run: (p, meta) => {
      const lines = p.out.split("\n").map((l) => l.trim()).filter(Boolean);
      const starts = lines.filter((l) => l.startsWith("start "));
      const quits = lines.filter((l) => l.startsWith("clean_quit "));
      if (!starts.length) return fail("sessions.log gained no `start` line for this run");
      if (!quits.length) return fail(`sessions.log has \`${starts[starts.length - 1]}\` with no matching clean_quit`);
      if (starts.length !== quits.length) return fail(`${starts.length} start lines against ${quits.length} clean_quit lines`);
      const versions = lines.map((l) => l.split(/\s+/)[2]).filter(Boolean);
      const wrong = versions.find((v) => v !== meta.expected_version);
      if (wrong) return fail(`sessions.log records version ${wrong}, this checkout is ${meta.expected_version}`);
      return pass();
    },
  },
  no_crash: {
    step: "S2", capability: "quit", probe: "crash_scan",
    run: (p) => (firstLine(p.out) ? fail(`the run left a crash record: ${firstLine(p.out)}`) : pass()),
  },
  watchdog: {
    step: "S2", capability: "quit",
    run: (p) => {
      if (!/startup watchdog/.test(p.out)) return fail("the watchdog did not report itself on a forced-timeout run");
      if (!/recovery window .* built and shown/.test(p.out)) return fail("the watchdog fired but built no recovery window");
      return pass();
    },
  },

  // ── S3 offline ─────────────────────────────────────────────────────────────
  "offline:denied": {
    step: "S3", capability: "offline", probe: "net_denied_run",
    run: (p) => {
      if (!/document parsed OK/.test(p.out)) return fail("with the network denied the app did not parse the document");
      // The updater is expected to fail without a network. Anything else that
      // fails on a denied socket is a feature that needs the internet, which is
      // the promise this step exists to check.
      const offenders = p.out
        .split("\n")
        .filter((l) => /operation not permitted|Operation not permitted|os error 1\b/.test(l))
        .filter((l) => !/updater|latest\.json/i.test(l));
      if (offenders.length) return fail(`network refusal reached the product, not just the updater: ${offenders[0].trim()}`);
      return p.rc === 0 ? pass() : fail(`the denied-network run exited ${p.rc}`);
    },
  },
  "offline:observe": {
    step: "S3", capability: "offline", probe: "net_observe",
    run: (p, meta) => {
      const allowed = new Set(meta.allowed_remotes ?? []);
      const seen = [];
      for (const line of p.out.split("\n")) {
        const m = /(\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-fA-F:]+\]):(\d+)/g;
        let hit;
        while ((hit = m.exec(line)) !== null) {
          const [, host, port] = hit;
          if (host.startsWith("127.") || host === "[::1]" || host === "0.0.0.0") continue;
          seen.push(`${host}:${port}`);
        }
      }
      const strangers = [...new Set(seen)].filter((r) => !allowed.has(r));
      if (strangers.length) return fail(`the app connected to ${strangers.join(", ")}, which is not on the allowed list`, { remotes: seen.length });
      return pass({ remotes: seen.length });
    },
  },
  "offline:allowlist": {
    step: "S3", capability: "offline",
    run: (p) => (p.rc === 0 ? pass() : fail(`the binary names an endpoint outside the allow-list: ${firstLine(p.out)}`)),
  },

  // ── S4 updater ─────────────────────────────────────────────────────────────
  "updater:sigs": {
    step: "S4", capability: "updater", handlesMissing: true,
    run: (p, meta) => {
      if (p.missing) {
        return meta.expect_updater
          ? skip("no updater artefacts staged, and --expect-updater was given")
          : na("no updater artefacts staged (direct-download build)");
      }
      return p.rc === 0 ? pass() : fail(`updater signature check rc ${p.rc}: ${firstLine(p.out)}`);
    },
  },
  // The payload the feed will point at, hashed here so the publish guard has a
  // number to compare against later. A signature says who made the bytes; this
  // says which bytes were judged.
  "updater:payload": {
    step: "S4", capability: "updater", handlesMissing: true,
    run: (p, meta) => {
      if (p.missing) {
        return meta.expect_updater
          ? skip("no updater payload staged, and --expect-updater was given")
          : na("no updater artefacts staged (direct-download build)");
      }
      if (p.rc !== 0) return fail(`could not read the updater payload: ${firstLine(p.out)}`);
      const m = /^(\S+)\s+([0-9a-f]{64})$/m.exec(p.out);
      if (!m) return fail("the updater payload beside the signature could not be hashed");
      return pass({ payload: m[1] });
    },
  },
};

export function probeNameFor(id, explicit) {
  if (explicit) return explicit;
  const j = JUDGES[id];
  if (j?.probe) return j.probe;
  return id.replace(/[:\-.]/g, "_");
}

/**
 * Numbers and durations a step measured, dropped as files beside the probes so
 * a step that dies still leaves what it had.
 */
function extras(work, id) {
  const safe = id.replace(/[^A-Za-z0-9_.-]/g, "_");
  const nf = path.join(work, "numbers", `${safe}.json`);
  const mf = path.join(work, "ms", safe);
  let numbers = {};
  if (existsSync(nf)) { try { numbers = JSON.parse(readFileSync(nf, "utf8")); } catch { numbers = {}; } }
  const ms = existsSync(mf) ? Number.parseInt(readFileSync(mf, "utf8").trim(), 10) || 0 : 0;
  return { numbers, ms };
}

/** Judge one check and return the ndjson row. Never throws on a bad probe. */
export function judgeOne(work, spec, meta) {
  const [id, explicitProbe] = String(spec).split("@");
  const key = JUDGES[id] ? id : id.split(":")[0];
  const j = JUDGES[key];
  if (!j) throw new Error(`judge: no rule for check "${id}"`);
  // `open:<document>` reads the probe written for that document; every other
  // check reads one fixed probe.
  const suffix = key !== id && key === "open" ? `_${id.slice(key.length + 1)}` : "";
  const probeName = probeNameFor(key, explicitProbe) + suffix;
  const p = { ...readProbe(work, probeName), work };
  const extra = extras(work, id);
  let verdict;
  if (p.missing) {
    verdict = j.handlesMissing
      ? j.run(p, meta, {})
      : skip(`${probeName}: the probe did not run on this platform`);
  } else {
    try {
      verdict = j.run(p, meta, { numbers: extra.numbers });
    } catch (e) {
      verdict = fail(`judging ${id} threw: ${String(e.message).split("\n")[0]}`);
    }
  }
  return {
    step: j.step,
    id,
    capability: j.capability,
    status: verdict.status,
    ms: extra.ms,
    numbers: { ...extra.numbers, ...(verdict.numbers ?? {}) },
    reason: verdict.reason ?? "",
    evidence: p.missing ? [] : [`probes/${probeName}.out`],
  };
}

/** sha256 of a file, streamed. The report never copies a probe's own claim. */
export function sha256OfFile(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

export function sizeOfFile(file) {
  return statSync(file).size;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const k = argv[i].slice(2);
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) args[k] = true;
      else { args[k] = v; i++; }
    }
  }
  const work = String(args.work);
  const meta = JSON.parse(readFileSync(path.join(work, "meta.json"), "utf8"));
  let worst = 0;

  // `announce` is false for a row the orchestrator has already announced on
  // stderr at the moment it found the gap. Saying it twice is not louder, and a
  // reader who sees one skip printed twice starts discounting the line.
  const emit = (row, announce = true) => {
    appendFileSync(path.join(work, "steps.ndjson"), JSON.stringify(row) + "\n", "utf8");
    if (row.status === "FAIL") worst = Math.max(worst, 1);
    if (row.status === "SKIPPED") {
      if (announce) process.stderr.write(`SKIPPED (not a pass): ${row.id} — ${row.reason}\n`);
      worst = Math.max(worst, 3);
    }
  };
  const judgeList = (list) => {
    for (const spec of String(list).split(",").map((s) => s.trim()).filter(Boolean)) {
      emit(judgeOne(work, spec, meta));
    }
  };

  // Two ways in, one behaviour. `--checks` judges a list now; `--queue` reads a
  // tab-separated file the orchestrator appended to as it went and judges the
  // lot in one interpreter.
  //
  // The suite is shell, so every judgement used to cost a node start: ten per
  // run, and the run itself does nothing but read files. On this machine a bare
  // `node -e ""` is about half a second of CPU, so those starts WERE the runtime
  // -- 8.9 s wall for a fake run that touches no tools, times fifteen runs in
  // the suite's own cases. Deferring them changes when a row is written, not
  // what it says: `JUDGES` already carries each check's step, so order comes
  // from the queue rather than from which subshell was alive at the time.
  if (args.queue) {
    const file = String(args.queue);
    const lines = existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean) : [];
    for (const line of lines) {
      const [kind, ...rest] = line.split("\t");
      if (kind === "J") judgeList(rest[0] ?? "");
      else if (kind === "S") {
        // A step with nothing to run says so in the report, not only on stderr.
        // A skip that leaves no row is indistinguishable from a step that
        // passed, which is what this whole file is arranged against.
        const [step, id, capability, reason] = rest;
        emit({ step, id, capability, status: "SKIPPED", ms: 0, numbers: {}, reason: reason ?? "", evidence: [] }, false);
      } else if (kind === "W") {
        // The UI walk expands here rather than in the orchestrator. The list of
        // controls comes from the register, which is a file to parse, and the
        // flush is already a node process: expanding it in shell would have
        // cost an interpreter start per run for a list the judge has to read
        // anyway.
        const root = rest[0] ?? process.cwd();
        const probe = readProbe(work, "ui_walk");
        for (const r of judgeWalk(walkTargets(root), probe.out, {
          missingProbe: probe.missing,
          missingReason: rest[1] ?? "",
        })) emit(r);
      } else {
        process.stderr.write(`judge: queue line neither J nor S: ${line.slice(0, 80)}\n`);
        worst = Math.max(worst, 1);
      }
    }
  } else {
    judgeList(args.checks || "");
  }
  process.exit(worst);
}

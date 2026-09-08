// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// The nightly run, and the summary a person reads in the morning.
//
// A nightly that goes quiet is worse than no nightly: the last report stays on
// disk, still says PASS, and reads as this morning's news. The mutation these
// cases exist for is precisely that — a run that did not happen must not be
// able to look like a run that passed.
//
// The judgement lives in a module rather than in the shell so it can be tested
// without a machine, an artefact or a night.

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { runToFile } from "../ci/run";
import { REPO_ROOT } from "./helpers";
import { summarise } from "../../scripts/quality/nightly_summary.mjs";

const NIGHT = Date.parse("2026-09-09T03:00:00Z");
const hoursBefore = (h: number) => new Date(NIGHT - h * 3600_000).toISOString();

const report = (over: Record<string, unknown> = {}) => ({
  version: "1.0.0", platform: "macos", verdict: "PASS", exit_code: 0,
  date: hoursBefore(1), run_id: "class-2026-09-09-macos-abcdef0",
  artefacts: { primary: { name: "PDFluent_1.0.0_universal.dmg", sha256: "a".repeat(64) } },
  steps: [], ...over,
});

describe("the morning summary", () => {
  it("says PASS only when every platform passed tonight", () => {
    const s = summarise([report(), report({ platform: "windows" })], { now: NIGHT });
    expect(s.verdict).toBe("PASS");
    expect(s.text).toContain("macos");
    expect(s.text).toContain("windows");
  });

  it("carries a platform that did not pass into the verdict", () => {
    const s = summarise([report(), report({ platform: "windows", verdict: "INCOMPLETE", exit_code: 3 })], { now: NIGHT });
    expect(s.verdict).toBe("INCOMPLETE");
    expect(s.text).toContain("INCOMPLETE");
  });

  it("prefers the worst verdict when platforms disagree", () => {
    const s = summarise([
      report({ platform: "windows", verdict: "INCOMPLETE", exit_code: 3 }),
      report({ verdict: "FAIL", exit_code: 1 }),
    ], { now: NIGHT });
    expect(s.verdict).toBe("FAIL");
  });

  // The mutation. Last night's PASS is on disk and tonight's run never
  // happened; a summary that reads the file and repeats it is how a quiet
  // failure survives a week of green mornings.
  it("does not repeat a report that is older than the night it reports on", () => {
    const s = summarise([report({ date: hoursBefore(30) })], { now: NIGHT });
    expect(s.verdict).not.toBe("PASS");
    expect(s.verdict).toBe("STALE");
    expect(s.text).toMatch(/stale|older than/i);
    expect(s.text).toContain("macos");
  });

  it("names a platform that produced no report at all", () => {
    const s = summarise([report()], { now: NIGHT, platforms: ["macos", "windows"] });
    expect(s.verdict).not.toBe("PASS");
    expect(s.text).toContain("windows");
  });

  it("keeps host names and local addresses out of what it prints", () => {
    const s = summarise([report({ os: "Windows 11 Pro" }), report({ platform: "windows" })], { now: NIGHT });
    expect(s.text).not.toMatch(/\b192\.168\./);
    expect(s.text).not.toMatch(/DESKTOP-/);
    expect(s.text).not.toMatch(/\/Users\//);
  });
});

describe("the nightly is scheduled somewhere that is not a hosted runner", () => {
  const plist = path.join(REPO_ROOT, "packaging/launchd/com.pdfluent.quality-nightly.plist");

  it("ships a launch agent that parses", () => {
    expect(existsSync(plist), "no launch agent in packaging/launchd").toBe(true);
    // `plutil` is macOS-only, and the pipeline runs on Linux. A tool that is
    // not there is a reason to say so, not a red gate: the case that matters
    // below reads the file itself and runs everywhere. Announced, because a
    // silent skip is indistinguishable from a pass.
    const r = runToFile("plutil", ["-lint", plist], { cwd: REPO_ROOT, env: process.env });
    if (r.status === 127 || /exec: plutil: not found|command not found/.test(r.out + r.err)) {
      console.error("SKIPPED (not a pass): plutil is macOS-only and this is not macOS");
      return;
    }
    expect(r.status, r.out + r.err).toBe(0);
  });

  it("runs the nightly script that exists, on a schedule", () => {
    const text = readFileSync(plist, "utf8");
    expect(text).toContain("scripts/quality/nightly_suite.sh");
    expect(text).toContain("StartCalendarInterval");
    expect(existsSync(path.join(REPO_ROOT, "scripts/quality/nightly_suite.sh"))).toBe(true);
  });

  // A launch agent inherits almost no environment, and this machine has an
  // x86_64 python ahead of the system one under Rosetta: an agent that takes
  // the login PATH runs a different interpreter than the terminal did, which is
  // why com.pdfluent.cleanup silently stopped running for weeks.
  it("puts the system tools first in the agent's PATH", () => {
    const text = readFileSync(plist, "utf8");
    const m = /<key>PATH<\/key>\s*<string>([^<]*)<\/string>/.exec(text);
    expect(m, "the agent inherits a PATH nobody chose").not.toBeNull();
    expect(m![1].split(":")[0]).toBe("/usr/bin");
  });

  // ~/Documents, ~/Desktop and ~/Downloads are gated by the privacy system: a
  // launch agent whose script is in one of them is refused at 03:15, and the
  // prompt that would fix it appears to nobody. The installer therefore gives
  // the nightly its own checkout under Application Support — and a per-ticket
  // worktree would be deleted out from under the agent anyway.
  it("installs a plist that points outside the gated folders", () => {
    const r = runToFile("bash", [path.join(REPO_ROOT, "scripts/quality/install-nightly.sh"), "--dry-run"],
      { cwd: REPO_ROOT, env: process.env });
    expect(r.status, r.err).toBe(0);
    expect(r.out).toContain("Library/Application Support/PDFluent/checkout");
    expect(r.out).not.toMatch(/<string>[^<]*\/Documents\//);
    expect(r.out).not.toMatch(/<string>[^<]*\/Desktop\//);
  });

  // The nightly resets its checkout to the trunk. That is safe only because it
  // owns that checkout: run by hand in a working tree, it must leave the tree
  // alone.
  it("refreshes only a checkout it owns", () => {
    const text = readFileSync(path.join(REPO_ROOT, "scripts/quality/nightly_suite.sh"), "utf8");
    const guard = /if \[ "\$\{REFRESH\}" = "1" \] && \[ "\$\{PDFLUENT_NIGHTLY_OWNED_CHECKOUT:-0\}" = "1" \]/;
    expect(text, "the reset is not behind both the flag and the owned-checkout marker").toMatch(guard);
    const resetAt = text.indexOf("git reset --hard");
    expect(resetAt).toBeGreaterThan(text.search(guard));
  });

  it("costs no hosted CI minutes", () => {
    const text = readFileSync(path.join(REPO_ROOT, "scripts/quality/nightly_suite.sh"), "utf8");
    expect(text).toContain("release_suite.sh");
    expect(text).not.toMatch(/gh workflow run|actions\/runs/);
  });
});

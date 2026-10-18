// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// `release_suite.sh --mode ci --steps ...`: the release suite's drivers run
// against an unsigned CI build in quality.yml (quality:macos, quality:windows).
//
// Three things must hold for that to be safe. A ci run must say it is one, in
// the report and in a row per thing it did not judge. It must never be able to
// stand in for a release run at the publish gate. And on the machines it runs
// on -- which are people's desktops with PDFluent installed -- it must never
// reach the installed copy: not by process name, not by bundle id, not through
// msiexec.

import { describe, it, expect } from "vitest";
import path from "node:path";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { REPO_ROOT, stageCase, suiteArgs, readReport, row, artefactBytes } from "./helpers";
import { runToFile } from "../ci/run";
import { judgeOne } from "../../scripts/quality/suite/judge.mjs";

const run = (args: string[]) => runToFile("bash", args, { cwd: REPO_ROOT, env: process.env });
const VERSION = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")).version as string;
const GUARD = path.join(REPO_ROOT, "scripts", "quality", "require-report.mjs");
const CI_ID = JSON.parse(readFileSync(path.join(REPO_ROOT, "src-tauri/tauri.ci.conf.json"), "utf8")).identifier as string;
// The fixture bundle answers with the shipped identifier; a CI build answers
// with its own.
const ciCase = () => stageCase("good", { "bundle_id.out": `${CI_ID}\n` });

describe("a ci run says what it is", () => {
  it("records the mode, the CI identifier and a row for every step it left out", () => {
    const s = ciCase();
    const r = run(suiteArgs(s, ["--mode", "ci", "--steps", "s1,s2,s3", "--keep"]));
    expect(r.status, r.err).toBe(0);
    const { json, md } = readReport(s);
    expect(json.mode).toBe("ci");
    expect(String(json.run_id)).toContain("-fake-ci-");
    expect(md).toContain("| mode | ci (not a release run; it can never publish) |");

    for (const left of ["scope:s4_updater", "scope:s5_ui_walk"]) {
      const x = row(json, left);
      expect(x, `${left} has no row: a narrowed run must not read as a full one`).toBeDefined();
      expect(x!.status).toBe("NOT_APPLICABLE");
      expect(x!.reason).toContain("not in --steps s1,s2,s3");
      expect(r.err).toContain(`SKIPPED (not a pass): ${left.slice("scope:".length)}`);
    }
    // What was in scope still ran and was judged -- the identity row against
    // the CI identifier, not the shipped one.
    expect(row(json, "preflight")!.status).toBe("PASS");
    expect(row(json, "bundle_id")!.status).toBe("PASS");
    expect(row(json, "clean_quit")!.status).toBe("PASS");

    const meta = JSON.parse(readFileSync(path.join(s.work, "meta.json"), "utf8"));
    const ci = JSON.parse(readFileSync(path.join(REPO_ROOT, "src-tauri/tauri.ci.conf.json"), "utf8"));
    expect(meta.mode).toBe("ci");
    expect(meta.expected_bundle_id).toBe(ci.identifier);
  }, 60_000);

  it("fails a ci run whose bundle carries the shipped identifier", () => {
    // The CI build is only safe on a desktop with PDFluent installed because it
    // is not that app. A CI image that came out with the shipped identifier
    // would share its container and its quit target, and must be red.
    const s = stageCase("good");
    expect(run(suiteArgs(s, ["--mode", "ci", "--steps", "s1,s2,s3"])).status).toBe(1);
    expect(row(readReport(s).json, "bundle_id")!.status).toBe("FAIL");
  }, 60_000);

  it("leaves a release run exactly as it was", () => {
    const s = stageCase("good");
    expect(run(suiteArgs(s, ["--keep"])).status).toBe(0);
    const { json, md } = readReport(s);
    expect(json.mode).toBe("release");
    expect(md).not.toContain("| mode |");
    expect((json.steps as { id: string }[]).some((x) => x.id.startsWith("scope:"))).toBe(false);
    const meta = JSON.parse(readFileSync(path.join(s.work, "meta.json"), "utf8"));
    expect(meta.expected_bundle_id).toBe("com.pdfluent.app");
  }, 60_000);

  it("refuses a mode or a step it does not know, before it runs anything", () => {
    const s = stageCase("good");
    const bad = run(suiteArgs(s, ["--mode", "nightly"]));
    expect(bad.status).toBe(2);
    expect(bad.err).toContain("--mode must be release or ci");
    const step = run(suiteArgs(s, ["--steps", "s1,s9"]));
    expect(step.status).toBe(2);
    expect(step.err).toContain("--steps takes s1..s5");
  });
});

describe("a ci report can never publish", () => {
  it("is refused by the publish gate even when it passed", () => {
    const s = ciCase();
    expect(run(suiteArgs(s, ["--mode", "ci", "--steps", "s1,s2,s3"])).status).toBe(0);
    const { base } = readReport(s);
    const report = JSON.parse(readFileSync(`${base}.json`, "utf8"));
    expect(report.verdict).toBe("PASS");
    report.platform = "macos";

    const dir = mkdtempSync(path.join(tmpdir(), "pdfluent-ci-publish-"));
    const reports = path.join(dir, "quality", "reports");
    mkdirSync(reports, { recursive: true });
    writeFileSync(path.join(reports, `${VERSION}-macos.json`), JSON.stringify(report, null, 2) + "\n");
    const file = path.join(dir, `PDFluent_${VERSION}_universal.dmg`);
    writeFileSync(file, artefactBytes());

    const r = runToFile("node", [GUARD, "--version", VERSION, "--file", file, "--platform", "darwin-aarch64", "--reports-dir", reports], {
      cwd: REPO_ROOT, env: { ...process.env, PDFLUENT_PUBLISH_WITHOUT_REPORT: "" },
    });
    expect(r.status).toBe(1);
    expect(r.err).toContain("is a ci run");
  }, 60_000);
});

describe("the desktop row", () => {
  // Every open row of the 1.0.0 Windows report timed out because the lane ran
  // in session 0, where WebView2 never starts. That is one fact, and it gets
  // one row that names it.
  it("fails, naming the cause, when there is no desktop session", () => {
    const s = stageCase("good", {
      "desktop_session.out": "script session 0; desktop session none for builder\n",
      "desktop_session.rc": "1\n",
    });
    const r = judgeOne(s.dir, "desktop", { expected_version: VERSION });
    expect(r.status).toBe("FAIL");
    expect(r.reason).toContain("no desktop session");
  });

  it("passes when the app had a desktop to start in", () => {
    const s = stageCase("good", {
      "desktop_session.out": "script session 1; desktop session 1 for builder\n",
      "desktop_session.rc": "0\n",
    });
    expect(judgeOne(s.dir, "desktop", { expected_version: VERSION }).status).toBe("PASS");
  });
});

describe("the CI lanes never reach the installed PDFluent", () => {
  const ps1 = readFileSync(path.join(REPO_ROOT, "scripts/quality/suite/drivers/windows.ps1"), "utf8");
  const winSh = readFileSync(path.join(REPO_ROOT, "scripts/quality/suite/drivers/windows.sh"), "utf8");
  const mac = readFileSync(path.join(REPO_ROOT, "scripts/quality/suite/drivers/macos.sh"), "utf8");

  it("unpacks the MSI on Windows instead of installing it", () => {
    const ci = ps1.slice(ps1.indexOf('if ($Mode -eq "ci") {'), ps1.indexOf("} else {", ps1.indexOf('if ($Mode -eq "ci") {')));
    expect(ci).toContain('"/a"');
    expect(ci).not.toContain('"/i"');
    // The uninstall at the end belongs to the release lane only.
    const uninstall = ps1.indexOf('"/x"');
    expect(ps1.lastIndexOf('if ($Mode -eq "release") {', uninstall)).toBeGreaterThan(ps1.indexOf("leave the machine as it was found"));
  });

  it("finds and stops the app on Windows by its path, never by its name alone", () => {
    expect(ps1).not.toMatch(/Get-Process pdfluent-desktop[^\n|]*\|\s*Stop-Process/);
    expect(ps1).toMatch(/function Get-AppUnderTest \{[^\n]*\$_\.Path -ieq \$exe/);
    expect(winSh).toMatch(/_win_local; then\n\s+# Only copies unpacked under this run's work directory/);
  });

  it("finds, quits and kills the macOS app by its path and the CI identifier in ci mode", () => {
    expect(mac).toContain('if _ci; then pgrep -f "^${APP}/Contents/MacOS/pdfluent-desktop"');
    expect(mac).toContain('tell application id \\"$(_bundle_id)\\" to quit');
    expect(mac).not.toContain("tell application id \"com.pdfluent.app\" to quit");
    expect(mac).toContain('if _ci; then open -g -a "${APP}"');
  });
});

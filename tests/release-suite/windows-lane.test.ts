// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// What the first real run on the build host found.
//
// The Windows driver was written in #411a and never executed there, so its
// probes had never been read by the judge. Running it once turned up three
// things that no amount of reading would have: PowerShell writes a byte order
// mark, `msiexec` refuses a path with forward slashes, and an MSI cannot carry
// a prerelease tag at all. Each is a case here, so the next platform to write a
// probe from a different tool does not rediscover them.

import { describe, it, expect } from "vitest";
import path from "node:path";
import { REPO_ROOT, stageCase, suiteArgs, readReport, row } from "./helpers";
import { readFileSync } from "node:fs";
import { runToFile } from "../ci/run";
import { judgeOne } from "../../scripts/quality/suite/judge.mjs";

const run = (args: string[]) => runToFile("bash", args, { cwd: REPO_ROOT, env: process.env });

describe("a probe written on Windows", () => {
  // Set-Content -Encoding utf8 on Windows PowerShell writes EF BB BF first.
  // Every judge that anchors a pattern to the start of the output then reads
  // the mark instead of the text, and the row fails for a reason that has
  // nothing to do with the artefact — which is exactly what the first run on
  // the build host reported about a correctly signed installer.
  const SIGNED = "RESULT authenticode=PASS\nsubject=CN=Innovation Trigger B.V.\n";

  it("is read the same with a byte order mark in front of it", () => {
    const clean = stageCase("good", { "authenticode.out": SIGNED, "authenticode.rc": "0\n" });
    expect(run(suiteArgs(clean)).status).toBe(0);
    expect(row(readReport(clean).json, "authenticode")!.status).toBe("PASS");

    const marked = stageCase("good", { "authenticode.out": "\ufeff" + SIGNED, "authenticode.rc": "0\n" });
    expect(run(suiteArgs(marked)).status, "a byte order mark turned a good signature into a failure").toBe(0);
    expect(row(readReport(marked).json, "authenticode")!.status).toBe("PASS");
  });
});

describe("an installer's version", () => {
  const meta = (over: Record<string, unknown> = {}) => ({
    expected_version: "1.0.0-beta.21", platform: "windows", ...over,
  });
  const probe = (work: string) => work;

  // Windows Installer's ProductVersion is numeric: it cannot hold
  // `-beta.21`, and Tauri names the MSI by the numeric core. Comparing the
  // exact string there fails every prerelease build for a reason that is about
  // the format and not about the bytes. The full string is still checked, in
  // S2, against what the running binary writes into its own session log.
  it("accepts the numeric core from an MSI, and nothing else", () => {
    const dir = stageCase("good", { "bundle_version.out": "1.0.0\n", "bundle_version.rc": "0\n" });
    const r = judgeOne(path.join(dir.dir), "version", meta());
    expect(r.status, r.reason).toBe("PASS");
    expect(r.numbers.bundle_version).toBe("1.0.0");
  });

  it("still fails an MSI from a different release line", () => {
    const dir = stageCase("good", { "bundle_version.out": "0.9.0\n", "bundle_version.rc": "0\n" });
    expect(judgeOne(path.join(dir.dir), "version", meta()).status).toBe("FAIL");
  });

  // On macOS the bundle carries the whole string, prerelease tag included, and
  // relaxing the comparison there would let 1.0.0 and 1.0.0-beta.21 certify
  // each other.
  it("keeps the exact string where the bundle can carry it", () => {
    const dir = stageCase("good", { "bundle_version.out": "1.0.0\n", "bundle_version.rc": "0\n" });
    expect(judgeOne(path.join(dir.dir), "version", meta({ platform: "macos" })).status).toBe("FAIL");
    expect(probe(dir.dir)).toBeTruthy();
  });
});

describe("the build-host lane", () => {
  // msiexec answers 1619 ("could not open this installation package") to a path
  // with forward slashes, which is what an ssh-shaped path looks like. The
  // first real run installed nothing for that reason and reported it as a
  // broken installer.
  it("hands msiexec a Windows path", () => {
    const ps1 = readFileSync(path.join(REPO_ROOT, "scripts/quality/suite/drivers/windows.ps1"), "utf8");
    expect(ps1, "the installer path is passed on unchanged").toMatch(/\.Replace\("\/", "\\"\)/);
    const useAt = ps1.indexOf("msiexec.exe");
    expect(ps1.slice(0, useAt)).toContain("$MsiPath");
  });
});

describe("an application that writes no log", () => {
  // The July installer on the build host starts, opens its web view, and never
  // writes a line: the durable log and the session pairs the suite waits for
  // landed after that build. Seventeen identical 60-second timeouts is a
  // twenty-minute run that says "the documents are broken" about bytes that
  // simply predate the marks. One row that names the cause, and no further
  // waiting, is both faster and true.
  it("names the missing log instead of timing out on every document", () => {
    const s = stageCase("good", {
      "applog_missing.out": "C:\\Users\\...\\com.pdfluent.app\\logs\\PDFluent.log\n",
      "applog_missing.rc": "1\n",
      "wait_log_fixture-acroform-1p.out": "the application wrote no log file; no further document was opened\n",
      "wait_log_fixture-acroform-1p.rc": "125\n",
    });
    expect(run(suiteArgs(s)).status).toBe(1);
    const { json } = readReport(s);

    const gap = row(json, "applog")!;
    expect(gap, "nothing in the report says the application wrote no log").toBeDefined();
    expect(gap.status).toBe("FAIL");
    expect(gap.reason).toMatch(/wrote no log/i);

    // And the document still has a row of its own, saying why it was not tried.
    const doc = row(json, "open:fixture-acroform-1p")!;
    expect(doc.status).toBe("FAIL");
    expect(doc.reason).toMatch(/no log|not (opened|tried)/i);
  });
});

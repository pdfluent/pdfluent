// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// The release quality suite, judged.
//
// These cases drive the whole orchestrator through the fake driver, which
// answers every probe from files. That is the only reason the part of the suite
// that decides what `codesign`, `spctl` and an application log MEAN can be
// tested at all on a Linux runner with no Mac and no signed artefact — and the
// deciding is where a release suite goes wrong: a parser that reads a rejection
// as an acceptance is a green run that certified nothing.
//
// Every case names the mutation it survives. Where the mutation can be made in
// data instead of in code, it is: the case tampers with a probe file and the
// assertion still has to hold.

import { describe, it, expect } from "vitest";
import { runToFile } from "../ci/run";
import { REPO_ROOT, stageCase, suiteArgs, readReport, row, rows } from "./helpers";

const run = (args: string[], env: NodeJS.ProcessEnv = {}) =>
  runToFile("bash", args, { cwd: REPO_ROOT, env: { ...process.env, ...env } });

describe("release suite — a clean artefact", () => {
  it("passes, and the report hashes the artefact itself", () => {
    const s = stageCase("good");
    const r = run(suiteArgs(s));
    expect(r.status, r.err).toBe(0);

    const { json, md } = readReport(s);
    expect(json.verdict).toBe("PASS");
    expect(json.exit_code).toBe(0);
    expect(json.machine).toBe("test-fake");
    expect((json.artefacts as { primary: { sha256: string } }).primary.sha256).toBe(s.sha256);
    expect(md).toContain(s.sha256);

    for (const step of ["S0", "S1", "S2", "S3", "S4"]) {
      expect(rows(json).some((x) => x.step === step), `no ${step} row in the report`).toBe(true);
    }
    for (const x of rows(json)) expect(x.status).toMatch(/^(PASS|FAIL|SKIPPED|NOT_APPLICABLE)$/);
  });

  // The mutation: a suite that copied `probes/sha256.out` into the report
  // instead of hashing the bytes. Here the probe lies and the report must not.
  it("ignores a probe that claims a different sha256", () => {
    const s = stageCase("good", { "sha256.out": "0".repeat(64) + "\n", "sha256.rc": "0\n" });
    const r = run(suiteArgs(s));
    expect(r.status, r.err).toBe(0);
    const { json } = readReport(s);
    expect((json.artefacts as { primary: { sha256: string } }).primary.sha256).toBe(s.sha256);
  });

  it("names what it did not measure instead of implying it did", () => {
    const s = stageCase("good");
    run(suiteArgs(s));
    const { json, md } = readReport(s);
    expect((json.not_measured as string[]).join(" ")).toMatch(/first_paint/);
    expect(md).toContain("## Not measured");
  });

  it("keeps host names and local addresses out of the report", () => {
    const s = stageCase("good");
    run(suiteArgs(s));
    const { json, md } = readReport(s);
    for (const text of [JSON.stringify(json), md]) {
      expect(text).not.toMatch(/\b192\.168\./);
      expect(text).not.toMatch(/DESKTOP-/);
    }
  });
});

describe("release suite — an artefact that should not ship", () => {
  it("fails an unsigned bundle on every signature row, and still runs the rest", () => {
    const s = stageCase("unsigned-dmg");
    const r = run(suiteArgs(s));
    expect(r.status).toBe(1);
    const { json } = readReport(s);
    for (const id of ["codesign", "spctl", "stapler"]) {
      const x = row(json, id);
      expect(x, `no ${id} row`).toBeDefined();
      expect(x!.status, `${id} should fail`).toBe("FAIL");
      expect(x!.reason.length).toBeGreaterThan(0);
    }
    // No early abort: a run that stopped at the first failure would report one
    // problem and hide four.
    for (const step of ["S2", "S3", "S4"]) {
      expect(rows(json).some((x) => x.step === step), `${step} rows disappeared after a FAIL`).toBe(true);
    }
  });

  // spctl prints `rejected` alongside a `source=` line. A parser matching
  // `accepted` or `source=` as a substring reads this as a pass.
  it("does not read a rejection as an acceptance", () => {
    const s = stageCase("good", {
      "spctl_app.out": "PDFluent.app: rejected\nsource=Notarized Developer ID\n",
      "spctl_app.rc": "3\n",
    });
    expect(run(suiteArgs(s)).status).toBe(1);
    expect(row(readReport(s).json, "spctl")!.status).toBe("FAIL");
  });

  it("fails an Authenticode result that PowerShell reported with exit 0", () => {
    const s = stageCase("invalid-authenticode");
    expect(run(suiteArgs(s)).status).toBe(1);
    const x = row(readReport(s).json, "authenticode")!;
    expect(x.status).toBe("FAIL");
    expect(x.reason).toContain("HashMismatch");
  });

  it("does not accept any line that merely mentions authenticode", () => {
    const s = stageCase("good", { "authenticode.out": "checking authenticode=... please wait\n", "authenticode.rc": "0\n" });
    expect(run(suiteArgs(s)).status).toBe(1);
    expect(row(readReport(s).json, "authenticode")!.status).toBe("FAIL");
  });

  it("fails a document that never parsed, and still opens the next one", () => {
    const s = stageCase("no-parse");
    expect(run(suiteArgs(s)).status).toBe(1);
    const { json } = readReport(s);
    const bad = row(json, "open:fixture-sample-text-3p")!;
    expect(bad.status).toBe("FAIL");
    expect(bad.reason).toContain("timeout after 60 s");
    expect(row(json, "open:fixture-acroform-1p")!.status).toBe("PASS");
  });

  it("fails a start with no matching clean quit", () => {
    const s = stageCase("no-clean-quit");
    expect(run(suiteArgs(s)).status).toBe(1);
    const x = row(readReport(s).json, "clean_quit")!;
    expect(x.status).toBe("FAIL");
    expect(x.reason).toContain("start 1789041600");
  });

  it("fails a run that talked to something it was not allowed to", () => {
    const s = stageCase("net-attempt");
    expect(run(suiteArgs(s)).status).toBe(1);
    const x = row(readReport(s).json, "offline:observe")!;
    expect(x.status).toBe("FAIL");
    expect(x.reason).toContain("93.184.216.34:443");
  });

  it("fails a bundle whose version is not this checkout's, prerelease tag included", () => {
    const s = stageCase("version-drift");
    expect(run(suiteArgs(s)).status).toBe(1);
    const x = row(readReport(s).json, "version")!;
    expect(x.status).toBe("FAIL");
    expect(x.reason).toContain("1.0.0-beta.20");
  });
});

describe("release suite — a skip is not a pass", () => {
  it("returns INCOMPLETE when a probe did not run, and says so on stderr", () => {
    const s = stageCase("good");
    const r = run(suiteArgs(s), { FAKE_MISSING_PROBE: "stapler_app" });
    expect(r.status).toBe(3);
    const { json } = readReport(s);
    expect(json.verdict).toBe("INCOMPLETE");
    const x = row(json, "stapler")!;
    expect(x.status).toBe("SKIPPED");
    expect(x.reason.length).toBeGreaterThan(0);
    expect(r.err).toContain("SKIPPED (not a pass): stapler");
  });

  it("refuses to run at all without a machine class", () => {
    const s = stageCase("good");
    const args = suiteArgs(s).filter((a, i, all) => a !== "--machine" && all[i - 1] !== "--machine");
    const r = run(args, { PDFLUENT_MACHINE_CLASS: "" });
    expect(r.status).toBe(2);
    expect(r.err).toContain("machine class");
  });

  it("refuses a machine class that is not a class", () => {
    const s = stageCase("good");
    const r = run(suiteArgs(s).map((a) => (a === "test-fake" ? "the-mac" : a)));
    expect(r.status).toBe(2);
    expect(r.err).toContain("quality/MACHINES.toml");
  });
});

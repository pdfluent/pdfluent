// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// The publish slot: nothing reaches R2 or the updater feed without a PASS
// report covering exactly the bytes being published.
//
// The binding is the sha256, not a filename and not a timestamp. A guard that
// checked the name would pass a rebuilt artefact with the same version; a guard
// that checked the age would refuse a correct report after a weekend. Every
// case below either changes the bytes or changes the report and expects a
// refusal that names both numbers.

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runToFile } from "../ci/run";
import { REPO_ROOT, stageCase, suiteArgs, readReport, artefactBytes } from "./helpers";

const GUARD = path.join(REPO_ROOT, "scripts", "quality", "require-report.mjs");
const PUBLISH = path.join(REPO_ROOT, "scripts", "publish-artifact.mjs");
const VERSION = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")).version as string;

const shallow = (() => {
  try { return execFileSync("git", ["rev-parse", "--is-shallow-repository"], { cwd: REPO_ROOT, encoding: "utf8" }).trim() === "true"; }
  catch { return false; }
})();

/**
 * A staged release directory: a PASS report for the artefact, produced by
 * actually running the suite, plus the artefact under the name the macOS
 * release publishes it as.
 */
interface Release { dir: string; reports: string; file: string; report: string }

function stageRelease(mutate?: (report: Record<string, unknown>) => void): Release {
  const s = stageCase("good");
  const r = runToFile("bash", suiteArgs(s), { cwd: REPO_ROOT, env: process.env });
  if (r.status !== 0) throw new Error(`fixture suite run failed (${r.status}): ${r.err}`);
  const { base } = readReport(s);

  const dir = mkdtempSync(path.join(tmpdir(), "pdfluent-release-"));
  const reports = path.join(dir, "quality", "reports");
  mkdirSync(reports, { recursive: true });
  const report = JSON.parse(readFileSync(`${base}.json`, "utf8"));
  report.platform = "macos";
  if (mutate) mutate(report);
  const reportPath = path.join(reports, `${VERSION}-macos.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");

  const file = path.join(dir, `PDFluent_${VERSION}_universal.dmg`);
  writeFileSync(file, artefactBytes());
  return { dir, reports, file, report: reportPath };
}

const guard = (args: string[], env: NodeJS.ProcessEnv = {}) =>
  runToFile("node", [GUARD, ...args], { cwd: REPO_ROOT, env: { ...process.env, PDFLUENT_PUBLISH_WITHOUT_REPORT: "", ...env } });

describe("require-report — the publish slot", () => {
  it("refuses when there is no report, and names the path it looked for", () => {
    const rel = stageRelease();
    const r = guard(["--version", VERSION, "--file", rel.file, "--platform", "darwin-aarch64", "--reports-dir", path.join(rel.dir, "nowhere")]);
    expect(r.status).toBe(1);
    expect(r.err).toContain(`${VERSION}-macos.json`);
    expect(r.err).toContain("release_suite.sh");
  });

  it("refuses when the report is about different bytes, and prints both shas", () => {
    const rel = stageRelease((rep) => {
      const a = rep.artefacts as { primary: { sha256: string } };
      a.primary.sha256 = a.primary.sha256.slice(0, -1) + (a.primary.sha256.endsWith("0") ? "1" : "0");
    });
    const r = guard(["--version", VERSION, "--file", rel.file, "--platform", "darwin-aarch64", "--reports-dir", rel.reports]);
    expect(r.status).toBe(1);
    expect(r.err).toContain("report:");
    expect(r.err).toContain("file:");
  });

  it("refuses a report that did not pass", () => {
    const rel = stageRelease((rep) => { rep.verdict = "FAIL"; rep.exit_code = 1; });
    const r = guard(["--version", VERSION, "--file", rel.file, "--platform", "darwin-aarch64", "--reports-dir", rel.reports]);
    expect(r.status).toBe(1);
    expect(r.err).toContain("FAIL");
  });

  it("refuses an INCOMPLETE report — a run that skipped a step is not a pass", () => {
    const rel = stageRelease((rep) => { rep.verdict = "INCOMPLETE"; rep.exit_code = 3; });
    expect(guard(["--version", VERSION, "--file", rel.file, "--platform", "darwin-aarch64", "--reports-dir", rel.reports]).status).toBe(1);
  });

  it("accepts a PASS report for exactly these bytes", () => {
    const rel = stageRelease();
    const r = guard(["--version", VERSION, "--file", rel.file, "--platform", "darwin-aarch64", "--reports-dir", rel.reports]);
    expect(r.status, r.err).toBe(0);
    expect(r.out).toContain("PASS");
  });

  it("refuses a report built from a commit that is not in this repository", () => {
    if (shallow) {
      process.stderr.write("SKIPPED (not a pass): shallow clone — ancestry cannot be judged; set GIT_DEPTH: 0\n");
      expect(shallow, "a shallow clone cannot run the ancestry case").toBe(false);
      return;
    }
    const rel = stageRelease((rep) => {
      (rep.built_from as { commit: string }).commit = "0".repeat(40);
    });
    const r = guard(["--version", VERSION, "--file", rel.file, "--platform", "darwin-aarch64", "--reports-dir", rel.reports]);
    expect(r.status).toBe(1);
    expect(r.err).toContain("built_from.commit");
  });

  it("refuses Linux through this path", () => {
    const rel = stageRelease();
    const r = guard(["--version", VERSION, "--file", rel.file, "--platform", "linux-x86_64", "--reports-dir", rel.reports]);
    expect(r.status).toBe(1);
    expect(r.err).toContain("Linux is not a release platform");
  });
});

describe("require-report — the override", () => {
  it("publishes on a ticket number and writes the exception down", () => {
    const rel = stageRelease();
    const r = guard(
      ["--version", VERSION, "--file", rel.file, "--platform", "darwin-aarch64", "--reports-dir", path.join(rel.dir, "nowhere")],
      { PDFLUENT_PUBLISH_WITHOUT_REPORT: "411" },
    );
    expect(r.status, r.err).toBe(0);
    expect(r.err).toContain("OVERRIDE ticket #411");
    const written = path.join(rel.dir, "nowhere", `${VERSION}-macos.override.json`);
    expect(existsSync(written), "the override left no record").toBe(true);
    const rec = JSON.parse(readFileSync(written, "utf8"));
    expect(rec.ticket).toBe("411");
    expect(rec.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(rec.date).toBeTruthy();
  });

  it("refuses an override that names no ticket", () => {
    const rel = stageRelease();
    const r = guard(
      ["--version", VERSION, "--file", rel.file, "--platform", "darwin-aarch64", "--reports-dir", path.join(rel.dir, "nowhere")],
      { PDFLUENT_PUBLISH_WITHOUT_REPORT: "yes" },
    );
    expect(r.status).toBe(1);
    expect(r.err).toContain("ticket number");
  });
});

describe("publish-artifact — refuses before it uploads", () => {
  it("dry-runs to the R2 keys it would write, once the report checks out", () => {
    const rel = stageRelease();
    const r = runToFile("node", [PUBLISH, "--version", VERSION, "--file", rel.file, "--platform", "darwin-aarch64", "--reports-dir", rel.reports, "--dry-run"], {
      cwd: REPO_ROOT,
      env: { ...process.env, PDFLUENT_PUBLISH_WITHOUT_REPORT: "", WRANGLER: "false" },
    });
    expect(r.status, r.err).toBe(0);
    expect(r.out).toContain(`would put pdfluent-releases/${VERSION}/${path.basename(rel.file)}`);
    expect(r.out).toContain("would register darwin-aarch64");
  });

  it("refuses without ever calling wrangler", () => {
    const rel = stageRelease((rep) => { rep.verdict = "FAIL"; rep.exit_code = 1; });
    // WRANGLER points at a command that fails loudly if it is ever reached, so
    // a guard that ran after the upload would show up as the wrong error.
    const r = runToFile("node", [PUBLISH, "--version", VERSION, "--file", rel.file, "--platform", "darwin-aarch64", "--reports-dir", rel.reports], {
      cwd: REPO_ROOT,
      env: { ...process.env, PDFLUENT_PUBLISH_WITHOUT_REPORT: "", WRANGLER: "false" },
    });
    expect(r.status).toBe(1);
    expect(r.err).toContain("FAIL");
    expect(r.out).not.toContain("R2 put");
  });

  it("refuses to register a name it cannot hash", () => {
    const r = runToFile("node", [PUBLISH, "--version", VERSION, "--platform", "windows-x86_64", "--filename", "PDFluent.msi", "--size", "1234"], {
      cwd: REPO_ROOT,
      env: { ...process.env, PDFLUENT_PUBLISH_WITHOUT_REPORT: "", WRANGLER: "false" },
    });
    expect(r.status).toBe(1);
    expect(r.err).toContain("cannot be covered by a quality report");
  });
});

describe("the updater feed refuses an unjudged payload", () => {
  it("ci-generate-latest-json.mjs stops when a staged platform has no report", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pdfluent-feed-"));
    mkdirSync(path.join(dir, "artifacts", "windows"), { recursive: true });
    writeFileSync(path.join(dir, "artifacts", "windows", `PDFluent_1.0.0_x64_en-US.msi.sig`), "c2ln\n");
    const r = runToFile("node", [path.join(REPO_ROOT, "scripts", "ci-generate-latest-json.mjs")], {
      cwd: dir,
      env: {
        ...process.env,
        PDFLUENT_PUBLISH_WITHOUT_REPORT: "",
        CI_COMMIT_TAG: "v1.0.0",
        CF_R2_PUBLIC_URL: "https://pdfluent.com/releases",
      },
    });
    expect(r.status).toBe(1);
    expect(r.err).toContain("quality report");
    expect(existsSync(path.join(dir, "latest.json"))).toBe(false);
  });
});

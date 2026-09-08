// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// The guard exists in code; these cases check it is also in the paths a person
// or a pipeline actually walks. A gate nothing calls is a gate nobody passes.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { runToFile } from "../ci/run";
import { REPO_ROOT } from "./helpers";

const read = (p: string) => readFileSync(path.join(REPO_ROOT, p), "utf8");

describe("the release pipeline calls the guard", () => {
  it("the release job checks the reports before the R2 loop", () => {
    const ci = read(".gitlab-ci.yml");
    const job = ci.slice(ci.indexOf("\nrelease:"), ci.indexOf("\npublish-updater:"));
    expect(job).toContain("scripts/quality/require-report.mjs");
    const guardAt = job.indexOf("require-report.mjs");
    const uploadAt = job.indexOf("wrangler r2 object put");
    expect(guardAt).toBeGreaterThan(-1);
    expect(uploadAt).toBeGreaterThan(-1);
    expect(guardAt, "the guard runs after the upload, which makes it a log line rather than a gate").toBeLessThan(uploadAt);
  });

  it("the release job has the ancestry it needs to judge", () => {
    const ci = read(".gitlab-ci.yml");
    const job = ci.slice(ci.indexOf("\nrelease:"), ci.indexOf("\npublish-updater:"));
    expect(job).toMatch(/GIT_DEPTH:\s*0/);
  });

  it("the fast gate is not shallow, so the guard's own cases can run", () => {
    const ci = read(".gitlab-ci.yml");
    const job = ci.slice(ci.indexOf("\nquality-gates-fast:"), ci.indexOf("\n# ─── Repository truth"));
    expect(job).toMatch(/GIT_DEPTH:\s*0/);
  });

  it("quality/ is internal until its numbers have CLAIMS IDs", () => {
    const tree = JSON.parse(read("docs/PUBLIC_TREE.json")) as { internal: { path: string; why: string }[] };
    const entry = tree.internal.find((e) => e.path === "quality");
    expect(entry, "quality/ is not marked internal in docs/PUBLIC_TREE.json").toBeDefined();
    expect(entry!.why.length).toBeGreaterThan(20);
  });
});

describe("the build scripts stop before publishing", () => {
  for (const script of ["scripts/release-windows-remote.sh", "scripts/release-macos.sh"]) {
    it(`${script} does not publish what it just built`, () => {
      const src = read(script);
      expect(src, `${script} still publishes inline; the artefact reaches users before anything judges it`).not.toContain("publish-artifact.mjs");
      expect(src).toContain("release_suite.sh");
      expect(src).toContain("publish-release.sh");
    });
  }

  it("publish-release.sh is the guarded path, and npm knows it", () => {
    const src = read("scripts/publish-release.sh");
    expect(src).toContain("require-report.mjs");
    expect(src).toContain("publish-artifact.mjs");
    const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    expect(pkg.scripts["publish:release"]).toContain("publish-release.sh");
  });

  it("staging latest.json checks the payloads it is about to name", () => {
    expect(read("scripts/stage-latest-json.sh")).toContain("require-report.mjs");
  });
});

describe("the committed reports are the ones the suite renders", () => {
  it("every report's markdown matches its JSON", () => {
    const dir = path.join(REPO_ROOT, "quality", "reports");
    const reports = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json") && !f.endsWith(".override.json")) : [];
    expect(reports.length, "no committed reports to check").toBeGreaterThan(0);
    for (const f of reports) {
      const r = runToFile("node", [path.join(REPO_ROOT, "scripts/quality/suite/report.mjs"), "--check", path.join(dir, f)], { cwd: REPO_ROOT, env: process.env });
      expect(r.status, `${f}: ${r.err}`).toBe(0);
    }
  });

  it("no report leaks a host name, a local address or a user path", () => {
    const dir = path.join(REPO_ROOT, "quality", "reports");
    for (const f of existsSync(dir) ? readdirSync(dir) : []) {
      const text = readFileSync(path.join(dir, f), "utf8");
      expect(text, `${f} names a private address`).not.toMatch(/\b192\.168\./);
      expect(text, `${f} names a host`).not.toMatch(/DESKTOP-/);
      expect(text, `${f} names a user path`).not.toMatch(/\/Users\//);
    }
  });
});

describe("the documents a person follows name the suite", () => {
  it("the GA runbook has the suite between build and publish", () => {
    const doc = read("docs/RELEASE_RUNBOOK_GA.md");
    expect(doc).toContain("scripts/quality/release_suite.sh");
    expect(doc).toContain("quality/reports/");
  });

  it("RELEASE.md names it too", () => {
    expect(read("RELEASE.md")).toContain("scripts/quality/release_suite.sh");
  });

  it("the release gate in AGENTS.md includes it", () => {
    const agents = read("AGENTS.md");
    const gate = agents.slice(agents.indexOf("### Release gate"), agents.indexOf("### Release gate") + 900);
    expect(gate).toContain("release_suite.sh");
  });
});

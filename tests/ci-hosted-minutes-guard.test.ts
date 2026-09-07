// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const GUARD = join(ROOT, "scripts/ci/no-hosted-ci-on-auto-triggers.mjs");

const scratch = mkdtempSync(join(tmpdir(), "pdfluent-ci-guard-"));
let caseCount = 0;

function runGuardOn(workflow: string) {
  const directory = join(scratch, `case-${(caseCount += 1)}`);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "workflow.yml"), workflow, "utf8");
  const result = spawnSync(process.execPath, [GUARD, directory], { encoding: "utf8" });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

afterAll(() => {
  // Left in place on purpose: the OS reclaims the temp dir, and keeping the
  // fixtures around is what makes a failing run readable.
});

describe("no hosted GitHub-Actions minutes on automatic triggers", () => {
  it("rejects a hosted runner on push", () => {
    const { status, output } = runGuardOn(
      ["name: X", "on:", "  push:", "    branches: [main]", "jobs:", "  a:", "    runs-on: ubuntu-latest"].join("\n"),
    );
    expect(status).toBe(1);
    expect(output).toContain("ubuntu-latest");
  });

  it("rejects a hosted runner reached through a matrix on pull_request", () => {
    const { status, output } = runGuardOn(
      [
        "name: X",
        "on: [pull_request]",
        "jobs:",
        "  a:",
        "    runs-on: ${{ matrix.platform }}",
        "    strategy:",
        "      matrix:",
        "        include:",
        "          - platform: macos-latest",
        "          - platform: windows-latest",
      ].join("\n"),
    );
    expect(status).toBe(1);
    expect(output).toContain("macos-latest");
  });

  it("rejects a hosted runner on a tag push", () => {
    // A tag is still an automatic trigger: nobody presses a button, the minutes
    // are billed, and the release train already runs on GitLab.
    const { status } = runGuardOn(
      ["name: X", "on:", "  push:", "    tags:", '      - "v*"', "jobs:", "  a:", "    runs-on: ubuntu-22.04"].join("\n"),
    );
    expect(status).toBe(1);
  });

  it("rejects a hosted runner on a schedule", () => {
    const { status } = runGuardOn(
      ["name: X", "on:", "  schedule:", '    - cron: "0 3 * * *"', "jobs:", "  a:", "    runs-on: ubuntu-latest"].join("\n"),
    );
    expect(status).toBe(1);
  });

  it("accepts a hosted runner behind workflow_dispatch", () => {
    const { status } = runGuardOn(
      ["name: X", "on:", "  workflow_dispatch:", "jobs:", "  a:", "    runs-on: ubuntu-latest"].join("\n"),
    );
    expect(status).toBe(0);
  });

  it("accepts a self-hosted runner on push", () => {
    const { status } = runGuardOn(
      ["name: X", "on:", "  push:", "jobs:", "  a:", "    runs-on: [self-hosted, linux]"].join("\n"),
    );
    expect(status).toBe(0);
  });

  it("does not read a shell heredoc as configuration", () => {
    const { status } = runGuardOn(
      [
        "name: X",
        "on:",
        "  workflow_dispatch:",
        "jobs:",
        "  a:",
        "    runs-on: [self-hosted, linux]",
        "    steps:",
        "      - run: |",
        "          echo 'runs-on: ubuntu-latest'",
      ].join("\n"),
    );
    expect(status).toBe(0);
  });

  it("passes on this repository's own workflows", () => {
    const result = spawnSync(process.execPath, [GUARD, join(ROOT, ".github/workflows")], {
      encoding: "utf8",
    });
    expect(`${result.stdout}${result.stderr}`).toBe(
      `no-hosted-ci-on-auto-triggers: OK (${join(ROOT, ".github/workflows")})\n`,
    );
    expect(result.status).toBe(0);
  });
});

describe("the release branch is gated by more than a typecheck", () => {
  const ci = readFileSync(join(ROOT, ".gitlab-ci.yml"), "utf8");
  const jobBody = (name: string) => {
    const start = ci.indexOf(`\n${name}:\n`);
    expect(start, `${name} is not a job in .gitlab-ci.yml`).toBeGreaterThan(-1);
    const next = ci.indexOf("\n\n#", start + 1);
    return ci.slice(start, next === -1 ? ci.length : next);
  };

  // beta.21 shipped without any of these ever running: they were tag-only, and
  // the last tag was beta.20 (2026-07-15).
  for (const name of ["cargo-test", "clippy", "native-smoke", "playwright"]) {
    it(`runs ${name} on a push to a release branch`, () => {
      const body = jobBody(name);
      expect(body).toContain("$CI_COMMIT_BRANCH =~ /^(main|release\\/)/");
      expect(body, `${name} is allow_failure — a soft gate is not a gate`).not.toContain(
        "allow_failure: true",
      );
      expect(body, `${name} must run on our own runner`).toContain("pdfluent-editor-linux");
    });
  }

  it("pins the SDK checkout to a revision instead of a moving branch", () => {
    expect(ci).toContain("XFA_SDK_REV:");
    // A `--branch <name>` clone is what made three machines build three SDKs.
    expect(ci).not.toContain("--branch xfa/sdk-phase2-commit-loop");
  });

  it("runs the hosted-minutes guard in the fast gate", () => {
    const fast = ci.slice(ci.indexOf("quality-gates-fast:"), ci.indexOf("\ncargo-test:"));
    expect(fast).toContain("scripts/ci/no-hosted-ci-on-auto-triggers.mjs");
  });
});

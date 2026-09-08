// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

describe("every job in .github/workflows runs on our own runner", () => {
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
    // are billed, and the release train already runs on our own machine.
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

  // Until 2026-09-08 this case expected 0: a hosted runner was allowed as long
  // as a human started it. That exemption made sense while GitHub carried no
  // gates at all. It does not survive #465: the pipeline lives here now, and a
  // dispatched hosted minute is billed exactly like a pushed one.
  it("rejects a hosted runner behind workflow_dispatch", () => {
    const { status, output } = runGuardOn(
      ["name: X", "on:", "  workflow_dispatch:", "jobs:", "  a:", "    runs-on: ubuntu-latest"].join("\n"),
    );
    expect(status).toBe(1);
    expect(output).toContain("ubuntu-latest");
  });

  it("accepts a self-hosted runner on push", () => {
    const { status } = runGuardOn(
      ["name: X", "on:", "  push:", "jobs:", "  a:", "    runs-on: [self-hosted, linux, pdfluent-editor]"].join("\n"),
    );
    expect(status).toBe(0);
  });

  it("accepts a self-hosted runner behind workflow_dispatch", () => {
    const { status } = runGuardOn(
      [
        "name: X",
        "on:",
        "  workflow_dispatch:",
        "jobs:",
        "  a:",
        "    runs-on:",
        "      - self-hosted",
        "      - linux",
        "      - pdfluent-editor",
      ].join("\n"),
    );
    expect(status).toBe(0);
  });

  // A job with no `runs-on` is a workflow that does not start rather than one
  // that runs somewhere cheap, but the guard has to say which job is wrong; an
  // unreadable job read as "fine" is how the 2026-08-21 runs got through.
  it("rejects a job with no runs-on at all", () => {
    const { status, output } = runGuardOn(
      ["name: X", "on:", "  push:", "jobs:", "  a:", "    steps:", "      - run: echo hi"].join("\n"),
    );
    expect(status).toBe(1);
    expect(output).toContain("no runs-on");
  });

  // A reusable workflow outside this repository takes its runner with it, and
  // nothing here can read that file.
  it("rejects a reusable workflow from another repository", () => {
    const { status, output } = runGuardOn(
      ["name: X", "on:", "  push:", "jobs:", "  a:", "    uses: some-org/some-repo/.github/workflows/build.yml@v1"].join("\n"),
    );
    expect(status).toBe(1);
    expect(output).toContain("some-org/some-repo");
  });

  it("accepts a reusable workflow from this repository", () => {
    const { status } = runGuardOn(
      ["name: X", "on:", "  push:", "jobs:", "  a:", "    uses: ./.github/workflows/quality.yml"].join("\n"),
    );
    expect(status).toBe(0);
  });

  it("names the offending job, not only the file", () => {
    const { status, output } = runGuardOn(
      [
        "name: X",
        "on:",
        "  push:",
        "jobs:",
        "  good-one:",
        "    runs-on: [self-hosted, linux]",
        "  bad-one:",
        "    runs-on: ubuntu-latest",
      ].join("\n"),
    );
    expect(status).toBe(1);
    expect(output).toContain("bad-one");
    expect(output).not.toContain("good-one");
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
  const ci = readFileSync(join(ROOT, ".github/workflows/quality.yml"), "utf8");
  const jobBody = (name: string) => {
    const start = ci.indexOf(`\n    name: ${name}\n`);
    expect(start, `${name} is not a job in .github/workflows/quality.yml`).toBeGreaterThan(-1);
    const next = ci.indexOf("\n  ", ci.indexOf("steps:", start));
    const end = ci.indexOf("\n\n  # ", start);
    return ci.slice(start, end === -1 ? (next === -1 ? ci.length : ci.length) : end);
  };

  // beta.21 shipped without any of these ever running: they were tag-only, and
  // the last tag was beta.20 (2026-07-15). The trigger is asserted once, for
  // the workflow that carries them all, rather than per job: on GitHub the jobs
  // do not each carry a rule.
  it("runs the whole gate set on a push to a release branch", () => {
    expect(ci).toMatch(/^on:\n {2}push:\n {4}branches:\n {6}- main\n {6}- "release\/\*\*"\n {2}pull_request:$/m);
  });

  for (const name of [
    "cargo-test",
    "clippy",
    "native-smoke",
    "playwright",
    // The save round-trip gate. It was written as a branch job on purpose:
    // tag-only is how the four above went unrun between beta.20 and beta.21.
    "quality:golden-roundtrip",
    // The PDF/A conversion gate. Same reason again: the claim it protects is
    // the one the plan calls the strongest, and it had no test at all.
    "quality:golden-pdfa",
    // The four-axis ratchet. Same reason, and one more: a baseline that is
    // only judged at tag time is a baseline that drifts for a whole release.
    "quality:axes",
    "quality:offline-allowlist",
  ]) {
    it(`runs ${name} on our own runner, hard`, () => {
      const body = jobBody(name);
      expect(body, `${name} is continue-on-error — a soft gate is not a gate`).not.toContain(
        "continue-on-error: true",
      );
      expect(body, `${name} must run on our own runner`).toContain(
        "[self-hosted, linux, pdfluent-editor]",
      );
    });
  }

  it("pins the SDK checkout to a revision instead of a moving branch", () => {
    expect(ci).toContain("XFA_SDK_REV:");
    // A `--branch <name>` clone is what made three machines build three SDKs.
    expect(ci).not.toContain("--branch xfa/sdk-phase2-commit-loop");
  });

  // The offline promise ("works 100% offline") and the accessibility promise
  // are both product claims with a test behind them now. A test nobody runs is
  // the failure mode this file exists for, so the wiring is asserted too.
  it("scans the shipped bundle for undeclared origins", () => {
    expect(jobBody("quality:offline-allowlist")).toContain(
      "scripts/ci/offline-allowlist.mjs --config --tree dist",
    );
  });

  it("keeps the accessibility spec inside the Playwright run", () => {
    expect(existsSync(join(ROOT, "tests/e2e/accessibility.spec.ts"))).toBe(true);
    const config = readFileSync(join(ROOT, "playwright.config.ts"), "utf8");
    // The job runs `npx playwright test` unfiltered, so the only way to lose
    // the spec is to exclude it here.
    expect(config).not.toContain("accessibility");
    expect(jobBody("playwright")).toContain("npx playwright test");
  });

  it("runs the hosted-minutes guard in the fast gate", () => {
    const fast = ci.slice(ci.indexOf("  quality-gates-fast:"), ci.indexOf("\n  repo-truth:"));
    expect(fast).toContain("scripts/ci/no-hosted-ci-on-auto-triggers.mjs");
  });
});

// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

// The runner is a shell executor, and everything a job does to the machine
// outlives the job unless it is scoped. Read the whole pipeline, not one file:
// the credential rewrite lives in the composite action and the jobs that use it
// live in the workflows.
const WORKFLOWS = join(ROOT, ".github/workflows");
const sources = [
  ...readdirSync(WORKFLOWS)
    .filter((name) => name.endsWith(".yml"))
    .map((name) => join(WORKFLOWS, name)),
  join(ROOT, ".github/actions/sdk-pin/action.yml"),
];
const ci = sources.map((file) => readFileSync(file, "utf8")).join("\n");

/** Configuration lines, with comments and blank lines removed. */
function statements(): string[] {
  return ci
    .split("\n")
    .filter((line) => line.trim() !== "" && !line.trim().startsWith("#"));
}

describe("the runner keeps nothing a job leaves behind", () => {
  it("never writes git configuration into the runner user's home", () => {
    // Our runner is a shell executor: `git config --global` writes to the
    // runner user's ~/.gitconfig and stays there after the job ends. The
    // engine's URL rewrite carries XFA_CLONE_TOKEN, so that line left the PAT
    // in plaintext on the machine, outliving the pipeline and surviving a
    // rotation of the token it holds. Use GIT_CONFIG_COUNT/KEY/VALUE instead:
    // every git process the job starts reads them, cargo's own fetch included,
    // and they end with the job.
    const offenders = statements().filter((line) => /git config\s+--global/.test(line));
    expect(
      offenders,
      "git config --global leaves configuration (and any token in it) on the runner",
    ).toEqual([]);
  });

  it("scopes every scratch path under /tmp to the job", () => {
    // A shared /tmp/engine-pin-check meant one job's `rm -rf` deleted the
    // directory another was fetching into, and the failure it produced said
    // "the revision is not on the mirror" — a true-sounding lie about a
    // different machine. One runner makes the jobs serial today; a second one
    // is a `svc.sh install` away, and this is what keeps that from being a
    // discovery.
    const offenders = statements()
      .filter((line) => line.includes("/tmp/"))
      .filter((line) => {
        const paths = line.match(/\/tmp\/[A-Za-z0-9_.${}/-]*/g) ?? [];
        return paths.some((path) => !/GITHUB_RUN_ID|GITHUB_JOB|CI_JOB_ID/.test(path));
      });
    expect(
      offenders,
      "a /tmp path shared between concurrent jobs is a job deleting another job's work",
    ).toEqual([]);
  });

  it("still rewrites the engine URL, so neither rule was satisfied by deleting the fetch", () => {
    // Guards the two above: dropping the rewrite altogether would make both
    // pass and no job would be able to fetch the engine.
    expect(ci).toContain("GIT_CONFIG_KEY_0");
    expect(ci).toContain("insteadOf");
    expect(ci).toContain("https://github.com/pdfluent/engine");
  });
});

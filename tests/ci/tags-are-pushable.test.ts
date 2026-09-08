// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// The rule that keeps a release tag pushable, exercised on throwaway
// repositories so the cases hold offline and do not depend on what this
// checkout happens to be tagged with today.
//
// Mutation to check this is not vacuous: accept any tagger address, stop
// treating a lightweight tag as a problem, or let an empty repository pass, and
// a case here goes red.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { runToFile } from "./run";
// @ts-expect-error — a plain .mjs script with no type declarations
import { check } from "../../scripts/ci/tags-are-pushable.mjs";

const root = resolve(__dirname, "../..");
const ALIAS = "10383561+jasperdew@users.noreply.github.com";
const PERSONAL = "someone@example.invalid";

const scratch = mkdtempSync(join(tmpdir(), "tags-pushable-test-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let n = 0;
const git = (cwd: string, args: string[], email?: string) =>
  execFileSync("git", args, {
    cwd, encoding: "utf8",
    env: email ? { ...process.env, GIT_COMMITTER_EMAIL: email, GIT_COMMITTER_NAME: "Tag Test" } : process.env,
  }).trim();

/** A repository with one commit, and whatever tags the case asks for. */
function repo(): string {
  const dir = join(scratch, `r${(n += 1)}`);
  execFileSync("git", ["init", "-q", "-b", "main", dir]);
  for (const [k, v] of [["user.email", PERSONAL], ["user.name", "Tag Test"], ["commit.gpgsign", "false"]]) {
    git(dir, ["config", k, v]);
  }
  git(dir, ["commit", "-q", "--allow-empty", "-m", "one"]);
  return dir;
}

const annotate = (dir: string, name: string, email: string) =>
  git(dir, ["-c", `user.email=${email}`, "-c", "user.name=Tag Test", "tag", "-a", "-m", name, name], email);

describe("every tag can reach the primary", () => {
  it("accepts an annotated tag made with the no-reply alias", () => {
    const dir = repo();
    annotate(dir, "v9.9.9", ALIAS);
    const r = check({ cwd: dir });
    expect(r.failures, JSON.stringify(r.failures)).toEqual([]);
    expect(r.checked).toBe(1);
  });

  it("refuses a lightweight tag, because GitHub then judges the commit it points at", () => {
    const dir = repo();
    git(dir, ["tag", "rc99"]);
    const r = check({ cwd: dir });
    expect(r.failures.join("\n")).toContain("lightweight");
    expect(r.failures.join("\n")).toContain("rc99");
  });

  it("refuses an annotated tag made with a personal address", () => {
    const dir = repo();
    annotate(dir, "v8.8.8", PERSONAL);
    const r = check({ cwd: dir });
    expect(r.failures.join("\n")).toContain("v8.8.8");
    expect(r.failures.join("\n")).toContain(PERSONAL);
  });

  it("does not pass a repository whose tags it cannot see", () => {
    // A clone without tags is exactly the state in which this guard would stop
    // working without anyone noticing, so it is a failure and says why.
    const r = check({ cwd: repo() });
    expect(r.checked).toBe(0);
    expect(r.failures.join("\n")).toContain("nothing was checked");
  });

  it("exits non-zero and says what to do", () => {
    const dir = repo();
    git(dir, ["tag", "rc98"]);
    const r = runToFile(process.execPath, [resolve(root, "scripts/ci/tags-are-pushable.mjs")], {
      cwd: dir, env: { ...process.env, PDFLUENT_REPO_DIR: dir },
    });
    expect(r.status).toBe(1);
    expect(`${r.out}${r.err}`).toContain("git tag -a -f");
    // And it does not suggest the repair that would publish the addresses.
    expect(`${r.out}${r.err}`).toContain("Do NOT switch off");
  });

  it("runs in the fast gate, on our own runner", () => {
    const ci = readFileSync(resolve(root, ".github/workflows/quality.yml"), "utf8");
    const fast = ci.slice(ci.indexOf("\n  quality-gates-fast:"));
    const job = fast.slice(0, fast.indexOf("\n  repo-truth:"));
    expect(job).toContain("node scripts/ci/tags-are-pushable.mjs");
    expect(job).toContain("self-hosted, linux, pdfluent-editor");
  });
});

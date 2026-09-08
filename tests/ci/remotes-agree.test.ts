// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// The guard that refuses a trunk with one copy, exercised against a primary
// built here rather than fetched, so the cases hold offline and say the same
// thing every time.
//
// Mutation to check this is not vacuous: make the ancestry test in
// scripts/ci/remotes-agree.mjs always true, drop the "no branch on the primary"
// leg, turn the unreachable-primary throw into a pass, or take the script out of
// quality-gates-fast — each of those turns a case here red.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { runToFile } from "./run";

const root = resolve(__dirname, "../..");
// The host the guard defaults to, read from the guard rather than typed here:
// whichever copy CI runs on, the step must point somewhere else.
const PRIMARY_URL_DEFAULT_HOST = new URL(
  /PDFLUENT_PRIMARY_URL \|\| "([^"]+)"/.exec(readFileSync(resolve(root, "scripts/ci/remotes-agree.mjs"), "utf8"))![1],
).host;
const GUARD = resolve(root, "scripts/ci/remotes-agree.mjs");
const TRUNK = "release/ga-readiness";

const scratch = mkdtempSync(join(tmpdir(), "remotes-agree-test-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const git = (cwd: string, args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

let sceneCount = 0;

/**
 * A repository with a trunk, plus a bare "primary" holding that trunk at
 * `primaryAt` commits back. `primaryAt: null` means the primary has no such
 * branch at all — the state this repository was actually in on 2026-09-08.
 */
function scene(commits: number, primaryAt: number | null) {
  const dir = join(scratch, `scene-${(sceneCount += 1)}`);
  const local = join(dir, "local");
  const primary = join(dir, "primary.git");
  execFileSync("git", ["init", "-q", "--bare", primary]);
  execFileSync("git", ["init", "-q", "-b", TRUNK, local]);
  for (const [k, v] of [["user.email", "guard-test@example.invalid"], ["user.name", "Guard Test"], ["commit.gpgsign", "false"]]) {
    git(local, ["config", k, v]);
  }
  const shas: string[] = [];
  for (let i = 0; i < commits; i += 1) {
    git(local, ["commit", "-q", "--allow-empty", "-m", `commit ${i}`]);
    shas.push(git(local, ["rev-parse", "HEAD"]));
  }
  if (primaryAt !== null) git(local, ["push", "-q", primary, `${shas[primaryAt]}:refs/heads/${TRUNK}`]);
  return { local, primaryUrl: `file://${primary}`, shas };
}

function runGuard(where: { local: string; primaryUrl: string }, env: Record<string, string> = {}) {
  const clean = { ...process.env };
  delete clean.PDFLUENT_PRIMARY_SSH_KEY_B64;
  delete clean.CI_COMMIT_BRANCH;
  delete clean.CI_PIPELINE_SOURCE;
  delete clean.CI_COMMIT_SHA;
  delete clean.PDFLUENT_AGREE_LABEL;
  for (const k of Object.keys(clean)) if (k.startsWith("GITHUB_")) delete clean[k];
  const r = runToFile(process.execPath, [GUARD], {
    cwd: where.local,
    env: { ...clean, PDFLUENT_REPO_DIR: where.local, PDFLUENT_PRIMARY_URL: where.primaryUrl, ...env },
  });
  return { status: r.status, output: `${r.out}${r.err}` };
}

describe("the trunk exists on the primary too", () => {
  it("passes when the primary is level with the commit under test", () => {
    const s = scene(3, 2);
    const { status, output } = runGuard(s);
    expect(output).toContain("level with this commit");
    expect(status).toBe(0);
  });

  it("passes when the primary is ahead — a landing GitLab refused is still landed", () => {
    const s = scene(3, 2);
    const { status, output } = runGuard(s, { CI_COMMIT_SHA: s.shas[1] });
    expect(output).toContain("1 commit(s) ahead");
    expect(status).toBe(0);
  });

  it("fails when the primary is behind, and says by how much", () => {
    const s = scene(4, 1);
    const { status, output } = runGuard(s);
    expect(status).toBe(1);
    expect(output).toContain("does not contain");
    expect(output).toContain("2 commit(s) behind");
  });

  it("fails when the primary has no trunk at all", () => {
    const s = scene(2, null);
    const { status, output } = runGuard(s);
    expect(status).toBe(1);
    expect(output).toContain(`no ${TRUNK} at all`);
  });

  it("fails when the primary cannot be read, rather than passing without it", () => {
    const s = scene(2, 1);
    const { status, output } = runGuard({ ...s, primaryUrl: `${s.primaryUrl}-does-not-exist` });
    expect(status).toBe(1);
    expect(output).toContain("Not a pass");
  });

  it("names the missing credential rather than blaming the network", () => {
    // The deploy key hangs off an organisation setting somebody can switch back.
    // When it goes, this has to read as "nobody can see the primary", not as a
    // flaky remote — and it must not sit at a username prompt while it decides.
    const s = scene(2, 1);
    const { status, output } = runGuard(
      { ...s, primaryUrl: "https://github.com/pdfluent/pdfluent-internal.git" },
      { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "credential.helper", GIT_CONFIG_VALUE_0: "" },
    );
    expect(status).toBe(1);
    expect(output).toContain("no credential");
    expect(output).toContain("PDFLUENT_PRIMARY_SSH_KEY_B64");
    expect(output).toContain("Not a pass");
  });

  it("says out loud that it skipped a merge request", () => {
    const s = scene(2, null);
    const { status, output } = runGuard(s, { CI_PIPELINE_SOURCE: "merge_request_event" });
    expect(status).toBe(0);
    expect(output).toContain("SKIPPED (not a pass)");
  });

  it("says out loud that it skipped a branch that is not the trunk", () => {
    const s = scene(2, null);
    const { status, output } = runGuard(s, { CI_COMMIT_BRANCH: "release/some-experiment" });
    expect(status).toBe(0);
    expect(output).toContain("SKIPPED (not a pass)");
    expect(output).toContain("not release/ga-readiness");
  });

  // The gate moved hosts in #465. A guard that only knew GitLab's variable names
  // would have read a GitHub run as "no branch at all" and enforced on every
  // pull request and every side branch.
  it("reads GitHub's branch and event names too", () => {
    const s = scene(2, null);
    const branch = runGuard(s, { GITHUB_REF_TYPE: "branch", GITHUB_REF_NAME: "release/some-experiment" });
    expect(branch.status).toBe(0);
    expect(branch.output).toContain("not release/ga-readiness");

    const pr = runGuard(s, { GITHUB_EVENT_NAME: "pull_request" });
    expect(pr.status).toBe(0);
    expect(pr.output).toContain("pull request has not landed");

    // And on the trunk itself it still judges rather than skipping.
    const trunk = runGuard(s, { GITHUB_REF_TYPE: "branch", GITHUB_REF_NAME: "release/ga-readiness" });
    expect(trunk.status).toBe(1);
  });

  it("never prints a credential that reached it in a URL", () => {
    // Reaching the GitLab backup from the GitHub runner means a token in the
    // URL, and every sentence this guard writes names the remote. Twelve
    // characters of a token once reached a build log here; that is the whole
    // reason this is a case and not a habit.
    const s = scene(2, 1);
    const withToken = `${s.primaryUrl.replace("file://", "file://oauth2:s3cr3t-token@")}`;
    const { output } = runGuard({ ...s, primaryUrl: withToken });
    expect(output).not.toContain("s3cr3t-token");
    expect(output).toContain("//***@");
  });

  it("names the copy it read, so a red build does not misdescribe it", () => {
    const s = scene(2, null);
    const { output } = runGuard(s, { PDFLUENT_AGREE_LABEL: "backup (GitLab)" });
    expect(output).toContain("the backup (GitLab) has no release/ga-readiness at all");
    expect(output).not.toContain("the primary has no");
  });

  it("names the same primary and the same variable as the document that explains it", () => {
    // Two facts in two files drift, and the one in prose is the one people
    // read. This keeps them the same or fails.
    const script = readFileSync(resolve(root, "scripts/ci/remotes-agree.mjs"), "utf8");
    const doc = readFileSync(resolve(root, "docs/REPO_TRUTH.md"), "utf8");
    const url = /PDFLUENT_PRIMARY_URL \|\| "https:\/\/github\.com\/([^"]+?)\.git"/.exec(script)?.[1];
    expect(url).toBeTruthy();
    expect(doc).toContain(String(url).split("/")[1]);
    expect(doc).toContain("PDFLUENT_PRIMARY_SSH_KEY_B64");
    expect(script).toContain("PDFLUENT_PRIMARY_SSH_KEY_B64");
  });

  // A guard nothing runs is a guard that does not exist, and this one is a step
  // inside an existing job rather than a job of its own, so nothing else would
  // notice it going missing.
  it("is a step in the fast gate, on our own runner", () => {
    const ci = readFileSync(resolve(root, ".github/workflows/quality.yml"), "utf8");
    const fast = ci.slice(ci.indexOf("\n  quality-gates-fast:"));
    const job = fast.slice(0, fast.indexOf("\n  repo-truth:"));
    expect(job).toContain("node scripts/ci/remotes-agree.mjs");
    expect(job).toContain("self-hosted");
    // It has to ask about the copy CI is not running on: the step overrides the
    // remote, and the override is not the repository the runner is in. Pointed
    // at its own host it would be asking whether the commit is where it
    // obviously is — green, and about nothing.
    //
    // The address itself is deliberately not written here. This file is
    // published; the workflow that carries the address is not, and a test that
    // repeats it would carry our infrastructure out with it. What matters is
    // the property, and the property is checkable without the name.
    const step = job.slice(job.indexOf("PDFLUENT_AGREE_LABEL"), job.indexOf("node scripts/ci/remotes-agree.mjs"));
    expect(step).toContain("PDFLUENT_PRIMARY_URL");
    expect(step).not.toContain(PRIMARY_URL_DEFAULT_HOST);
    // Ancestry needs ancestry. In a shallow clone every containment question
    // answers "no" for the wrong reason, and this one would report a copy that
    // is behind when it is level.
    expect(job).toContain("fetch-depth: 0");
  });
});

// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// The guard that compares this repository with the public one, exercised
// against a public side built here rather than fetched, so the cases hold
// offline and say the same thing every time.
//
// Mutation to check this is not vacuous: make the missing-`Published-from` path
// return 0, or drop the day limit, and a case here goes red.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { runToFile } from "./run";

const root = resolve(__dirname, "../..");
const git = (args: string[], input?: string) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 }).trim();

const listed = runToFile(process.execPath, [resolve(root, "scripts/ci/public-tree.mjs"), "--list", "HEAD"], { cwd: root });
const publishedPaths = new Set(listed.out.split("\n").filter(Boolean));

// A temp directory, not `.git/`: in a worktree `.git` is a FILE, and writing an
// index beside it fails with "Not a directory" — a failure that reads like a git
// problem and is a path problem.
const scratch = mkdtempSync(join(tmpdir(), "repo-truth-test-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/**
 * A stand-in public repository: the published half of `ref`, with a message.
 *
 * Read the tree and remove what stays behind, rather than write every published
 * entry into a fresh index. The second shape passed alone and failed inside the
 * full suite, dropping half the entries: spawnSync's stdin does not reliably
 * carry a thousand lines while three hundred other test files are running.
 */
function fakePublic(ref: string, message: string): string {
  const index = join(scratch, `index-${Math.random().toString(36).slice(2)}`);
  const withIndex = { cwd: root, encoding: "utf8" as const, env: { ...process.env, GIT_INDEX_FILE: index } };
  const all = git(["ls-tree", "-r", "--name-only", ref]).split("\n").filter(Boolean);
  const drop = all.filter((p) => !publishedPaths.has(p));
  execFileSync("git", ["read-tree", ref], withIndex);
  execFileSync("git", ["update-index", "--force-remove", "--stdin"], { ...withIndex, input: drop.join("\n") + "\n" });
  const tree = execFileSync("git", ["write-tree"], withIndex).trim();
  const written = git(["ls-tree", "-r", "--name-only", tree]).split("\n").filter(Boolean).length;
  expect(written, "the stand-in public tree is not the published half of the ref").toBe(all.length - drop.length);
  return git(["commit-tree", tree, "-m", message]);
}

function guard(publicRef: string) {
  const r = runToFile(process.execPath, [resolve(root, "scripts/ci/repo-truth.mjs"), "--no-fetch", "--trunk", "HEAD"], {
    cwd: root, env: { ...process.env, PDFLUENT_PUBLIC_REF: publicRef },
  });
  return { status: r.status, out: `${r.out}${r.err}` };
}

describe("what people can read is what they run", () => {
  it("passes when the public side carries this branch and says so", () => {
    const head = git(["rev-parse", "HEAD"]);
    const r = guard(fakePublic("HEAD", `Publish\n\nPublished-from: ${head}\n`));
    expect(r.out).toContain("0 added / 0 changed / 0 removed");
    expect(r.status).toBe(0);
  });

  it("fails when the public side does not say where it came from", () => {
    // The state the repository was actually in: a public head nothing could be
    // compared against, so nobody could see it was months behind.
    const r = guard(fakePublic("HEAD", "Publish\n"));
    expect(r.status).toBe(1);
    expect(r.out).toContain("does not say what it was published from");
  });

  it("fails when the public side carries a different tree than it claims", () => {
    const head = git(["rev-parse", "HEAD"]);
    const r = guard(fakePublic("HEAD~3", `Publish\n\nPublished-from: ${head}\n`));
    expect(r.status).toBe(1);
    expect(r.out).toContain("does not carry what it claims");
  });

  it("fails when the branch has run too far ahead of the last publication", () => {
    // A window, not a ban: work lands between a release and its publication.
    // What is refused is the window staying open until republishing is a rewrite.
    const old = git(["rev-list", "--max-parents=1", "-n", "1", "--before=2026-06-01", "HEAD"]);
    const r = guard(fakePublic(old, `Publish\n\nPublished-from: ${old}\n`));
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/over the \d+ the window allows/);
  });

  it("checks the source of the shipped binaries, and it is on this branch", () => {
    const shipped = JSON.parse(readFileSync(resolve(root, "docs/SHIPPED.json"), "utf8")) as {
      version: string; commit: string;
    };
    const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as { version: string };
    expect(shipped.version).toBe(pkg.version);
    expect(() => git(["merge-base", "--is-ancestor", shipped.commit, "HEAD"])).not.toThrow();
  });

  it("states the window it enforces in the document that explains it", () => {
    // Two numbers in two files drift, and the one in prose is the one people
    // read. This keeps them the same or fails.
    const script = readFileSync(resolve(root, "scripts/ci/repo-truth.mjs"), "utf8");
    const doc = readFileSync(resolve(root, "docs/REPO_TRUTH.md"), "utf8");
    const commits = /MAX_UNPUBLISHED_COMMITS = (\d+)/.exec(script)?.[1];
    const days = /MAX_UNPUBLISHED_DAYS = (\d+)/.exec(script)?.[1];
    expect(commits).toBeTruthy();
    expect(days).toBeTruthy();
    expect(doc).toContain(`${commits} commits`);
    expect(doc).toContain(`${days} days`);
  });
});

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
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { runToFile } from "./run";
// @ts-expect-error — a plain .mjs script with no type declarations
import { qualityReportFailures, cutInProgress, isNewer } from "../../scripts/ci/repo-truth.mjs";

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
 *
 * `alsoDrop` removes published paths as well, which is how a case builds a
 * public side that differs from what it claims instead of hoping some commit
 * in the recent past differs from this one.
 */
function fakePublic(ref: string, message: string, alsoDrop: string[] = []): string {
  const index = join(scratch, `index-${Math.random().toString(36).slice(2)}`);
  const withIndex = { cwd: root, encoding: "utf8" as const, env: { ...process.env, GIT_INDEX_FILE: index } };
  const all = git(["ls-tree", "-r", "--name-only", ref]).split("\n").filter(Boolean);
  const extra = new Set(alsoDrop);
  const drop = all.filter((p) => !publishedPaths.has(p) || extra.has(p));
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
    // The difference is made here rather than borrowed from history. This case
    // used to publish the tree of HEAD~3 while claiming HEAD, which only differs
    // if one of those three commits happened to touch a published file. Three
    // internal-only commits in a row -- a baseline measurement and a CI change,
    // both under paths PUBLIC_TREE calls internal -- left the two trees
    // identical, so the guard correctly reported no mismatch and the case went
    // red for having nothing to detect.
    const dropped = [...publishedPaths].sort()[0];
    expect(dropped, "no published paths, so this case would assert nothing").toBeTruthy();
    const r = guard(fakePublic("HEAD", `Publish\n\nPublished-from: ${head}\n`, [dropped]));
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
    // The two versions agree, or this checkout is between the bump and the
    // record of what was built — the state every cut passes through, and the
    // only one where they may differ. Same helper the guard uses, so the case
    // and the script cannot drift apart on what "in progress" means.
    if (shipped.version !== pkg.version) {
      expect(
        cutInProgress(pkg.version, shipped.version),
        `package.json ${pkg.version} and SHIPPED.json ${shipped.version} differ, and this is not a cut in progress`,
      ).toBeTruthy();
    }
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

// ── The binaries were judged before they were published ─────────────────────
//
// A release that names no quality report was published without one. Before the
// suite existed that is a fact about history; after it, it is a release nobody
// looked at, and the difference is a date rather than a judgement call.
describe("repo-truth: shipped binaries name their quality reports", () => {
  it("accepts a release that predates the suite", () => {
    expect(qualityReportFailures({
      version: "1.0.0-beta.21",
      recorded: "2026-09-07",
      quality_reports: { macos: null, windows: null },
    })).toEqual([]);
  });

  it("refuses a release recorded after the suite that names no report", () => {
    const f = qualityReportFailures({
      version: "1.0.0",
      recorded: "2026-10-01",
      quality_reports: { macos: null, windows: null },
    });
    expect(f.length).toBe(2);
    expect(f.join("\n")).toContain("published without one");
  });

  it("refuses a SHIPPED.json with no quality_reports field at all", () => {
    expect(qualityReportFailures({ version: "1.0.0", recorded: "2026-10-01" }).length).toBe(1);
  });

  it("refuses a named report that did not pass", () => {
    const dir = mkdtempSync(join(tmpdir(), "pdfluent-shipped-"));
    mkdirSync(join(dir, "quality", "reports"), { recursive: true });
    const rel = "quality/reports/1.0.0-macos.json";
    writeFileSync(join(dir, rel), JSON.stringify({ verdict: "INCOMPLETE", exit_code: 3, version: "1.0.0" }));
    const f = qualityReportFailures(
      { version: "1.0.0", recorded: "2026-10-01", quality_reports: { macos: rel, windows: null } },
      { root: dir },
    );
    expect(f.join("\n")).toContain("INCOMPLETE");
  });

  it("accepts a PASS report for the shipped version", () => {
    const dir = mkdtempSync(join(tmpdir(), "pdfluent-shipped-"));
    mkdirSync(join(dir, "quality", "reports"), { recursive: true });
    const rel = "quality/reports/1.0.0-macos.json";
    writeFileSync(join(dir, rel), JSON.stringify({ verdict: "PASS", exit_code: 0, version: "1.0.0" }));
    const f = qualityReportFailures(
      { version: "1.0.0", recorded: "2026-10-01", quality_reports: { macos: rel, windows: rel } },
      { root: dir },
    );
    expect(f).toEqual([]);
  });

  it("refuses an override with no ticket number", () => {
    const dir = mkdtempSync(join(tmpdir(), "pdfluent-shipped-"));
    mkdirSync(join(dir, "quality", "reports"), { recursive: true });
    const rel = "quality/reports/1.0.0-macos.override.json";
    writeFileSync(join(dir, rel), JSON.stringify({ ticket: "", sha256: null }));
    const f = qualityReportFailures(
      { version: "1.0.0", recorded: "2026-10-01", quality_reports: { macos: rel, windows: null } },
      { root: dir },
    );
    expect(f.join("\n")).toContain("no ticket number");
  });

  it("the shipped record in this repository satisfies the leg", () => {
    const record = JSON.parse(readFileSync(join(process.cwd(), "docs/SHIPPED.json"), "utf8"));
    expect(qualityReportFailures(record)).toEqual([]);
  });
});

// ── A cut in progress is not a drift ────────────────────────────────────────
//
// The bumps land as one commit and the record of what was built lands as
// another, because the second has to name the first one's sha. Between them,
// package.json names a version SHIPPED.json has never heard of. The guard used
// to call that a failure, which meant the only way to land a version bump was
// to skip the gate that exists to catch exactly this kind of mismatch.
describe("repo-truth: the state between the bump and the record", () => {
  const never = () => false;
  const always = () => true;

  it("tolerates a newer package.json while no tag exists yet", () => {
    const why = cutInProgress("1.0.0", "1.0.0-beta.21", { hasTag: never });
    expect(why).toBeTruthy();
    expect(why).toContain("cut in progress");
  });

  it("still fails once the tag exists and the record has not followed", () => {
    // This is the drift the leg is for: something was built and tagged, and
    // nothing says what it was built from.
    expect(cutInProgress("1.0.0", "1.0.0-beta.21", { hasTag: always })).toBeNull();
  });

  it("does not tolerate a version going backwards", () => {
    expect(cutInProgress("1.0.0-beta.20", "1.0.0-beta.21", { hasTag: never })).toBeNull();
    expect(cutInProgress("0.9.0", "1.0.0", { hasTag: never })).toBeNull();
  });

  it("leaves the ordinary case alone", () => {
    expect(cutInProgress("1.0.0", "1.0.0", { hasTag: never })).toBeNull();
  });

  it("counts a release as newer than its own prereleases", () => {
    expect(isNewer("1.0.0", "1.0.0-beta.21")).toBe(true);
    expect(isNewer("1.0.0-beta.21", "1.0.0")).toBe(false);
    expect(isNewer("1.0.1", "1.0.0")).toBe(true);
    expect(isNewer("1.0.0", "1.0.0")).toBe(false);
  });
});

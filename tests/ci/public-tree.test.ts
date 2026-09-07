// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// docs/PUBLIC_TREE.json decides what leaves this repository. These cases hold it
// to three things a manifest quietly stops being: complete (every entry still
// matches a file), reasoned (every entry says why), and actually applied.
//
// Mutation to check this is not vacuous: drop the `why` from an entry, or point
// an entry at a path that no longer exists, and a case here goes red.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { runToFile } from "./run";

const root = resolve(__dirname, "../..");
const manifest = JSON.parse(readFileSync(resolve(root, "docs/PUBLIC_TREE.json"), "utf8")) as {
  internal: { path: string; why: string }[];
  public_only: { path: string; why: string }[];
};

function tool(...args: string[]) {
  return runToFile(process.execPath, [resolve(root, "scripts/ci/public-tree.mjs"), ...args], { cwd: root });
}

describe("what leaves this repository is declared", () => {
  it("gives a reason for every path it holds back", () => {
    // Without this, "internal" becomes a place to put a file you would rather
    // not explain, which is the same act as hiding it.
    for (const entry of [...manifest.internal, ...manifest.public_only]) {
      expect(entry.path, JSON.stringify(entry)).toBeTruthy();
      expect(entry.why, `no reason given for ${entry.path}`).toBeTruthy();
      expect(entry.why.length, `the reason for ${entry.path} is too short to be one`).toBeGreaterThan(20);
    }
  });

  it("names only paths this repository actually has", () => {
    // A stale entry is worse than no entry: it reads as a decision that is
    // still being enforced while it enforces nothing.
    const r = tool("--list", "HEAD");
    expect(r.out + r.err).not.toContain("match nothing");
    expect(r.status).toBe(0);
  });

  it("publishes the product and holds back the machinery", () => {
    const published = new Set(tool("--list", "HEAD").out.split("\n").filter(Boolean));
    expect(published.size).toBeGreaterThan(800);
    expect(published.has("src/main.tsx")).toBe(true);
    expect(published.has("src-tauri/src/lib.rs")).toBe(true);
    expect(published.has("LICENSE.md")).toBe(true);
    expect(published.has(".gitlab-ci.yml")).toBe(false);
    expect(published.has("AGENTS.md")).toBe(false);
    expect([...published].some((p) => p.startsWith("docs/archive/"))).toBe(false);
  });

  it("does not claim the public side's own files as ours to publish", () => {
    // public_only exists so a publication carries those files forward instead of
    // deleting them. If one of them were also here, the two sides would fight
    // over it on every publication.
    const published = new Set(tool("--list", "HEAD").out.split("\n").filter(Boolean));
    for (const entry of manifest.public_only) {
      expect([...published].some((p) => p === entry.path || p.startsWith(`${entry.path}/`)),
        `${entry.path} is declared public-only but this repository publishes it`).toBe(false);
    }
  });

  it("refuses a reference that resolves to almost nothing", () => {
    // A comparison against an empty listing agrees with everything, and that is
    // how a broken invocation reads as a clean repository.
    const empty = spawnSync("git", ["hash-object", "-w", "-t", "tree", "/dev/null"], { cwd: root, encoding: "utf8" });
    const commit = spawnSync("git", ["commit-tree", empty.stdout.trim(), "-m", "empty"], { cwd: root, encoding: "utf8" });
    const r = tool("--list", commit.stdout.trim());
    expect(r.status).not.toBe(0);
    expect(r.err).toContain("fewer than");
  });
});

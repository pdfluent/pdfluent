// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// The publisher runs the public repository's own guards before it offers a
// snapshot for pushing.
//
// Two of them had been failing on published snapshots — a personal address in a
// test fixture, and files with no row in SOURCES.md — and both were only
// visible after a push to a repository anyone can read. One had been red since
// the snapshot before that, which is how long "we find out afterwards" lasts.
//
// Mutation: make publicGuardsRefuse always return an empty list, or let a
// missing guard count as a pass, and a case here goes red.
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
// @ts-expect-error — a plain .mjs script with no type declarations
import { publicGuardsRefuse, PUBLIC_GUARDS } from "../../scripts/ci/publish-public-snapshot.mjs";

const root = resolve(__dirname, "../..");
const git = (args: string[], input?: Buffer | string) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 }).trim();

/** A commit whose tree holds exactly the given files, mode 755, at the top level
 *  (`git mktree` takes one directory at a time and refuses a path with a slash). */
function treeWith(files: Record<string, string>): string {
  const lines = Object.entries(files).map(([path, body]) => {
    const blob = git(["hash-object", "-w", "--stdin"], body);
    return `100755 blob ${blob}\t${path}`;
  });
  const tree = git(["mktree", "--missing"], `${lines.join("\n")}\n`);
  return git(["commit-tree", tree, "-m", "fixture"]);
}

const PASSES = "#!/usr/bin/env python3\nraise SystemExit(0)\n";
const REFUSES = "#!/usr/bin/env python3\nprint('one document with no stated origin')\nraise SystemExit(1)\n";

describe("a snapshot is judged by the guards it carries", () => {
  it("refuses a snapshot whose own guard says no, and repeats what it said", () => {
    const commit = treeWith({ "refuses.py": REFUSES });
    const refused = publicGuardsRefuse(commit, { guards: ["refuses.py"] }) as string[];
    expect(refused).toHaveLength(1);
    expect(refused[0]).toContain("exited 1");
    expect(refused[0]).toContain("no stated origin");
  });

  it("accepts a snapshot whose guards pass", () => {
    const commit = treeWith({ "passes.py": PASSES });
    expect(publicGuardsRefuse(commit, { guards: ["passes.py"] })).toEqual([]);
  });

  it("refuses a snapshot that no longer carries a guard, rather than skipping it", () => {
    // The guards are published files. One going missing means the snapshot has
    // stopped carrying the check it is meant to satisfy, and a check that is not
    // there cannot have passed.
    const commit = treeWith({ "passes.py": PASSES });
    const refused = publicGuardsRefuse(commit, { guards: ["gone.py"] }) as string[];
    expect(refused).toHaveLength(1);
    expect(refused[0]).toContain("not in the snapshot");
  });

  it("reports every refusing guard, not just the first", () => {
    const commit = treeWith({ "a.py": REFUSES, "b.py": REFUSES });
    expect(publicGuardsRefuse(commit, { guards: ["a.py", "b.py"] })).toHaveLength(2);
  });

  it("names the two guards the public side actually runs", () => {
    expect(PUBLIC_GUARDS).toContain("scripts/ci/no_personal_address_in_the_tree.py");
    expect(PUBLIC_GUARDS).toContain("scripts/ci/every_document_has_a_source.py");
  });

  it("stands between the snapshot and the push", () => {
    // A check that runs after the push is a report, not a gate.
    const src = execFileSync("cat", [resolve(root, "scripts/ci/publish-public-snapshot.mjs")], { encoding: "utf8" });
    const refuse = src.indexOf("publicGuardsRefuse(commit)");
    const offer = src.indexOf("Nothing has been pushed. To publish it:");
    expect(refuse).toBeGreaterThan(-1);
    expect(offer).toBeGreaterThan(refuse);
  });
});

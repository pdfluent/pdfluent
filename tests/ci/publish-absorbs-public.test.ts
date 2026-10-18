// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// A commit made directly on the public repository does not survive the next
// snapshot: the snapshot replaces every published file with the trunk's copy.
// Three such commits sat on the public head from 2026-09-22 to 2026-10-18 and
// none of them was on the trunk, so the next publication would have reverted
// them without a word. The snapshot is now refused until the trunk names each
// one with `Absorbs-public: <sha>`.
//
// Mutation: make `absorptionFault` return null, or stop `directCommits` at the
// first commit instead of the last snapshot, and a case here goes red.
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs script with no type declarations
import { absorptionFault, directCommits, unabsorbed } from "../../scripts/ci/publish-public-snapshot.mjs";

const root = resolve(__dirname, "../..");
const ident = {
  GIT_AUTHOR_NAME: "fixture", GIT_AUTHOR_EMAIL: "1+fixture@users.noreply.github.com",
  GIT_COMMITTER_NAME: "fixture", GIT_COMMITTER_EMAIL: "1+fixture@users.noreply.github.com",
};
const emptyTree = execFileSync("git", ["hash-object", "-t", "tree", "-w", "--stdin"], {
  cwd: root, encoding: "utf8", input: "",
}).trim();

/** A commit object only: no ref, no working tree, nothing to clean up. */
function commit(message: string, parent?: string): string {
  const args = ["commit-tree", emptyTree, "-m", message, ...(parent ? ["-p", parent] : [])];
  return execFileSync("git", args, { cwd: root, encoding: "utf8", env: { ...process.env, ...ident } }).trim();
}

// public: snapshot <- direct A <- direct B
const older = commit("Publish the editor source for 0.9\n\nPublished-from: 1111111111111111111111111111111111111111");
const snapshot = commit("Publish the editor source for 1.0.0\n\nPublished-from: 2222222222222222222222222222222222222222", older);
const directA = commit("docs: a link added on the public side", snapshot);
const directB = commit("chore: wording changed on the public side", directA);

describe("a commit made on the public side is taken in before the next snapshot", () => {
  it("finds the commits after the last snapshot, and only those", () => {
    const { direct, snapshot: found } = directCommits(directB);
    expect(found).toBe(snapshot);
    expect(direct.map((d: { sha: string }) => d.sha)).toEqual([directB, directA]);
  });

  it("finds none on a head that is itself a snapshot", () => {
    expect(directCommits(snapshot).direct).toEqual([]);
    expect(absorptionFault(snapshot, commit("trunk: nothing absorbed"))).toBeNull();
  });

  it("refuses while the trunk has not taken them in, and names each one", () => {
    const trunk = commit("feat: unrelated work");
    const fault = absorptionFault(directB, trunk) as string;
    expect(fault).toContain("2 commit(s) were made directly on the public repository");
    expect(fault).toContain(directA.slice(0, 8));
    expect(fault).toContain(directB.slice(0, 8));
  });

  it("still refuses when only one of them is absorbed", () => {
    const trunk = commit(`docs: port the public link\n\nAbsorbs-public: ${directA.slice(0, 12)}`);
    const missing = unabsorbed(directCommits(directB).direct, trunk);
    expect(missing.map((d: { sha: string }) => d.sha)).toEqual([directB]);
    expect(absorptionFault(directB, trunk)).toContain(directB.slice(0, 8));
  });

  it("builds once every one is named, in any trunk commit", () => {
    const first = commit(`docs: port the link\n\nAbsorbs-public: ${directA}`);
    const second = commit(`chore: port the wording\n\nAbsorbs-public: ${directB.slice(0, 7)}`, first);
    expect(absorptionFault(directB, second)).toBeNull();
  });

  it("refuses a public head with no snapshot anywhere in its history", () => {
    const orphan = commit("an unrelated history");
    expect(absorptionFault(orphan, commit("trunk"))).toContain("no commit on the public head carries");
  });
});

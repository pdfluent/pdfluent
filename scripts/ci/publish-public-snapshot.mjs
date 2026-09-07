#!/usr/bin/env node
// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// Publish the editor's source as a snapshot on the public repository's own
// history. Builds the commit; pushing it is a separate, deliberate act.
//
// WHY A SNAPSHOT AND NOT THIS BRANCH'S HISTORY
// Transplanting `release/ga-readiness` onto `pdfluent/pdfluent` looks like the
// honest thing to do — the same commits, publicly readable. It is the opposite,
// and three measurements say so (2026-09-07):
//
//   · The two histories have NO common ancestor. `git merge-base` returns
//     nothing between them. Pushing this branch is not a fast-forward, it is a
//     force-push that discards 58 commits of public history, including the ones
//     that removed content on purpose.
//   · 300 of 321 commits here carry a personal e-mail address in their author or
//     committer field. The public repository refuses those in CI
//     (`commits_use_the_noreply_alias.py`), and an address in a commit is
//     published to anyone who can read the repository, no login needed.
//   · A third-party form withdrawn from the public repository is still reachable
//     from this branch's history as a blob. Its own guard
//     (`no_withdrawn_blobs.py`) walks every object and refuses it; a history
//     transplant brings it straight back, whatever the current tree says.
//
// A snapshot keeps the public lineage, publishes exactly the tree
// docs/PUBLIC_TREE.json says is public, and carries no blob that is not in that
// tree. What it costs is per-commit history on the public side, which was never
// there to begin with.
//
// usage:
//   node scripts/ci/publish-public-snapshot.mjs [--source <ref>] [--no-fetch]
//   … then push the printed commit yourself. This script never pushes.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadManifest, isPublished, isPublicOnly, root } from "./public-tree.mjs";
import { PUBLIC_REF, PUBLIC_URL, shippedVersion } from "./repo-truth.mjs";

function git(args, opts = {}) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, ...opts }).trim();
}

/** `[mode, sha, path]` for every file in a ref. */
function entries(ref) {
  // `git()` trims, which would eat the final separator this check needs.
  const out = execFileSync("git", ["ls-tree", "-r", "-z", "--format=%(objectmode) %(objectname) %(path)", ref], {
    cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024,
  });
  if (out.length > 0 && !out.endsWith("\0")) {
    throw new Error(`publish: the listing of ${ref} was cut off mid-record. Nothing was built.`);
  }
  return out.split("\0").filter(Boolean).map((row) => {
    const [mode, sha] = row.split(" ", 2);
    return [mode, sha, row.slice(mode.length + sha.length + 2)];
  });
}

// The public repository refuses a commit whose author or committer carries a
// personal address: `commits_use_the_noreply_alias.py` is public-only and runs
// in its own CI, THERE and AFTER the push. By then the address is published, and
// taking it back is a force-push on a public repository.
//
// Nothing else checks this. The identity a snapshot is signed with is whatever
// the machine building it happens to be configured with; this worktree is
// configured with an alias and the next one need not be. So the same rule is
// applied here, before anything is fetched or written.
export const NOREPLY_ALIAS = /^[^@\s]+@users\.noreply\.github\.com$/;

/** The address out of a `git var` identity line: `Name <mail> 1699… +0200`. */
export function addressOf(ident) {
  const m = /<([^>]*)>/.exec(ident ?? "");
  return m ? m[1] : null;
}

/** The reason this identity must not sign a publication, or null. */
export function identityFault(author, committer) {
  for (const [role, ident] of [["author", author], ["committer", committer]]) {
    const address = addressOf(ident);
    if (address === null) {
      return `publish: cannot read the ${role} identity git would use (${JSON.stringify(ident)}).\n` +
        "Not a pass: an unreadable identity is not a checked one.";
    }
    if (!NOREPLY_ALIAS.test(address)) {
      return `publish: git would sign the snapshot as ${role} ${address || "<empty>"}, which is not a\n` +
        "GitHub noreply alias. The public repository refuses that in its own CI — after the\n" +
        "push, with the address already published.\n" +
        "Set user.email to <id>+<name>@users.noreply.github.com here and run this again.";
    }
  }
  return null;
}

function main(argv) {
  // First, before the fetch: refusing early is the whole point of refusing here.
  let author, committer;
  try {
    author = git(["var", "GIT_AUTHOR_IDENT"]);
    committer = git(["var", "GIT_COMMITTER_IDENT"]);
  } catch (e) {
    console.error(`\npublish: git cannot tell who would sign this (${String(e.message).split("\n")[0]}).\n`);
    return 1;
  }
  const fault = identityFault(author, committer);
  if (fault) {
    console.error(`\n${fault}\n`);
    return 1;
  }

  const manifest = loadManifest();
  const source = argv.includes("--source") ? argv[argv.indexOf("--source") + 1] : "HEAD";
  if (!argv.includes("--no-fetch")) {
    git(["fetch", "--no-tags", "--quiet", PUBLIC_URL, `+refs/heads/main:${PUBLIC_REF}`]);
  }

  const sourceSha = git(["rev-parse", source]);
  const publicSha = git(["rev-parse", PUBLIC_REF]);

  // The internal-names scan runs HERE and not in CI, and that is deliberate: it
  // needs the customer and partner list, which lives outside the tree because a
  // denylist that publishes its own terms leaks what it exists to stop — and a
  // CI variable store is a place that list should not be either. Putting the
  // scan in the one path that can produce a publication is what keeps it from
  // depending on somebody remembering to run it.
  const scan = spawnSync(process.execPath, [new URL("internal-terms.mjs", import.meta.url).pathname, "--tree", sourceSha], {
    cwd: root, stdio: "inherit",
  });
  if (scan.status !== 0) {
    console.error("\npublish: the tree that would go out did not pass the internal-names scan. Nothing was built.\n");
    return 1;
  }

  const keep = entries(PUBLIC_REF).filter(([, , p]) => isPublicOnly(p, manifest));
  const publish = entries(sourceSha).filter(([, , p]) => isPublished(p, manifest));
  if (keep.length === 0) {
    console.error("publish: the public head carries none of the public-only files the manifest names.");
    return 1;
  }
  if (publish.length < 100) {
    console.error(`publish: ${source} publishes only ${publish.length} files. That is not this repository.`);
    return 1;
  }

  const index = join(mkdtempSync(join(tmpdir(), "pdfluent-publish-")), "index");
  try {
    // Built by reading the source tree and REMOVING what stays behind, rather
    // than by writing all 900-odd entries into a fresh index. Both produce the
    // same tree when they work; only this one keeps the pipe to `git` short.
    // Feeding a thousand lines through spawnSync's stdin silently dropped half
    // of them under load, and a publication that quietly leaves out 477 files is
    // worse than one that fails.
    const withIndex = { cwd: root, encoding: "utf8", env: { ...process.env, GIT_INDEX_FILE: index } };
    const drop = entries(sourceSha).filter(([, , p]) => !isPublished(p, manifest)).map(([, , p]) => p);
    execFileSync("git", ["read-tree", sourceSha], withIndex);
    execFileSync("git", ["update-index", "--force-remove", "--stdin"], { ...withIndex, input: drop.join("\n") + "\n" });
    execFileSync("git", ["update-index", "--add", "--index-info"], {
      ...withIndex, input: keep.map(([m, s, p]) => `${m} ${s}\t${p}`).join("\n") + "\n",
    });
    const tree = execFileSync("git", ["write-tree"], withIndex).trim();

    // And counted, because the failure above was silent. A tree with the wrong
    // number of files is a truncated write, not a smaller repository.
    const written = execFileSync("git", ["ls-tree", "-r", "--name-only", tree], {
      cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
    }).trim().split("\n").filter(Boolean).length;
    if (written !== publish.length + keep.length) {
      console.error(
        `publish: the snapshot tree holds ${written} files, not the ${publish.length + keep.length} that were put in it.\n` +
        "Nothing was built. This is a truncated write, not a smaller repository.",
      );
      return 1;
    }

    if (tree === git(["rev-parse", `${PUBLIC_REF}^{tree}`])) {
      console.log(`publish: the public repository already carries ${sourceSha.slice(0, 7)}. Nothing to do.`);
      return 0;
    }

    const version = shippedVersion();
    const message =
      `Publish the editor source for ${version}\n\n` +
      "A snapshot of the release branch, filtered by docs/PUBLIC_TREE.json. The\n" +
      "per-commit history stays on the internal side: its commits carry personal\n" +
      "addresses and reach content that was withdrawn from this repository, and\n" +
      "neither belongs here. What is here is the tree the published binaries were\n" +
      "built from.\n\n" +
      `Published-from: ${sourceSha}\n`;
    const commit = execFileSync("git", ["commit-tree", tree, "-p", publicSha, "-m", message], {
      cwd: root, encoding: "utf8",
    }).trim();

    const changed = git(["diff", "--name-only", `${publicSha}..${commit}`]).split("\n").filter(Boolean);
    console.log(`snapshot commit  ${commit}`);
    console.log(`  parent         ${publicSha.slice(0, 7)} (${PUBLIC_REF})`);
    console.log(`  published from ${sourceSha.slice(0, 7)} (${source})`);
    console.log(`  files          ${publish.length} published + ${keep.length} public-only, ${changed.length} changed`);
    console.log("");
    console.log("Nothing has been pushed. To publish it:");
    console.log(`  git push ${PUBLIC_URL} ${commit}:refs/heads/main`);
    console.log("Check it first with --dry-run, and read docs/REPO_TRUTH.md before you do.");
    return 0;
  } finally {
    rmSync(index, { force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv.slice(2)));

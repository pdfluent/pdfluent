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
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
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

/**
 * The checks the public repository runs, run here, before the push.
 *
 * Two of its guards have been failing on published snapshots: one on a personal
 * address in a test fixture, one on two files with no row in SOURCES.md. Both
 * were only visible after a push — to a repository anyone can read — because
 * this side publishes without ever asking what that side checks. One of them had
 * been red since the snapshot before, which is how long "we find out afterwards"
 * lasts.
 *
 * These are not reimplementations. The snapshot carries the public-only files
 * forward, so the guards are inside the tree being judged and they judge
 * themselves: whatever the public side runs on the pushed commit runs here on
 * the same bytes first. A copy would drift, and a drifting copy of a guard is
 * worse than no copy, because it reports on a rule nobody holds.
 *
 * The tree is materialised into a throwaway repository because both guards ask
 * `git ls-files` what to look at, which is the right question and needs an
 * index to answer.
 */
export function publicGuardsRefuse(commit, { guards = PUBLIC_GUARDS } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "pdfluent-snapshot-guards-"));
  const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: "utf8", ...opts });
  try {
    const archive = spawnSync("git", ["archive", "--format=tar", commit], {
      cwd: root, encoding: "buffer", maxBuffer: 512 * 1024 * 1024,
    });
    if (archive.status !== 0) return [`could not read the snapshot tree: ${String(archive.stderr)}`];
    const untar = spawnSync("tar", ["-x", "-C", dir], { input: archive.stdout });
    if (untar.status !== 0) return [`could not unpack the snapshot tree: ${String(untar.stderr)}`];

    for (const args of [["init", "-q"], ["add", "-A"]]) run("git", args, { cwd: dir });

    const refused = [];
    for (const guard of guards) {
      if (!existsSync(join(dir, guard))) {
        // Not a pass: these live in the published tree, so a missing one means
        // the snapshot no longer carries the check it is meant to satisfy.
        refused.push(`  - ${guard} is not in the snapshot, so it could not be run.`);
        continue;
      }
      const r = run("python3", [guard], { cwd: dir });
      if (r.status !== 0) {
        refused.push(`  - ${guard} exited ${r.status}:\n${`${r.stdout}${r.stderr}`.trim().split("\n").map((l) => `      ${l}`).join("\n")}`);
      }
    }
    return refused;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export const PUBLIC_GUARDS = [
  "scripts/ci/no_personal_address_in_the_tree.py",
  "scripts/ci/every_document_has_a_source.py",
];

/**
 * Where a public-only file is edited.
 *
 * SOURCES.md, the public repository's own workflows and the guards they run
 * exist only on that side, so the snapshot carries them over from the public
 * head untouched. That left no way to change one: the only edit that reached
 * them was a commit made directly on the public repository — which is how a head
 * came to carry no `Published-from:` trailer on 2026-09-09, and how nobody could
 * say for two hours which trunk commit the public side held.
 *
 * They are edited here instead. `docs/public-only/<path>` replaces, or adds, the
 * public-only entry at `<path>`, so a change to any of them passes this
 * repository's gate and its review and arrives inside a snapshot commit that
 * carries the trailer like every other.
 *
 * A file under here that the manifest does not name as `public_only` is refused.
 * Without that, the directory quietly becomes a second way to publish anything,
 * which is the one thing PUBLIC_TREE.json exists to prevent.
 */
export const OVERLAY_DIR = "docs/public-only";

export function applyOverlay(kept, manifest, { dir = join(root, OVERLAY_DIR) } = {}) {
  if (!existsSync(dir)) return null;
  const files = [];
  const walk = (d, prefix) => {
    for (const name of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, name.name);
      const rel = prefix ? `${prefix}/${name.name}` : name.name;
      if (name.isDirectory()) walk(full, rel);
      else if (name.isFile()) files.push([rel, full]);
    }
  };
  walk(dir, "");
  const stray = files.filter(([rel]) => !isPublicOnly(rel, manifest)).map(([rel]) => rel);
  if (stray.length) {
    return (
      `publish: ${OVERLAY_DIR} holds ${stray.length} file(s) the manifest does not call public-only:\n` +
      stray.map((p) => `  · ${p}`).join("\n") +
      `\n\nAn overlay file is a published file. Declare it in docs/PUBLIC_TREE.json under\n` +
      "public_only with the reason it lives only on that side, or publish it the ordinary way."
    );
  }
  for (const [rel, full] of files) {
    const sha = execFileSync("git", ["hash-object", "-w", full], { cwd: root, encoding: "utf8" }).trim();
    kept.set(rel, ["100644", sha]);
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

  const kept = new Map(
    entries(PUBLIC_REF).filter(([, , p]) => isPublicOnly(p, manifest)).map(([m, sha, p]) => [p, [m, sha]]),
  );
  const overlaid = applyOverlay(kept, manifest);
  if (typeof overlaid === "string") { console.error(overlaid); return 1; }
  const keep = [...kept].map(([p, [m, sha]]) => [m, sha, p]);
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

    const refused = publicGuardsRefuse(commit);
    if (refused.length) {
      console.error("The public repository's own guards refuse this snapshot:\n");
      for (const r of refused) console.error(`${r}\n`);
      console.error(
        "Nothing has been pushed. Fix it on the trunk (or, for a public-only file, through\n" +
        "the route in docs/REPO_TRUTH.md) and build the snapshot again.",
      );
      return 1;
    }

    console.log("Nothing has been pushed. To publish it:");
    console.log(`  git push ${PUBLIC_URL} ${commit}:refs/heads/main`);
    console.log("Check it first with --dry-run, and read docs/REPO_TRUTH.md before you do.");
    return 0;
  } finally {
    rmSync(index, { force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv.slice(2)));

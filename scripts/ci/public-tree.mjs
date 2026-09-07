#!/usr/bin/env node
// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// One answer to "does this file go out", for every tool that needs to ask.
//
// The public editor repository is not a mirror of this one. It carries the
// product's source and leaves out the machinery around it, and it carries a few
// files of its own that were never here — its CI guards, its README material.
// Which is which is declared in docs/PUBLIC_TREE.json, with a reason per entry,
// so that "we did not publish that" is a decision on the record rather than
// something a script did quietly.
//
// Everything is published unless the manifest claims it. That direction matters:
// a new file is public by default and someone has to write down why it is not,
// which is the opposite of the failure this repository already had once — a
// repository that was public for five months while nobody had read the setting.
//
// usage:
//   node scripts/ci/public-tree.mjs --list [<ref>]
//   node scripts/ci/public-tree.mjs --diff <public-ref> [<ref>]
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const MANIFEST = resolve(root, "docs/PUBLIC_TREE.json");

// FLOOR: a tree listing below this is a broken invocation, not a small
// repository, and a comparison of nothing agrees with everything.
const MIN_FILES = 100;

export function loadManifest(path = MANIFEST) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  for (const key of ["internal", "public_only"]) {
    if (!Array.isArray(raw[key]) || raw[key].length === 0) {
      throw new Error(`PUBLIC_TREE.json: '${key}' must be a non-empty list`);
    }
    for (const entry of raw[key]) {
      if (!entry.path || !entry.why) {
        throw new Error(
          `PUBLIC_TREE.json: every '${key}' entry needs a path and a why; ` +
          `got ${JSON.stringify(entry)}`,
        );
      }
    }
  }
  return raw;
}

function covers(entryPath, path) {
  return path === entryPath || path.startsWith(`${entryPath}/`);
}

/** Does this repository publish `path` to the public editor repository? */
export function isPublished(path, manifest) {
  if (manifest.internal.some((e) => covers(e.path, path))) return false;
  // A public-only path is the public side's own file. It is not published FROM
  // here, and a publication must leave it alone rather than delete it.
  if (manifest.public_only.some((e) => covers(e.path, path))) return false;
  return true;
}

export function isPublicOnly(path, manifest) {
  return manifest.public_only.some((e) => covers(e.path, path));
}

/** `path -> blob sha` for a ref, straight from git rather than a checkout. */
export function treeOf(ref) {
  const out = execFileSync("git", ["ls-tree", "-r", "-z", "--format=%(objectname) %(path)", ref], {
    cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
  // `-z` is here for this check as much as for the quoting. A short read from a
  // child process is not hypothetical -- it happened twice while this file was
  // being written, both times under load, both times silently -- and a listing
  // that stops halfway reads as a repository with fewer files in it. A complete
  // listing ends on the record separator; an incomplete one ends mid-record.
  if (out.length > 0 && !out.endsWith("\0")) {
    throw new Error(`public-tree: the listing of ${ref} was cut off mid-record. Read again; do not trust it.`);
  }
  const tree = new Map();
  for (const row of out.split("\0")) {
    if (!row) continue;
    const sep = row.indexOf(" ");
    tree.set(row.slice(sep + 1), row.slice(0, sep));
  }
  if (tree.size < MIN_FILES) {
    throw new Error(
      `public-tree: ${ref} lists ${tree.size} files, fewer than ${MIN_FILES}. ` +
      "The reference is wrong -- an empty listing agrees with everything.",
    );
  }
  return tree;
}

/** Entries in the manifest that no longer match anything: rot, reported loudly. */
export function staleEntries(tree, manifest) {
  const paths = [...tree.keys()];
  return manifest.internal
    .filter((e) => !paths.some((p) => covers(e.path, p)))
    .map((e) => e.path);
}

/**
 * What a publication of `sourceRef` would change on `publicRef`.
 * `changed` and `added` are files the public side would gain or see updated,
 * `removed` files it carries that this repository no longer publishes.
 */
export function publicationDiff(publicRef, sourceRef, manifest) {
  const publicTree = treeOf(publicRef);
  const sourceTree = treeOf(sourceRef);
  const publish = new Map(
    [...sourceTree].filter(([p]) => isPublished(p, manifest)),
  );
  const added = [], changed = [], removed = [], kept = [];
  for (const [p, sha] of publish) {
    if (!publicTree.has(p)) added.push(p);
    else if (publicTree.get(p) !== sha) changed.push(p);
  }
  for (const [p] of publicTree) {
    if (isPublicOnly(p, manifest)) kept.push(p);
    else if (!publish.has(p)) removed.push(p);
  }
  return { added, changed, removed, kept, publishedCount: publish.size };
}

function main(argv) {
  const manifest = loadManifest();
  if (argv.includes("--list")) {
    const ref = argv[argv.indexOf("--list") + 1] || "HEAD";
    const tree = treeOf(ref);
    const stale = staleEntries(tree, manifest);
    if (stale.length) {
      console.error(`public-tree: ${stale.length} manifest entries match nothing in ${ref}:`);
      for (const p of stale) console.error(`  · ${p}`);
      return 1;
    }
    const published = [...tree.keys()].filter((p) => isPublished(p, manifest)).sort();
    for (const p of published) console.log(p);
    console.error(`public-tree: ${published.length} of ${tree.size} files in ${ref} are published.`);
    return 0;
  }
  if (argv.includes("--diff")) {
    const i = argv.indexOf("--diff");
    const publicRef = argv[i + 1];
    const sourceRef = argv[i + 2] || "HEAD";
    if (!publicRef) { console.error("usage: --diff <public-ref> [<ref>]"); return 2; }
    const d = publicationDiff(publicRef, sourceRef, manifest);
    console.log(`publishing ${sourceRef} onto ${publicRef}:`);
    console.log(`  ${d.publishedCount} files published, ${d.kept.length} public-only files kept`);
    console.log(`  ${d.added.length} added, ${d.changed.length} changed, ${d.removed.length} removed`);
    for (const [label, list] of [["+", d.added], ["~", d.changed], ["-", d.removed]]) {
      for (const p of list.slice(0, 40)) console.log(`   ${label} ${p}`);
      if (list.length > 40) console.log(`   ${label} … and ${list.length - 40} more`);
    }
    return 0;
  }
  console.error("usage: public-tree.mjs --list [<ref>] | --diff <public-ref> [<ref>]");
  return 2;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv.slice(2)));

#!/usr/bin/env node
// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// A tag this repository cannot push to its primary remote is a tag that exists
// in one place.
//
// GitHub refuses a ref whose tip would publish a private e-mail address
// (`GH007`), and it judges the tip rather than the history — which is why the
// trunk, 300 of whose commits carry a personal address, pushes cleanly on a tip
// written with the no-reply alias, while `rc30` does not:
//
//     ! [remote rejected] rc30 -> rc30 (push declined due to email privacy restrictions)
//
// A lightweight tag has no tagger, so the commit it points at is what GitHub
// judges, and every tag here older than the switch to the alias points at a
// commit with a personal address. An annotated tag carries its own tagger and is
// accepted on the strength of that, even on an old commit — measured, not
// assumed (#467).
//
// So the rule is: every tag is an annotated tag whose tagger is the no-reply
// alias. That is not a style preference. It is the difference between a release
// tag that reaches the primary and one that lives only where CI runs, which is
// the whole of #455 one size smaller.
//
// The fix for a tag this refuses is to re-make it at the same commit with the
// alias as tagger — never to switch off the account setting that blocks the
// push. That setting is the only thing standing between a personal address and
// a repository we intend to keep clean; turning it off publishes every address
// that follows, which is the opposite of the repair.
//
// usage: node scripts/ci/tags-are-pushable.mjs
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NOREPLY_ALIAS } from "./publish-public-snapshot.mjs";

export const root = process.env.PDFLUENT_REPO_DIR || resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function git(args, cwd = root) {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
}

/** Every tag, with the tagger address of its tag object — empty when there is none. */
export function tags(cwd = root) {
  const out = git(["for-each-ref", "--format=%(refname:short)\t%(objecttype)\t%(taggeremail)", "refs/tags"], cwd);
  return out ? out.split("\n").map((line) => {
    const [name, objecttype, taggeremail = ""] = line.split("\t");
    return { name, objecttype, email: taggeremail.replace(/^<|>$/g, "") };
  }) : [];
}

export function check({ cwd = root } = {}) {
  const all = tags(cwd);
  const failures = [];
  if (all.length === 0) {
    // Not a pass. A guard that saw nothing has agreed with nothing, and a clone
    // without tags is the state in which this would silently stop working.
    failures.push(
      "no tags are visible here, so nothing was checked. Fetch them (`git fetch --tags`)\n" +
      "  and run this again; a check with no subject is not a check that passed.",
    );
    return { checked: 0, failures };
  }
  const light = all.filter((t) => t.objecttype !== "tag");
  const wrong = all.filter((t) => t.objecttype === "tag" && !NOREPLY_ALIAS.test(t.email));
  if (light.length) {
    failures.push(
      `${light.length} lightweight tag(s) have no tagger at all, so GitHub judges the commit they\n` +
      "  point at, and these point at commits with a personal address:\n" +
      light.map((t) => `    · ${t.name}`).join("\n"),
    );
  }
  if (wrong.length) {
    failures.push(
      `${wrong.length} annotated tag(s) were made with an address that is not the no-reply alias:\n` +
      wrong.map((t) => `    · ${t.name} <${t.email}>`).join("\n"),
    );
  }
  return { checked: all.length, failures };
}

function main() {
  const { checked, failures } = check();
  if (failures.length === 0) {
    console.log(`OK: ${checked} tag(s), every one of them pushable to the primary.`);
    return 0;
  }
  console.error(`\ntags-are-pushable: ${failures.length} thing(s) are not true of this repository.\n`);
  for (const f of failures) console.error(`  - ${f}\n`);
  console.error(
    "Re-make each one at the same commit with the alias as tagger:\n" +
    "  git tag -a -f -m '<what it is>' <name> <name>^{}   (with user.email set to the alias)\n" +
    "See docs/REPO_TRUTH.md. Do NOT switch off the account's e-mail protection instead.",
  );
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main());

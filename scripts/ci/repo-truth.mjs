#!/usr/bin/env node
// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// What people can read is what they run — checked, not asserted.
//
// On 2026-09-07 this repository had three answers to "where is the editor's
// source". The release branch was 321 commits of work; the public editor
// repository was a separate 58-commit lineage last touched in April, with NO
// COMMON ANCESTOR at all; and the version people were downloading, beta.21, was
// named nowhere. Nobody had lied — every state was reachable and every state
// was reasonable on its own. There was simply nothing that compared them.
//
// This guard compares them, on three questions:
//
//   1. Is the commit the shipped binaries were built from on this branch?
//      docs/SHIPPED.json names it. A binary whose source you cannot name is a
//      binary you cannot reproduce, and there is no tag standing in for it:
//      1.0.0-beta.21 says "final" and "not final" in one breath, so the next
//      release is 1.0.0 and it gets the first tag this repository has earned.
//   2. Does the public repository carry exactly the published half of that tag?
//      Blob for blob, using docs/PUBLIC_TREE.json to decide what "published"
//      means. Not "roughly", not "the same version number".
//   3. Is the gap between the tag and the branch still small enough to close in
//      an afternoon? Both limits are below, and both are the same argument as
//      the merge-request staleness rule: 279 commits and four and a half months
//      is not a backlog you clear, it is work you redo.
//
// Every failure here is a fact about the repository, not about the code in it.
// Repairing it is a publication, and publication is deliberate: see
// docs/REPO_TRUTH.md for the procedure and scripts/ci/publish-public-snapshot.mjs
// for the machinery.
//
// usage: node scripts/ci/repo-truth.mjs [--no-fetch] [--trunk <ref>]
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { loadManifest, publicationDiff, staleEntries, treeOf, root } from "./public-tree.mjs";

// The release-in-progress window. A release is cut, the binaries are built and
// signed off-pipeline, and only then is the snapshot published; meanwhile work
// keeps landing. That gap is normal. What is not normal is the gap staying open
// long enough to become a second version of the truth, so it is bounded on both
// axes and the numbers are in docs/REPO_TRUTH.md with the reasoning.
export const MAX_UNPUBLISHED_COMMITS = 25;
export const MAX_UNPUBLISHED_DAYS = 14;

// Overridable so a test, or a rehearsal of a publication, can point the same
// logic at a local ref instead of the live repository. The defaults are the real
// thing; nothing silently falls back to a copy.
export const PUBLIC_URL = process.env.PDFLUENT_PUBLIC_URL || "https://github.com/pdfluent/pdfluent.git";
export const PUBLIC_REF = process.env.PDFLUENT_PUBLIC_REF || "refs/remotes/pdfluent-public/main";
const TRUNK_CANDIDATES = ["refs/remotes/gitlab/release/ga-readiness", "HEAD"];

function git(args, opts = {}) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts }).trim();
}

function exists(ref) {
  try { git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], { stdio: ["ignore", "pipe", "ignore"] }); return true; }
  catch { return false; }
}

function isAncestor(a, b) {
  try { git(["merge-base", "--is-ancestor", a, b]); return true; } catch { return false; }
}

/**
 * Semver-ish comparison, enough to answer "is this one newer".
 *
 * Only the numeric core is compared, and a prerelease sorts below the release
 * it leads to — `1.0.0-beta.21` is older than `1.0.0`. Nothing here needs the
 * full grammar: it decides one question, and the question is which way a
 * version moved.
 */
export function isNewer(a, b) {
  const parse = (v) => {
    const [core, pre = ""] = String(v).split("-", 2);
    return { nums: core.split(".").map((n) => Number.parseInt(n, 10) || 0), pre };
  };
  const x = parse(a), y = parse(b);
  for (let i = 0; i < 3; i++) {
    if ((x.nums[i] ?? 0) !== (y.nums[i] ?? 0)) return (x.nums[i] ?? 0) > (y.nums[i] ?? 0);
  }
  if (x.pre === y.pre) return false;
  if (x.pre === "") return true;   // a release is newer than any prerelease of it
  if (y.pre === "") return false;
  return x.pre > y.pre;
}

/** Whether this repository already carries the release tag for a version. */
export function tagExists(version, { ref = `refs/tags/v${version}` } = {}) {
  return exists(ref);
}

/**
 * A cut in progress, which is not a drift.
 *
 * The bumps land as one commit and the record of what was built lands as
 * another, because the second one has to name the first one's sha and that does
 * not exist until it does. Between those two commits package.json names a
 * version docs/SHIPPED.json has never heard of — the state every release passes
 * through, and the state this guard used to call a failure.
 *
 * Narrow on purpose, because the failure it replaces is a real one. All three
 * have to hold: the version moved forward, the tag for it does not exist yet,
 * and therefore nothing has been built or published under it. Once the tag
 * exists, a SHIPPED.json that has not followed is exactly the drift this guard
 * is for, and it goes back to being red.
 */
export function cutInProgress(pkgVersion, shippedVersion, { hasTag = tagExists } = {}) {
  if (pkgVersion === shippedVersion) return null;
  if (!isNewer(pkgVersion, shippedVersion)) return null;
  if (hasTag(pkgVersion)) return null;
  return (
    `package.json says ${pkgVersion} and docs/SHIPPED.json still describes ${shippedVersion}, ` +
    `with no v${pkgVersion} tag yet: a cut in progress, not a drift. The record of what was ` +
    "built follows the tag, and this leg goes back to failing the moment that tag exists."
  );
}

export function shippedVersion() {
  return JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version;
}

export function shipped() {
  const s = JSON.parse(readFileSync(resolve(root, "docs/SHIPPED.json"), "utf8"));
  if (!s.version || !/^[0-9a-f]{40}$/.test(s.commit || "")) {
    throw new Error("repo-truth: docs/SHIPPED.json needs a version and a full 40-character commit.");
  }
  return s;
}

function resolveTrunk(explicit) {
  if (explicit) {
    if (!exists(explicit)) throw new Error(`repo-truth: --trunk ${explicit} does not resolve to a commit.`);
    return explicit;
  }
  for (const ref of TRUNK_CANDIDATES) if (exists(ref)) return ref;
  throw new Error("repo-truth: no release branch to compare against; pass --trunk.");
}

function fetchPublic() {
  try {
    git(["fetch", "--no-tags", "--quiet", PUBLIC_URL, `+refs/heads/main:${PUBLIC_REF}`]);
  } catch (e) {
    // A guard that cannot reach the thing it compares against has not agreed
    // with it. This is the whole reason it is not `|| true`.
    throw new Error(
      `repo-truth: could not read ${PUBLIC_URL} (${String(e.message).split("\n")[0]}).\n` +
      "Not a pass: the public repository is the other half of this comparison.",
    );
  }
}

// The public snapshot says where it came from, in its own commit message. That
// trailer is the only thing that makes "is the public repository up to date"
// answerable at all: the two histories share no ancestor, so git cannot tell you
// and a version number in package.json is a claim, not a measurement.
export const PUBLISHED_FROM = /^Published-from:\s*([0-9a-f]{7,40})\s*$/m;

export function publishedFrom(ref) {
  const m = PUBLISHED_FROM.exec(git(["log", "-1", "--format=%B", ref]));
  return m ? m[1] : null;
}

// The day scripts/quality/release_suite.sh landed. Before it, a release could
// not have a report; after it, a release without one was published unjudged.
export const SUITE_FIRST_SHIPPED = "2026-09-08";

export function qualityReportFailures(record, { root: base = root } = {}) {
  const failures = [];
  const q = record.quality_reports;
  if (!q || typeof q !== "object") {
    failures.push(
      "docs/SHIPPED.json has no `quality_reports`: nothing says whether the binaries people\n" +
      "  downloaded were ever judged against the release quality suite.",
    );
    return failures;
  }
  for (const platform of ["macos", "windows"]) {
    const named = q[platform];
    if (named === null || named === undefined) {
      if (record.recorded && record.recorded >= SUITE_FIRST_SHIPPED) {
        failures.push(
          `docs/SHIPPED.json names no ${platform} quality report for ${record.version}, and it was\n` +
          `  recorded on ${record.recorded}, after the suite existed (${SUITE_FIRST_SHIPPED}). Either the\n` +
          "  report is missing or the release was published without one.",
        );
      }
      continue;
    }
    const p = resolve(base, String(named));
    if (!existsSync(p)) { failures.push(`docs/SHIPPED.json names ${named}, which is not a file here.`); continue; }
    let report;
    try { report = JSON.parse(readFileSync(p, "utf8")); }
    catch (e) { failures.push(`${named} is not valid JSON: ${String(e.message).split("\n")[0]}`); continue; }
    if (String(named).endsWith(".override.json")) {
      if (!/^\d+$/.test(String(report.ticket || ""))) {
        failures.push(`${named} is an override with no ticket number. An exception nobody has to answer for is not an exception.`);
      }
      continue;
    }
    if (report.verdict !== "PASS" || report.exit_code !== 0) {
      failures.push(`${named} says ${report.verdict} (exit ${report.exit_code}); the binaries were published on a report that did not pass.`);
    }
    if (report.version !== record.version) {
      failures.push(`${named} judged ${report.version} and docs/SHIPPED.json describes ${record.version}.`);
    }
  }
  return failures;
}

export function check({ trunk, fetch = true } = {}) {
  const manifest = loadManifest();
  const trunkRef = resolveTrunk(trunk);
  if (fetch) fetchPublic();
  if (!exists(PUBLIC_REF)) throw new Error(`repo-truth: ${PUBLIC_REF} is missing and --no-fetch was given.`);

  const version = shippedVersion();
  const failures = [];
  const facts = [];
  const trunkSha = git(["rev-parse", trunkRef]);

  facts.push(`shipped version    ${version}`);
  facts.push(`release branch     ${trunkRef} ${trunkSha.slice(0, 7)}`);
  facts.push(`public main        ${git(["rev-parse", "--short", PUBLIC_REF])}`);

  const stale = staleEntries(treeOf(trunkRef), manifest);
  if (stale.length) {
    failures.push(
      `docs/PUBLIC_TREE.json holds ${stale.length} entries that match nothing on ${trunkRef}:\n` +
      stale.map((p) => `    · ${p}`).join("\n") +
      "\n  A manifest that names files nobody has is a manifest nobody has read.",
    );
  }

  // 1. The commit the shipped binaries came from is named, and is on this branch.
  let shippedSha = null;
  const record = shipped();
  facts.push(`shipped source     ${record.commit.slice(0, 7)} (docs/SHIPPED.json, ${record.version})`);
  const cutting = cutInProgress(version, record.version);
  if (cutting) {
    facts.push(`cut in progress    ${cutting}`);
  } else if (record.version !== version) {
    failures.push(
      `docs/SHIPPED.json describes ${record.version} and package.json says ${version}.\n` +
      "  One of the two is stale, and neither says which.",
    );
  }
  if (!exists(record.commit)) {
    failures.push(`docs/SHIPPED.json names ${record.commit.slice(0, 12)}, which is not a commit here.`);
  } else {
    shippedSha = record.commit;
    if (!isAncestor(shippedSha, trunkRef)) {
      failures.push(
        `${shippedSha.slice(0, 7)} is not an ancestor of ${trunkRef}: what people downloaded was\n` +
        "  not built from the release branch.",
      );
    }
  }

  // 1b. And the binaries were judged before they were published.
  //
  // Null is allowed for exactly one reason: the release predates the suite. The
  // date below is the day the suite landed; anything shipped after it that
  // names no report was published without one, which is the state this leg
  // exists to make visible.
  for (const f of qualityReportFailures(record)) failures.push(f);

  // 2. The public repository says which commit it was published from.
  const from = publishedFrom(PUBLIC_REF);
  if (!from) {
    failures.push(
      "the public repository does not say what it was published from: its head carries no\n" +
      "  `Published-from:` trailer. The two histories share no ancestor, so without that\n" +
      "  line nothing can tell whether it is current — which is the state it was in when\n" +
      "  it sat four and a half months behind the binaries and nobody noticed.",
    );
    return { facts, failures, trunkRef };
  }
  facts.push(`published from     ${from.slice(0, 7)}`);
  if (!exists(from)) {
    failures.push(`the public repository claims it was published from ${from.slice(0, 12)}, which is not a commit here.`);
    return { facts, failures, trunkRef };
  }
  if (!isAncestor(from, trunkRef)) {
    failures.push(
      `the public repository was published from ${from.slice(0, 7)}, which is not on ${trunkRef}.\n` +
      "  It carries code from somewhere else.",
    );
  }
  if (shippedSha && !isAncestor(shippedSha, from)) {
    failures.push(
      `what was published (${from.slice(0, 7)}) does not contain ${shippedSha.slice(0, 7)}: the code people\n` +
      "  can read is older than the binaries they downloaded.",
    );
  }

  // 3. And it carries exactly that, blob for blob.
  const diff = publicationDiff(PUBLIC_REF, from, manifest);
  facts.push(
    `publication diff   ${diff.publishedCount} published, ${diff.kept.length} public-only kept, ` +
    `${diff.added.length} added / ${diff.changed.length} changed / ${diff.removed.length} removed`,
  );
  const drift = diff.added.length + diff.changed.length + diff.removed.length;
  if (drift > 0) {
    const sample = [...diff.added.slice(0, 3), ...diff.changed.slice(0, 3), ...diff.removed.slice(0, 3)];
    failures.push(
      `the public repository does not carry what it claims: ${drift} files differ from the\n` +
      `  published half of ${from.slice(0, 7)}\n` +
      sample.map((p) => `    · ${p}`).join("\n") +
      `${drift > sample.length ? `\n    · … and ${drift - sample.length} more` : ""}`,
    );
  }

  // 4. The gap is still one an afternoon can close.
  const behind = Number(git(["rev-list", "--count", `${from}..${trunkRef}`]));
  facts.push(`unpublished        ${behind} commits on ${trunkRef}`);
  if (behind > MAX_UNPUBLISHED_COMMITS) {
    failures.push(
      `${behind} commits have landed since the last publication, over the ${MAX_UNPUBLISHED_COMMITS} the window allows.\n` +
      "  Publish, or the branch becomes a second version of the truth.",
    );
  }
  if (behind > 0) {
    const oldest = git(["log", "--format=%ct", "--reverse", `${from}..${trunkRef}`]).split("\n")[0];
    const days = Math.floor((Date.now() / 1000 - Number(oldest)) / 86400);
    facts.push(`oldest unpublished ${days} days`);
    if (days > MAX_UNPUBLISHED_DAYS) {
      failures.push(
        `the oldest unpublished commit is ${days} days old, over the ${MAX_UNPUBLISHED_DAYS} the window allows.\n` +
        "  Republishing is an afternoon at two weeks and a rewrite at four months.",
      );
    }
  }
  return { facts, failures, trunkRef };
}

function main(argv) {
  let result;
  try {
    result = check({
      fetch: !argv.includes("--no-fetch"),
      trunk: argv.includes("--trunk") ? argv[argv.indexOf("--trunk") + 1] : undefined,
    });
  } catch (e) { console.error(`\n${e.message}\n`); return 1; }

  for (const f of result.facts) console.log(`  ${f}`);
  if (result.failures.length === 0) {
    console.log("\nOK: the public repository carries the code the published binaries were built from.");
    return 0;
  }
  console.error(`\nrepo-truth: ${result.failures.length} thing(s) are not true of this repository.\n`);
  for (const f of result.failures) console.error(`  - ${f}\n`);
  console.error("See docs/REPO_TRUTH.md for what to do about each of these.");
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv.slice(2)));

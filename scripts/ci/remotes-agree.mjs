#!/usr/bin/env node
// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// The trunk exists in more than one place — checked, not assumed.
//
// GitHub is the primary remote for every PDFluent repository and GitLab holds
// the CI project and the nightly backup. On 2026-09-08 the editor trunk did not
// follow that: `release/ga-readiness` was on GitLab and nowhere else, so every
// landing since 2026-08-21 — the trunk history, the internal tests, the quality
// ratchets, the store material — had exactly one copy. The nightly mirror could
// not repair it either, because it copies GitHub to GitLab and there was nothing
// on GitHub to copy (#455).
//
// scripts/cos/editor_land.sh now pushes GitHub first and fails the landing if
// that push fails, so a commit cannot reach CI without reaching the primary.
// This is the half that notices when something else does it anyway: a push
// straight to GitLab, a script edited back, a landing finished by hand. It runs
// on the trunk and asks one question — is the commit CI is testing contained in
// the primary's trunk? Behind is red. Ahead is fine: a landing that wrote GitHub
// and was refused by GitLab left the commit landed on the primary, which is the
// correct half to keep.
//
// It cannot pass without reading the primary. A guard that shrugs when it cannot
// reach the thing it compares against has not compared anything, and the state
// this exists to catch is exactly the state where nobody looked.
//
// usage: node scripts/ci/remotes-agree.mjs [--trunk <ref>]
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const root = process.env.PDFLUENT_REPO_DIR || resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// The branch this repository lands on, on both remotes.
export const TRUNK_BRANCH = process.env.PDFLUENT_TRUNK_BRANCH || "release/ga-readiness";

// The primary. HTTPS by default, which is what a developer's machine already has
// credentials for; the CI runner has no GitHub credential at all, so it passes a
// read-only deploy key and the SSH URL below instead. Port 443 rather than 22:
// the runner reaches github.com over HTTPS by definition and outbound 22 is the
// port a network is most likely to have closed.
// Which copy this run is checking. The interesting copy is always the one CI is
// NOT running on: while the gate lived on GitLab it asked about GitHub, and now
// that it runs on GitHub it asks about the GitLab backup. Same question, same
// failure — a trunk with one copy — so the label travels with the URL rather
// than being baked into the sentences below.
export const REMOTE_LABEL = process.env.PDFLUENT_AGREE_LABEL || "primary";
export const PRIMARY_URL = process.env.PDFLUENT_PRIMARY_URL || "https://github.com/pdfluent/pdfluent-internal.git";
export const PRIMARY_SSH_URL = process.env.PDFLUENT_PRIMARY_SSH_URL || "ssh://git@ssh.github.com:443/pdfluent/pdfluent-internal.git";
const PRIMARY_REF = "refs/remotes/pdfluent-primary/trunk";

// GitHub's own host key, so the deploy key is never offered to whatever answers
// on that address. Published at https://api.github.com/meta; pinning it here
// keeps `StrictHostKeyChecking=yes` usable in a container with no known_hosts.
const GITHUB_HOST_KEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl";

/**
 * A URL fit to print.
 *
 * Reaching a private remote can mean a credential in the URL, and everything
 * this script says about a remote names it. A token that reaches a job log has
 * left the building: it happened here once already, twelve characters of it, in
 * a Linux build log. Nothing prints a URL except through this.
 */
export const shown = (url) => String(url).replace(/\/\/[^@/]*@/, "//***@");

function git(args, opts = {}) {
  // GIT_TERMINAL_PROMPT=0: without it a read of the primary with no credential
  // sits waiting for a username instead of failing, and a job that hangs reads
  // like a slow runner rather than a guard that cannot see what it judges.
  const env = { ...(opts.env ?? process.env), GIT_TERMINAL_PROMPT: "0" };
  return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts, env }).trim();
}

/**
 * A private key and a known_hosts file for this process only.
 *
 * The key arrives base64-encoded because a GitLab CI variable can only be masked
 * when it is one line, and an unmasked private key is a private key in every job
 * log that happens to echo its environment.
 */
function sshEnv(keyB64) {
  const dir = mkdtempSync(join(tmpdir(), "pdfluent-primary-"));
  const key = join(dir, "id");
  const hosts = join(dir, "known_hosts");
  writeFileSync(key, Buffer.from(keyB64, "base64").toString("utf8").trimEnd() + "\n", { mode: 0o600 });
  writeFileSync(hosts, ["github.com", "ssh.github.com", "[ssh.github.com]:443"].map((h) => `${h} ${GITHUB_HOST_KEY}`).join("\n") + "\n");
  const command = `ssh -i ${key} -o IdentitiesOnly=yes -o UserKnownHostsFile=${hosts} -o StrictHostKeyChecking=yes -o BatchMode=yes`;
  return { dir, env: { GIT_SSH_COMMAND: command } };
}

/**
 * Read the primary's trunk into a tracking ref and return its commit.
 *
 * Throws when the primary cannot be read, and returns null only when the read
 * succeeded and the branch genuinely is not there — which is itself a failure
 * below, but a different one, and saying which is the whole job.
 */
export function fetchPrimary({ url = PRIMARY_URL, sshUrl = PRIMARY_SSH_URL, keyB64 = process.env.PDFLUENT_PRIMARY_SSH_KEY_B64, branch = TRUNK_BRANCH } = {}) {
  const ssh = keyB64 ? sshEnv(keyB64) : null;
  const where = ssh ? sshUrl : url;
  const opts = ssh ? { env: { ...process.env, ...ssh.env } } : {};
  try {
    if (!git(["ls-remote", "--heads", where, branch], opts)) return { url: where, commit: null };
    git(["fetch", "--no-tags", "--quiet", where, `+refs/heads/${branch}:${PRIMARY_REF}`], opts);
    return { url: where, commit: git(["rev-parse", PRIMARY_REF]) };
  } catch (e) {
    // The credential is the first thing to go. The deploy key depends on an
    // organisation setting somebody may switch back, and the fallback — HTTPS
    // against a private repository — cannot work unattended, so say which of
    // the two failed rather than leaving a git error to be read as a network
    // blip.
    const why = ssh
      ? "the deploy key was refused or the address was unreachable"
      : "no credential: PDFLUENT_PRIMARY_SSH_KEY_B64 is not set, and the primary is private";
    throw new Error(
      `remotes-agree: could not read ${branch} from ${shown(where)} — ${why}\n` +
      `  (${String(e.message).split("\n")[0]})\n` +
      `  Not a pass: the ${REMOTE_LABEL} is the other half of this comparison.`,
    );
  } finally {
    if (ssh) rmSync(ssh.dir, { recursive: true, force: true });
  }
}

export function check({ commit, primary, branch = TRUNK_BRANCH }) {
  const facts = [`commit under test  ${commit.slice(0, 7)}`, `${REMOTE_LABEL.padEnd(18)} ${shown(primary.url)}`];
  const failures = [];
  if (!primary.commit) {
    failures.push(
      `the ${REMOTE_LABEL} has no ${branch} at all: the trunk exists in one place.\n` +
      "  Push it — scripts/cos/editor_land.sh does this on every landing — and see docs/REPO_TRUTH.md.",
    );
    return { facts, failures };
  }
  facts.push(`${REMOTE_LABEL} ${branch.padEnd(10)} ${primary.commit.slice(0, 7)}`);
  let contained = false;
  try { git(["merge-base", "--is-ancestor", commit, primary.commit]); contained = true; } catch { contained = false; }
  if (contained) {
    const ahead = Number(git(["rev-list", "--count", `${commit}..${primary.commit}`]));
    facts.push(`${REMOTE_LABEL} is${" ".repeat(Math.max(1, 16 - REMOTE_LABEL.length))}${ahead === 0 ? "level with this commit" : `${ahead} commit(s) ahead`}`);
    return { facts, failures };
  }
  let behind = "some";
  try { behind = git(["rev-list", "--count", `${primary.commit}..${commit}`]); } catch { /* unrelated histories */ }
  failures.push(
    `the ${REMOTE_LABEL} does not contain ${commit.slice(0, 7)}: it is ${behind} commit(s) behind ${branch}.\n` +
    `  A landing reached CI without reaching the ${REMOTE_LABEL}, so this history has one copy again.\n` +
    "  Push the trunk to the primary; scripts/cos/editor_land.sh does it GitHub-first for a reason.",
  );
  return { facts, failures };
}

// The branches this runs on. A merge request has not landed yet, so the primary
// cannot be expected to carry it; anything else is a branch nobody releases
// from. Both are announced rather than passed silently — a skip that reads like
// a pass is how a check stops existing without anyone deciding it should.
export function reasonToSkip(env = process.env) {
  if (env.CI_PIPELINE_SOURCE === "merge_request_event") return "a merge request has not landed on the trunk yet";
  if (env.GITHUB_EVENT_NAME === "pull_request") return "a pull request has not landed on the trunk yet";
  // GitLab names the branch CI_COMMIT_BRANCH and GitHub GITHUB_REF_NAME. Both
  // are read: the gate moved hosts in #465 and a guard that only knew the old
  // names would have started enforcing on every branch instead of the trunk.
  const branch = env.CI_COMMIT_BRANCH || (env.GITHUB_REF_TYPE === "branch" ? env.GITHUB_REF_NAME : undefined);
  if (branch && branch !== TRUNK_BRANCH) return `this is ${branch}, not ${TRUNK_BRANCH}`;
  return null;
}

function main(argv) {
  const skip = reasonToSkip();
  if (skip) { console.error(`SKIPPED (not a pass): ${skip}`); return 0; }
  const ref = argv.includes("--trunk") ? argv[argv.indexOf("--trunk") + 1] : (process.env.CI_COMMIT_SHA || "HEAD");
  let result;
  try {
    result = check({ commit: git(["rev-parse", ref]), primary: fetchPrimary() });
  } catch (e) { console.error(`\n${e.message}\n`); return 1; }
  for (const f of result.facts) console.log(`  ${f}`);
  if (result.failures.length === 0) {
    console.log(`\nOK: the ${REMOTE_LABEL} carries the commit CI is testing.`);
    return 0;
  }
  console.error(`\nremotes-agree: ${result.failures.length} thing(s) are not true of this repository.\n`);
  for (const f of result.failures) console.error(`  - ${f}\n`);
  console.error("See docs/REPO_TRUTH.md.");
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv.slice(2)));

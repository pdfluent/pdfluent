// SPDX-License-Identifier: LicenseRef-PDFluent-Proprietary
// Copyright (c) 2026 Innovation Trigger B.V.
//
// Drift-guard: the editor builds against one pinned revision of the PDFluent
// engine, never against a checkout that happens to sit next to this repository.
//
// Until 2026-09-07 all nineteen engine crates were path dependencies into
// `../../../XFA`. That directory was another session's working copy, on its own
// branch, with uncommitted changes, 886 commits behind the engine's master; CI
// cloned a third branch again. The visible cost was that every PDF/A export
// carried a promotional stamp the engine had already removed — the editor built
// against a revision from before the removal and nobody could see which.
//
// This guard fails if a path dependency comes back, if the pinned revisions
// drift apart, or if CI goes back to cloning the engine next to the checkout.
// What comes out of the pinned engine is a separate question, answered by
// `src-tauri/src/pdfa_export_guard.rs`.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CARGO_TOML = readFileSync(join(ROOT, 'src-tauri/Cargo.toml'), 'utf8');
const CARGO_LOCK = readFileSync(join(ROOT, 'src-tauri/Cargo.lock'), 'utf8');
const GITLAB_CI = readFileSync(join(ROOT, '.gitlab-ci.yml'), 'utf8');

const ENGINE_GIT_URL = 'https://github.com/pdfluent/engine';

/** Every engine crate the editor depends on, by the name Cargo resolves to
 *  (the `package = ...` rename where there is one). Shrinking this list is a
 *  product decision, so it is spelled out rather than derived from the file. */
const ENGINE_CRATES = [
  'pdf-engine',
  'pdfluent-forms',
  'pdf-annot',
  'pdfluent-sign',
  'pdf-manip',
  'pdf-text-format',
  'pdf-compliance',
  'pdfluent-extract',
  'pdf-redact',
  'pdf-docx',
  'pdf-xlsx',
  'pdf-pptx',
  'pdf-invoice',
  'pdfluent-lopdf',
  'pdf-syntax',
  'pdfluent',
];

/** `{ alias, package, git, rev }` for every dependency line with a `git = `. */
function gitDependencies(): { alias: string; package: string; git: string; rev: string }[] {
  const out: { alias: string; package: string; git: string; rev: string }[] = [];
  for (const line of CARGO_TOML.split('\n')) {
    const decl = line.match(/^([A-Za-z0-9_-]+)\s*=\s*\{(.*)\}\s*$/);
    if (!decl) continue;
    const [, alias, body] = decl;
    const git = body.match(/\bgit\s*=\s*"([^"]+)"/);
    if (!git) continue;
    const rev = body.match(/\brev\s*=\s*"([^"]+)"/);
    const renamed = body.match(/\bpackage\s*=\s*"([^"]+)"/);
    out.push({ alias, package: renamed?.[1] ?? alias, git: git[1], rev: rev?.[1] ?? '' });
  }
  return out;
}

describe('SDK pin drift-guard', () => {
  const deps = gitDependencies();

  it('has no path dependency into a neighbouring engine checkout', () => {
    // Any relative path out of the repository puts the build back at the mercy
    // of whatever that directory holds today.
    expect(CARGO_TOML).not.toMatch(/path\s*=\s*"\.\..*XFA/);
    expect(CARGO_TOML).not.toContain('../../../XFA');
    expect(CARGO_LOCK).not.toContain('/XFA/');
  });

  it('pins every engine crate to the same repository and revision', () => {
    const engineDeps = deps.filter(d => d.git === ENGINE_GIT_URL);
    expect(
      engineDeps.map(d => d.package).sort(),
      'the set of engine crates changed',
    ).toEqual([...ENGINE_CRATES].sort());

    const revs = new Set(engineDeps.map(d => d.rev));
    expect(revs.size, `engine crates pinned at ${revs.size} different revisions`).toBe(1);
    const [rev] = [...revs];
    expect(rev, 'the pin must be a full 40-character commit sha, not a branch').toMatch(
      /^[0-9a-f]{40}$/,
    );
  });

  it('locks the same revision it pins', () => {
    const rev = deps.find(d => d.git === ENGINE_GIT_URL)?.rev ?? '';
    const locked = [...CARGO_LOCK.matchAll(/source = "git\+([^"?]+)\?rev=([^"#]+)#/g)];
    expect(locked.length, 'Cargo.lock resolves no engine crate from git').toBeGreaterThan(0);
    for (const [, url, lockedRev] of locked) {
      expect(url).toBe(ENGINE_GIT_URL);
      expect(lockedRev).toBe(rev);
    }
    for (const crate of ENGINE_CRATES) {
      expect(CARGO_LOCK, `Cargo.lock has no git entry for ${crate}`).toContain(
        `name = "${crate}"`,
      );
    }
  });

  it('no longer depends on the deleted licence crate', () => {
    // `xfa-license` does not exist on the engine's master: the whole tier and
    // capability mechanism was removed there on 2026-09-06.
    expect(CARGO_TOML).not.toContain('xfa-license');
    expect(CARGO_LOCK).not.toContain('name = "xfa-license"');
  });

  it('does not clone the engine next to the checkout in CI', () => {
    // The clone was the third source of truth: a branch of its own, pinned
    // nowhere, that only tag pipelines ever exercised.
    expect(GITLAB_CI).not.toContain('xfa/sdk-phase2-commit-loop');
    expect(GITLAB_CI).not.toMatch(/git clone[^\n]*XFA/);
  });

  it('lets the CI runner reach the pinned revision through the engine mirror', () => {
    // The runner has a GitLab token, not a GitHub one, and the engine's GitLab
    // side is a mirror of the same history — so CI rewrites the URL instead of
    // carrying a second credential. Every job that compiles Rust needs it, and
    // they all get it from the same `*sdk-pin` block.
    expect(GITLAB_CI).toMatch(/insteadOf "https:\/\/github\.com\/pdfluent\/engine"/);
    // `stage:` is what separates a job from the variables block and the shared
    // anchors, which mention cargo without ever running it.
    const rustJobs = GITLAB_CI.split(/\n(?=[a-z][a-z0-9-]*:\n)/).filter(
      job => /^\s{2}stage:/m.test(job) && /^\s+- (cargo|npm run tauri build)\b/m.test(job),
    );
    expect(rustJobs.length, 'no CI job compiles Rust any more').toBeGreaterThan(0);
    for (const job of rustJobs) {
      expect(job, `a Rust job cannot resolve the engine pin:\n${job.slice(0, 200)}`).toContain(
        '*sdk-pin',
      );
    }
  });

  it('spells the pin the same way in CI as in Cargo.toml', () => {
    // Two files naming the same revision is a drift waiting to happen: CI needs
    // the value before cargo reads it, to report a lagging mirror as such.
    const rev = gitDependencies().find(d => d.git === ENGINE_GIT_URL)?.rev ?? '';
    const ciRev = GITLAB_CI.match(/^\s*XFA_SDK_REV:\s*"([0-9a-f]{40})"/m)?.[1];
    expect(ciRev, '.gitlab-ci.yml declares no XFA_SDK_REV').toBeDefined();
    expect(ciRev).toBe(rev);
    // And CI checks it too, so a Cargo.toml bumped on its own fails the job
    // rather than building a revision the mirror was never asked about.
    expect(GITLAB_CI).toContain('is not the revision src-tauri/Cargo.toml pins');
  });

  it('never prints part of the clone credential into a job log', () => {
    // A `${XFA_CLONE_TOKEN:0:12}` diagnostic put half a PAT in every Linux
    // build log, and job logs outlive the job. Length is diagnosis enough.
    for (const line of GITLAB_CI.split('\n')) {
      if (!/\becho\b/.test(line)) continue;
      expect(line, `a CI job echoes part of a credential:\n${line.trim()}`).not.toMatch(
        /\$\{[A-Z_]*(TOKEN|KEY|SECRET|PASSWORD)[A-Z_]*:\d/,
      );
    }
  });
});

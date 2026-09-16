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

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, it, expect } from 'vitest';
import { scanSdkPin } from './sdkPinSites';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CARGO_TOML = readFileSync(join(ROOT, 'src-tauri/Cargo.toml'), 'utf8');
const CARGO_LOCK = readFileSync(join(ROOT, 'src-tauri/Cargo.lock'), 'utf8');
// The pipeline, as two files: the workflow that declares the pinned revision
// and the composite action every Rust job resolves it through.
const CI_WORKFLOW = readFileSync(join(ROOT, '.github/workflows/quality.yml'), 'utf8');
const SDK_PIN = readFileSync(join(ROOT, '.github/actions/sdk-pin/action.yml'), 'utf8');

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
    for (const source of [CI_WORKFLOW, SDK_PIN]) {
      expect(source).not.toContain('xfa/sdk-phase2-commit-loop');
      expect(source).not.toMatch(/git clone[^\n]*XFA/);
    }
  });

  it('lets the CI runner reach the pinned revision at the engine itself', () => {
    // CI fetches the engine from the engine, with a deploy key that can read
    // that one repository and nothing else. Every job that compiles Rust needs
    // it, and they all get it from the same `*sdk-pin` block.
    //
    // The rewrite lives in GIT_CONFIG_COUNT/KEY/VALUE rather than `git config
    // --global`: on a shell runner --global wrote the route into the runner
    // user's ~/.gitconfig and left it there. See tests/ci-runner-hygiene.test.ts.
    expect(SDK_PIN).toMatch(/GIT_CONFIG_KEY_0=url\.[^\n]*\.insteadOf/);
    expect(SDK_PIN).toMatch(/GIT_CONFIG_VALUE_0=https:\/\/github\.com\/pdfluent\/engine/);
    // A job is a key at indent 2 under `jobs:`; `runs-on` is what separates one
    // from anything else at that depth.
    const rustJobs = CI_WORKFLOW.split(/\n(?= {2}[a-z][a-z0-9-]*:\n)/).filter(
      job => /^ {4}runs-on:/m.test(job) && /^\s+- run: cargo\b/m.test(job),
    );
    expect(rustJobs.length, 'no CI job compiles Rust any more').toBeGreaterThan(0);
    for (const job of rustJobs) {
      expect(job, `a Rust job cannot resolve the engine pin:\n${job.slice(0, 200)}`).toContain(
        'uses: ./.github/actions/sdk-pin',
      );
    }
  });

  it('spells the pin the same way in every workflow as in Cargo.toml', () => {
    // Several files naming the same revision is a drift waiting to happen: CI
    // needs the value before cargo reads it, to report a lagging mirror as such.
    //
    // Every workflow, not the quality one: until 2026-09-16 this compared
    // Cargo.toml with quality.yml alone while release.yml and golden-bless.yml
    // carried the same variable, so a bump that missed release.yml would have
    // shipped a release built against an engine nothing else had tested.
    const scan = scanSdkPin(ROOT);
    expect(scan.problems.join('\n'), 'the engine pin disagrees with itself').toBe('');
    expect(
      scan.sites.some(s => s.file === 'src-tauri/Cargo.toml'),
      'no engine dependency in src-tauri/Cargo.toml carries a rev',
    ).toBe(true);
    // Every workflow that resolves the pin through the composite action has to
    // declare the variable it feeds that action; `problems` is empty above, so
    // this only asserts the set is not silently empty.
    expect(
      scan.workflowsUsingAction.length,
      'no workflow resolves the engine pin through the composite action any more',
    ).toBeGreaterThan(0);
    // And CI checks it too, so a Cargo.toml bumped on its own fails the job
    // rather than building a revision the mirror was never asked about.
    expect(SDK_PIN).toContain('is not the revision src-tauri/Cargo.toml pins');
  });

  it('does not route the engine through the backup copy', () => {
    // It used to, because CI ran there and a GitHub credential was the one
    // thing the runner did not have. The backup is refreshed once a night, so
    // every pin bump in the hours after an engine landing failed on "not on the
    // engine mirror yet" — true, and about the backup rather than about the pin.
    // Pointing this at the backup again brings that back, so it is a decision
    // and not an edit.
    for (const [name, text] of [['the sdk-pin action', SDK_PIN], ['the quality workflow', CI_WORKFLOW]] as const) {
      const routing = text.split('\n').filter(l => /insteadOf|GIT_CONFIG_VALUE_0|fetch -q --depth 1/.test(l));
      for (const line of routing) {
        expect(line, `${name} routes the engine through the backup:\n${line.trim()}`).not.toMatch(/gitlab\.com/);
      }
    }
  });

  it('keeps the deploy key in a file the job owns, at mode 600, on a pinned host key', () => {
    // A key offered to whatever answers on that address is a key offered to
    // whoever is answering.
    expect(SDK_PIN).toContain('chmod 600');
    expect(SDK_PIN).toContain('StrictHostKeyChecking=yes');
    expect(SDK_PIN).not.toContain('StrictHostKeyChecking=accept-new');
  });

  it('removes the deploy key at the end of the job, not at the end of the action', () => {
    // A private key on a shell runner outlives the job unless something deletes
    // it, and "unless something deletes it" is not a property — the always-step
    // is. Which step, though, is the whole of #562: until 2026-09-16 the action
    // deleted the directory itself, in a final `if: always()` step of its own.
    // A composite action has no post step, so that ran when the *action* ended.
    // Every cargo step in the job then had a GIT_SSH_COMMAND naming an identity
    // file that was gone, cargo's git fetch of the engine had nothing left to
    // offer, and six jobs died on "spurious network error" — a sentence about
    // the network, about a deleted key. It had passed for months only because
    // the previous pin was already in the runner's cargo git cache; the first
    // bump after that, to 51f6f1b03, failed every cargo job at once.
    //
    // So the action hands the key over and the job takes it back, last, always.
    // Its header spells the step out for the reader, so the comment lines are
    // documentation rather than a deletion.
    const deletions = SDK_PIN.split('\n').filter(
      line => !/^\s*#/.test(line) && /\brm\s+-[rRf]+\b[^\n]*ENGINE_SSH_DIR/.test(line),
    );
    expect(deletions, 'the sdk-pin action deletes the key before the job can use it').toEqual([]);
    const scan = scanSdkPin(ROOT);
    expect(scan.problems.join('\n'), 'the deploy key does not live for the whole job').toBe('');
    expect(
      scan.jobsUsingAction.length,
      'no job resolves the engine pin through the composite action any more',
    ).toBeGreaterThan(0);
    for (const job of scan.jobsUsingAction) {
      expect(
        job.cleanupAt,
        `${job.file} job ${job.name} does not end by removing the deploy key`,
      ).toBe(job.steps);
    }
  });

  it('never prints part of the clone credential into a job log', () => {
    // A `${XFA_CLONE_TOKEN:0:12}` diagnostic put half a PAT in every Linux
    // build log, and job logs outlive the job. Length is diagnosis enough.
    for (const line of `${CI_WORKFLOW}\n${SDK_PIN}`.split('\n')) {
      if (!/\becho\b/.test(line)) continue;
      expect(line, `a CI job echoes part of a credential:\n${line.trim()}`).not.toMatch(
        /\$\{[A-Z_]*(TOKEN|KEY|SECRET|PASSWORD)[A-Z_]*:\d/,
      );
    }
  });
});

// ── The guard, on trees built here ──────────────────────────────────────────
//
// The case above reads the checkout, so it says nothing about what the guard
// does when the pin *does* drift — and a guard nobody has seen go red is a
// guard nobody has tested. These build the three shapes the pin can be in and
// assert on the message, independent of what this checkout happens to hold.

const AGREED = 'a'.repeat(40);
const LAGGING = 'b'.repeat(40);

const scratch = mkdtempSync(join(tmpdir(), 'sdk-pin-guard-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
let treeCount = 0;

function manifest(rev: string): string {
  return [
    '[dependencies]',
    '# Not the engine, and not the guard\'s business.',
    'serde = { version = "1", features = ["derive"] }',
    `pdf-engine = { git = "https://github.com/pdfluent/engine", rev = "${rev}", features = ["xfa"] }`,
    `pdf-manip = { git = "https://github.com/pdfluent/engine", rev = "${rev}" }`,
    '',
  ].join('\n');
}

/** Where the job removes the deploy key: at its end, too early, or not at all. */
type Cleanup = 'last' | 'early' | 'none';

const CLEANUP_STEP = [
  '      - name: Remove the engine deploy key',
  '        if: always()',
  '        run: rm -rf "${ENGINE_SSH_DIR:-}"',
];

function workflow(rev: string | null, usesAction: boolean, cleanup: Cleanup): string {
  const pin = usesAction
    ? [
        '      - uses: ./.github/actions/sdk-pin',
        '        with:',
        '          revision: ${{ env.XFA_SDK_REV }}',
      ]
    : [];
  const remove = usesAction && cleanup !== 'none' ? CLEANUP_STEP : [];
  return [
    'name: fixture',
    'on: [push]',
    ...(rev === null ? [] : ['env:', `  XFA_SDK_REV: ${rev}`]),
    'jobs:',
    '  build:',
    '    runs-on: [self-hosted]',
    '    steps:',
    '      - uses: actions/checkout@v4',
    ...pin,
    // 'early' is the shape the action itself had: the key is gone before the
    // step that needs it runs.
    ...(cleanup === 'early' ? [...remove, '      - run: cargo build'] : ['      - run: cargo build', ...remove]),
    '',
  ].join('\n');
}

/** The composite action, in the two shapes that matter: it hands the key over,
 *  or it takes it back too early. */
function action(removesKey: boolean): string {
  return [
    'name: SDK pin',
    'runs:',
    '  using: composite',
    '  steps:',
    '    - name: Route the engine dependency over its own deploy key',
    '      shell: bash',
    '      run: echo "ENGINE_SSH_DIR=$dir" >> "$GITHUB_ENV"',
    ...(removesKey
      ? [
          '    - name: Remove the deploy key',
          '      if: always()',
          '      shell: bash',
          '      run: rm -rf "${ENGINE_SSH_DIR:-}"',
        ]
      : []),
    '',
  ].join('\n');
}

/** A checkout-shaped tree: a manifest, some workflows, the action, nothing else. */
function tree(
  manifestRev: string,
  workflows: Record<string, { rev: string | null; usesAction?: boolean; cleanup?: Cleanup }>,
  options: { actionRemovesKey?: boolean } = {},
): string {
  const root = join(scratch, `tree-${(treeCount += 1)}`);
  mkdirSync(join(root, '.github/workflows'), { recursive: true });
  mkdirSync(join(root, '.github/actions/sdk-pin'), { recursive: true });
  mkdirSync(join(root, 'src-tauri'), { recursive: true });
  writeFileSync(join(root, 'src-tauri/Cargo.toml'), manifest(manifestRev));
  writeFileSync(join(root, '.github/actions/sdk-pin/action.yml'), action(options.actionRemovesKey ?? false));
  for (const [name, spec] of Object.entries(workflows)) {
    writeFileSync(
      join(root, '.github/workflows', name),
      workflow(spec.rev, spec.usesAction ?? true, spec.cleanup ?? 'last'),
    );
  }
  return root;
}

const THREE_AGREEING = {
  'golden-bless.yml': { rev: AGREED },
  'quality.yml': { rev: AGREED },
  'release.yml': { rev: AGREED },
};

describe('SDK pin drift-guard, on fixtures', () => {
  it('passes when every workflow and every manifest line name the same revision', () => {
    const scan = scanSdkPin(tree(AGREED, THREE_AGREEING));
    expect(scan.problems).toEqual([]);
    expect(scan.sites).toHaveLength(5); // three workflows, two engine crates
    expect(scan.workflowsUsingAction).toEqual([
      '.github/workflows/golden-bless.yml',
      '.github/workflows/quality.yml',
      '.github/workflows/release.yml',
    ]);
    // And each of those jobs ends by removing the key it was handed.
    expect(scan.jobsUsingAction.map(job => `${job.file}:${job.name}`)).toEqual([
      '.github/workflows/golden-bless.yml:build',
      '.github/workflows/quality.yml:build',
      '.github/workflows/release.yml:build',
    ]);
    for (const job of scan.jobsUsingAction) expect(job.cleanupAt).toBe(job.steps);
  });

  it('names the file and the line of a workflow that lags behind the manifest', () => {
    // The 2026-09-16 near-miss, as a tree: the bump landed in Cargo.toml and in
    // two of the three workflows.
    const scan = scanSdkPin(
      tree(AGREED, { ...THREE_AGREEING, 'release.yml': { rev: LAGGING } }),
    );
    expect(scan.problems).toEqual([
      `.github/workflows/release.yml:4 pins ${LAGGING} but src-tauri/Cargo.toml:4 pins ${AGREED}`,
    ]);
  });

  it('names a manifest line that lags behind the rest of the manifest', () => {
    const root = tree(AGREED, THREE_AGREEING);
    const path = join(root, 'src-tauri/Cargo.toml');
    writeFileSync(path, readFileSync(path, 'utf8').replace(`rev = "${AGREED}" }`, `rev = "${LAGGING}" }`));
    expect(scanSdkPin(root).problems).toEqual([
      `src-tauri/Cargo.toml:5 pins ${LAGGING} but src-tauri/Cargo.toml:4 pins ${AGREED}`,
    ]);
  });

  it('fails a workflow that uses the sdk-pin action without declaring the variable', () => {
    // It would hand the action an empty revision, and the action's own check
    // would then report a sentence about Cargo.toml rather than about the
    // workflow that forgot the variable.
    const scan = scanSdkPin(
      tree(AGREED, { ...THREE_AGREEING, 'release.yml': { rev: null, usesAction: true } }),
    );
    expect(scan.problems).toEqual([
      '.github/workflows/release.yml resolves the engine pin through ./.github/actions/sdk-pin but declares no XFA_SDK_REV',
    ]);
  });

  it('leaves a workflow that never touches the engine alone', () => {
    const scan = scanSdkPin(
      tree(AGREED, { ...THREE_AGREEING, 'compliance.yml': { rev: null, usesAction: false } }),
    );
    expect(scan.problems).toEqual([]);
    expect(scan.workflowsUsingAction).not.toContain('.github/workflows/compliance.yml');
  });

  it('refuses a branch name where a commit sha belongs', () => {
    const scan = scanSdkPin(tree(AGREED, { ...THREE_AGREEING, 'release.yml': { rev: 'master' } }));
    expect(scan.problems).toEqual([
      '.github/workflows/release.yml:4 names master, which is not a full 40-character commit sha',
      `.github/workflows/release.yml:4 pins master but src-tauri/Cargo.toml:4 pins ${AGREED}`,
    ]);
  });

  it('names the workflow and the job that never removes the deploy key', () => {
    // The key outlives the job on a shell runner unless a step of that job
    // removes it, and the action cannot be that step.
    const scan = scanSdkPin(
      tree(AGREED, { ...THREE_AGREEING, 'release.yml': { rev: AGREED, cleanup: 'none' } }),
    );
    expect(scan.problems).toEqual([
      '.github/workflows/release.yml:6 job build uses ./.github/actions/sdk-pin but never removes the deploy key: it needs a final "Remove the engine deploy key" step',
    ]);
    expect(
      scan.jobsUsingAction.find(job => job.file === '.github/workflows/release.yml')?.cleanupAt,
    ).toBeNull();
  });

  it('names a job that removes the deploy key before its last step', () => {
    // #562 as a tree: the key is gone and the cargo step still has to fetch the
    // engine with it. Removing it early is the bug, wherever the early step sits.
    const scan = scanSdkPin(
      tree(AGREED, { ...THREE_AGREEING, 'release.yml': { rev: AGREED, cleanup: 'early' } }),
    );
    expect(scan.problems).toEqual([
      '.github/workflows/release.yml:13 job build removes the deploy key at step 3 of 4; every step after it runs with a deleted identity',
    ]);
  });

  it('fails the composite action that deletes the key itself', () => {
    // What the action did until 2026-09-16. It reads as a job-scoped cleanup
    // and is not one: a composite action has no post step, so `if: always()`
    // there means "when this action ends", which is before cargo runs.
    const scan = scanSdkPin(tree(AGREED, THREE_AGREEING, { actionRemovesKey: true }));
    expect(scan.problems).toEqual([
      ".github/actions/sdk-pin/action.yml:11 removes ENGINE_SSH_DIR inside the composite action, which ends before the job's cargo steps run",
    ]);
  });
});

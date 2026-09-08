// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * A Playwright run that skipped something says so, and the job fails unless
 * that skip was declared.
 *
 * `npx playwright test` exits 0 on a run where every test skipped. The job was
 * green, the summary said 23 tests, and 19 of them had never started -- which
 * is how the UI register came to call `button:export-btn` wired on the strength
 * of a test that does not run.
 *
 * `no-silent-failures.mjs` catches the skips that are written into the source.
 * This catches the ones that are not: a `test.skip(condition)` that fires on
 * the runner, a project filter that matches nothing, a fixture that gives up.
 * The declared set is exactly the `skipped-test` entries of
 * docs/silent_failure_allowlist.json, so there is one list and not two.
 *
 * Usage: node scripts/quality/declared-skips.mjs <playwright-report.json>
 */

import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve as resolvePath, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAllowlist } from './no-silent-failures.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolvePath(HERE, '..', '..');

/**
 * One spelling for a spec file, on both sides of the comparison.
 *
 * Playwright writes `file` relative to its own `rootDir`, which is `testDir`
 * -- so on the runner the report said `smoke-shell.spec.ts` while the
 * allow-list said `tests/e2e/smoke-shell.spec.ts`, and the two never met. The
 * job then failed twice over for opposite reasons: three skips nobody declared,
 * and three declarations that never happened. The same three skips.
 *
 * `rootDir` comes out of the report itself, so a report written with any
 * `testDir` lands on the same key as the allow-list. Absolute paths are the
 * third spelling Playwright uses and they resolve the same way.
 */
export function repoRelative(file, rootDir, repo = REPO) {
  if (!file) return '';
  const absolute = isAbsolute(file) ? file : resolvePath(rootDir || repo, file);
  return relative(repo, absolute).split(sep).join('/');
}

/**
 * Every spec in the JSON report, flattened out of the suite tree.
 *
 * The outermost suite's title is the file name, which `file` already carries,
 * so it is left out of the trail: a title reads as `describe › test`, the way
 * it does in the report.
 */
export function specsIn(report, repo = REPO) {
  const root = report.config?.rootDir;
  const out = [];
  const walk = (suite, trail) => {
    for (const spec of suite.specs ?? []) {
      const status = spec.tests?.[0]?.results?.[0]?.status ?? spec.tests?.[0]?.status ?? 'unknown';
      out.push({ file: repoRelative(spec.file ?? suite.file ?? '', root, repo), title: [...trail, spec.title].join(' › '), status });
    }
    for (const child of suite.suites ?? []) {
      walk(child, child.title ? [...trail, child.title] : trail);
    }
  };
  for (const suite of report.suites ?? []) walk(suite, []);
  return out;
}

/** How many skips the source declares, per file. */
export function declaredSkips(root = REPO) {
  const counts = new Map();
  for (const entry of readAllowlist(root)) {
    if (entry.kind !== 'skipped-test') continue;
    const file = repoRelative(entry.file, root, root);
    counts.set(file, (counts.get(file) ?? 0) + (entry.count ?? 1));
  }
  return counts;
}

/**
 * Skips the report contains that the source does not account for, and files
 * whose declared skips did not happen -- a declaration that has outlived its
 * skip is as stale as an allow-list entry that matches nothing.
 */
export function compare(report, declared) {
  const skipped = specsIn(report).filter((s) => s.status === 'skipped');
  const byFile = new Map();
  for (const spec of skipped) byFile.set(spec.file, (byFile.get(spec.file) ?? 0) + 1);

  const undeclared = [];
  for (const [file, count] of byFile) {
    const allowed = declared.get(file) ?? 0;
    if (count > allowed) undeclared.push({ file, ran: count, declared: allowed });
  }
  const unused = [];
  for (const [file, count] of declared) {
    const ran = byFile.get(file) ?? 0;
    if (ran < count) unused.push({ file, ran, declared: count });
  }
  return { skipped, undeclared, unused };
}

function main() {
  const path = process.argv[2];
  if (!path) {
    console.error('usage: node scripts/quality/declared-skips.mjs <playwright-report.json>');
    process.exit(2);
  }
  let report;
  try {
    report = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    // A missing report is not an absence of skips; it is an absence of evidence,
    // and passing on it would rebuild the hole this check exists to close.
    console.error(`no Playwright report at ${path}: ${error.message}`);
    process.exit(1);
  }

  const { skipped, undeclared, unused } = compare(report, declaredSkips());
  let failed = false;
  if (undeclared.length) {
    failed = true;
    console.error('\nPlaywright skipped more tests than the source declares:\n');
    for (const f of undeclared) console.error(`  ${f.file}: ${f.ran} skipped, ${f.declared} declared`);
    console.error('\nA skip that only happens on the runner is invisible in review.');
    console.error('Make it unconditional and list it in docs/silent_failure_allowlist.json, or fix it.');
  }
  if (unused.length) {
    failed = true;
    console.error('\nDeclared skips that did not happen — remove the entries:\n');
    for (const f of unused) console.error(`  ${f.file}: ${f.ran} skipped, ${f.declared} declared`);
  }
  if (failed) process.exit(1);
  console.log(`declared-skips: ${skipped.length} skipped test(s), all declared.`);
}

if (process.argv[1] && process.argv[1].endsWith('declared-skips.mjs')) main();

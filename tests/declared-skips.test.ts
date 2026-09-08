// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * A Playwright run that skipped is not a Playwright run that passed.
 *
 * `playwright test` exits 0 whether a test ran or was skipped, so the job could
 * be green on a run where 19 of 23 tests never started. The report says which;
 * these are the readings the job acts on.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { specsIn, compare } from '../scripts/quality/declared-skips.mjs';

/** A report shaped like Playwright's JSON reporter, with two skips in one file. */
const REPORT = {
  suites: [
    {
      title: 'visual-e2e-beta-blockers.spec.ts',
      file: 'tests/e2e/visual-e2e-beta-blockers.spec.ts',
      specs: [
        { title: 'VE-001 opens', file: 'tests/e2e/visual-e2e-beta-blockers.spec.ts', tests: [{ results: [{ status: 'passed' }] }] },
        { title: 'VE-003 navigation', file: 'tests/e2e/visual-e2e-beta-blockers.spec.ts', tests: [{ results: [{ status: 'skipped' }] }] },
      ],
      suites: [
        {
          title: 'nested',
          specs: [
            { title: 'VE-004 zoom', file: 'tests/e2e/visual-e2e-beta-blockers.spec.ts', tests: [{ results: [{ status: 'skipped' }] }] },
          ],
        },
      ],
    },
  ],
};

describe('reading a Playwright report', () => {
  it('flattens nested suites, keeping each spec status', () => {
    const specs = specsIn(REPORT);
    expect(specs).toHaveLength(3);
    expect(specs.filter(s => s.status === 'skipped')).toHaveLength(2);
    expect(specs.map(s => s.title)).toContain('nested › VE-004 zoom');
  });
});

describe('what fails the job', () => {
  const file = 'tests/e2e/visual-e2e-beta-blockers.spec.ts';

  it('passes when every skip is declared', () => {
    const { undeclared, unused } = compare(REPORT, new Map([[file, 2]]));
    expect(undeclared).toEqual([]);
    expect(unused).toEqual([]);
  });

  it('fails on a skip the source does not declare', () => {
    // A `test.skip(condition)` that fires only on the runner is invisible in
    // review; this is the reading that catches it.
    const { undeclared } = compare(REPORT, new Map([[file, 1]]));
    expect(undeclared).toEqual([{ file, ran: 2, declared: 1 }]);
  });

  it('fails on a declaration whose skip no longer happens', () => {
    const { unused } = compare(REPORT, new Map([[file, 3]]));
    expect(unused).toEqual([{ file, ran: 2, declared: 3 }]);
  });

  it('fails on a report with no skips at all when skips are declared', () => {
    const clean = { suites: [{ title: 's', file, specs: [{ title: 'a', file, tests: [{ results: [{ status: 'passed' }] }] }] }] };
    expect(compare(clean, new Map([[file, 2]])).unused).toHaveLength(1);
  });
});

describe('this checkout', () => {
  it('runs the checker in the Playwright job, on a report the job writes', () => {
    const ci = readFileSync(new URL('../.gitlab-ci.yml', import.meta.url), 'utf8');
    expect(ci).toContain('PLAYWRIGHT_JSON_OUTPUT_NAME=playwright-report.json');
    expect(ci).toContain('node scripts/quality/declared-skips.mjs playwright-report.json');
  });

  it('does not let a Rust test report ok on a measurement it never ran', () => {
    // It printed "SKIPPED (not a pass)" to a stderr `cargo test` swallows for a
    // passing test, then returned, so the summary said ok. `#[ignore]` is a
    // state the summary prints; asking for it without the variable now fails.
    const guard = readFileSync(new URL('../src-tauri/src/pdfa_export_guard.rs', import.meta.url), 'utf8');
    const test = guard.slice(guard.indexOf('fn pdfa_export_stamps_no_page_of_a_real_document'));
    expect(guard.slice(0, guard.indexOf('fn pdfa_export_stamps_no_page_of_a_real_document')))
      .toContain('#[ignore = "needs PDFLUENT_PDFA_MEASURE_PDF');
    expect(test.slice(0, 400)).toContain('SKIPPED (not a pass)');
    expect(test.slice(0, 400)).not.toContain('return;');
  });

  it('does not let a release check that never ran exit like one that passed', () => {
    const script = readFileSync(new URL('../store/scripts/check-live-listing.sh', import.meta.url), 'utf8');
    expect(script).toContain('skip() { echo "SKIPPED (not a pass): $*" >&2; exit 3; }');
    expect(script).not.toContain('exit 0; }');
    // And the runbooks say what a 3 means, or the exit code is a secret.
    for (const doc of ['../RELEASE.md', '../store/update-runbook.md']) {
      expect(readFileSync(new URL(doc, import.meta.url), 'utf8')).toContain('3');
    }
  });

  it('declares the skips the two live specs carry', () => {
    const allowlist = JSON.parse(
      readFileSync(new URL('../docs/silent_failure_allowlist.json', import.meta.url), 'utf8'),
    ) as { accepted: Array<{ kind: string; file: string; count?: number }> };
    const skips = allowlist.accepted.filter(e => e.kind === 'skipped-test');
    const total = skips.reduce((sum, e) => sum + (e.count ?? 1), 0);
    expect(total).toBe(19);
    expect(new Set(skips.map(e => e.file))).toEqual(new Set([
      'tests/e2e/smoke-shell.spec.ts',
      'tests/e2e/visual-e2e-beta-blockers.spec.ts',
    ]));
  });
});

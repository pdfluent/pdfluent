// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * `features.mjs --gate` reads one platform's test results and decides whether
 * every promise on that platform was proven by this run. A test that was
 * skipped, or that the results do not mention, is not proof: the Definition of
 * Done exists because three times a test existed and nothing ran it.
 *
 * And `--publish` writes what the website reads. The site refuses a copy whose
 * integrity does not match, so the hash has to be the same for the same input.
 */

import { describe, it, expect } from 'vitest';
import { parseJunit, parseCargoLog, scanCargoLog, explainAbsentRust, resolveTest, gate, publish, integrityOf } from '../scripts/quality/features.mjs';

const JUNIT = `<?xml version="1.0" encoding="UTF-8" ?>
<testsuites name="vitest tests" tests="5" failures="1" errors="0">
  <testsuite name="tests/startup-update-check-gate.test.ts" tests="4">
    <testcase classname="tests/startup-update-check-gate.test.ts" name="automatic startup update check &gt; schedules nothing when off" time="0.001">
    </testcase>
    <testcase classname="tests/startup-update-check-gate.test.ts" name="automatic startup update check &gt; schedules the check when on" time="0.001"/>
    <testcase classname="tests/startup-update-check-gate.test.ts" name="other block &gt; is skipped here" time="0">
      <skipped/>
    </testcase>
    <testcase classname="tests\\i18n-locale-detection.test.ts" name="detect &gt; fails" time="0.001">
      <failure message="expected">boom</failure>
    </testcase>
  </testsuite>
</testsuites>`;

const CARGO = [
  '   Compiling pdfluent-desktop v1.0.0',
  '     Running unittests src/lib.rs (target/debug/deps/pdfluent_lib-0123456789abcdef)',
  '',
  'running 3 tests',
  'test pdf_engine::tests::op_merge_pdfs_combines_page_counts ... ok',
  'test pdf_engine::tests::op_split_into_pages_yields_one_pdf_per_page ... FAILED',
  'test pdf_engine::tests::needs_verapdf ... ignored, veraPDF not installed',
  '',
  'test result: FAILED. 1 passed; 1 failed; 1 ignored; 0 measured; 0 filtered out',
  '',
  '     Running tests\\save_is_atomic.rs (target\\debug\\deps\\save_is_atomic-fedcba9876543210.exe)',
  '',
  'running 1 test',
  'test the_save_writes_a_new_file_instead_of_rewriting_the_old_one ... ',
  'SKIPPED (not a pass): this line is the test printing under --nocapture',
  'ok',
  '   Doc-tests pdfluent_lib',
  'test src/lib.rs - example (line 3) ... ok',
].join('\n');

type Test = { id: string; kind: string; platforms: string[] };
type Feature = { id: string; status: string; journeys: string[]; tests: Test[]; owner_stream?: string; group?: string; copy?: object; limits?: string[]; since?: string | null };

const BOTH = ['macos-arm64', 'windows-x64'];
const MERGE = 'pdfluent_lib::pdf_engine::tests::op_merge_pdfs_combines_page_counts';

function results() {
  return { junit: parseJunit(JUNIT), cargo: parseCargoLog(CARGO) };
}

function judge(features: Feature[], platform = 'macos-arm64', journeyTests: object | null = null) {
  return gate({ features }, { platform, results: results(), journeyTests });
}

describe('reading results', () => {
  it('reads every JUnit case with its status, entity-decoded and with forward slashes', () => {
    const cases = parseJunit(JUNIT);
    expect(cases).toHaveLength(4);
    expect(cases[0]).toEqual({ file: 'tests/startup-update-check-gate.test.ts', name: 'automatic startup update check > schedules nothing when off', status: 'pass' });
    expect(cases[1].status).toBe('pass');
    expect(cases[2].status).toBe('skipped');
    expect(cases[3]).toMatchObject({ file: 'tests/i18n-locale-detection.test.ts', status: 'fail' });
  });

  it('reads cargo verdicts per binary, on Linux and Windows paths, with --nocapture output in between', () => {
    expect(parseCargoLog(CARGO)).toEqual({
      [MERGE]: 'pass',
      'pdfluent_lib::pdf_engine::tests::op_split_into_pages_yields_one_pdf_per_page': 'fail',
      'pdfluent_lib::pdf_engine::tests::needs_verapdf': 'skipped',
      'save_is_atomic::the_save_writes_a_new_file_instead_of_rewriting_the_old_one': 'pass',
      'doc:pdfluent_lib::src/lib.rs - example (line 3)': 'pass',
    });
  });

  it('matches a JUnit id by file, by describe block and by full title', () => {
    const r = results();
    const unit = (id: string) => resolveTest({ id, kind: 'unit-behaviour', platforms: BOTH }, r);
    expect(unit('tests/startup-update-check-gate.test.ts::automatic startup update check')).toBe('pass');
    expect(unit('tests/startup-update-check-gate.test.ts::automatic startup update check > schedules the check when on')).toBe('pass');
    expect(unit('tests/startup-update-check-gate.test.ts')).toBe('skipped');
    expect(unit('tests/startup-update-check-gate.test.ts::automatic startup')).toBe('absent');
    expect(unit('tests/nowhere.test.ts')).toBe('absent');
  });
});

// The Windows runner prints the test's own output on the "test x ... " line
// itself (cargo test -- --nocapture), with the verdict on a later bare line.
const WINDOWS_CARGO = [
  '     Running unittests src\\lib.rs (P:\\editor-target\\debug\\deps\\pdfluent_lib-60cb95e8c570b29b.exe)',
  'running 2 tests',
  'test pdf_engine::tests::an_xfa_commit_runs_no_script ... [img-href] no /Names in catalog',
  '[img-href] no /Names in catalog',
  'ok',
  'test pdf_engine::tests::killed_mid_test ... XFA script metadata: js_present=true',
  '     Running tests\\golden_pdfa.rs (P:\\editor-target\\debug\\deps\\golden_pdfa-60cb95e8c570b29b.exe)',
  'test golden_corpus_converts_to_pdfa_2b ... XFA script metadata: js_present=true',
  'golden PDF/A: 17 documents',
  'ok',
  'test local_corpus_converts_to_pdfa ... SKIPPED (not a pass): PDFLUENT_GOLDEN_LOCAL_DIR is unset',
  'ok',
].join('\n');

describe('cargo output interleaved on the verdict line', () => {
  it('takes the verdict from the later bare line when output follows the dots', () => {
    const r = parseCargoLog(WINDOWS_CARGO);
    expect(r['pdfluent_lib::pdf_engine::tests::an_xfa_commit_runs_no_script']).toBe('pass');
    expect(r['golden_pdfa::golden_corpus_converts_to_pdfa_2b']).toBe('pass');
    expect(r['golden_pdfa::local_corpus_converts_to_pdfa']).toBe('pass');
    expect(r['pdfluent_lib::pdf_engine::tests::killed_mid_test']).toBeUndefined();
  });

  it('names the cause of an absent test: binary never ran, test not listed, or no verdict', () => {
    const facts = scanCargoLog(WINDOWS_CARGO);
    expect(explainAbsentRust('save_is_atomic::x', facts)).toMatch(/binary "save_is_atomic" never ran.*golden_pdfa, pdfluent_lib/);
    expect(explainAbsentRust('golden_pdfa::gone', facts)).toMatch(/binary "golden_pdfa" ran but listed no test of that name/);
    expect(explainAbsentRust('pdfluent_lib::pdf_engine::tests::killed_mid_test', facts)).toMatch(/no verdict line followed/);
    expect(explainAbsentRust('pdfluent_lib::moved::an_xfa_commit_runs_no_script', facts)).toMatch(/must follow the move/);
  });

  it('prints the cause in the gate failure', () => {
    const v = gate({ features: [{ id: 'f', status: 'promised', journeys: [], tests: [{ id: 'golden_pdfa::gone', kind: 'rust', platforms: BOTH }] }] },
      { platform: 'windows-x64', results: { junit: [], cargo: parseCargoLog(WINDOWS_CARGO), journeys: {}, cargoFacts: scanCargoLog(WINDOWS_CARGO) }, journeyTests: null });
    expect(v.failures[0]).toMatch(/not in this run's results\. Cause: .*ran but listed no test/);
  });
});

describe('features --gate', () => {
  const promised = (tests: Test[], over: Partial<Feature> = {}): Feature => ({ id: 'merge-pdfs', status: 'promised', journeys: ['J-74'], tests, ...over });

  it('passes a promised feature whose test passed on this platform', () => {
    const v = judge([promised([{ id: MERGE, kind: 'rust', platforms: BOTH }])]);
    expect(v.failures).toEqual([]);
    expect(v.passes).toEqual([`PASS merge-pdfs: ${MERGE} (rust)`]);
  });

  it('fails a promised feature whose test was SKIPPED, naming feature and test', () => {
    const v = judge([promised([{ id: 'pdfluent_lib::pdf_engine::tests::needs_verapdf', kind: 'rust', platforms: BOTH }])]);
    expect(v.failures).toEqual([
      'FAIL merge-pdfs (promised) on macos-arm64: test pdfluent_lib::pdf_engine::tests::needs_verapdf (rust) — SKIPPED, which is not a pass.',
    ]);
  });

  it('fails a promised feature whose test is not in the results at all', () => {
    const v = judge([promised([{ id: 'save_is_atomic::gone', kind: 'rust', platforms: BOTH }])]);
    expect(v.failures.join('\n')).toMatch(/test save_is_atomic::gone \(rust\) — not in this run's results/);
  });

  it('fails a promised feature whose test failed', () => {
    const v = judge([promised([{ id: 'tests/i18n-locale-detection.test.ts', kind: 'unit-behaviour', platforms: BOTH }])]);
    expect(v.failures.join('\n')).toMatch(/tests\/i18n-locale-detection\.test\.ts \(unit-behaviour\) — FAILED/);
  });

  it('fails a promised feature with no test for a shipping platform', () => {
    const v = judge([promised([{ id: MERGE, kind: 'rust', platforms: ['macos-arm64'] }])], 'windows-x64');
    expect(v.failures.join('\n')).toMatch(/FAIL merge-pdfs \(promised\): no test names windows-x64/);
  });

  it('only requires the tests that name the platform being judged', () => {
    const v = judge([promised([{ id: MERGE, kind: 'rust', platforms: BOTH }, { id: 'windows_only::x', kind: 'rust', platforms: ['windows-x64'] }])]);
    expect(v.failures).toEqual([]);
  });

  it('refuses to judge linux-x64: no promise is made there', () => {
    const v = judge([promised([{ id: MERGE, kind: 'rust', platforms: BOTH }])], 'linux-x64');
    expect(v.failures.join('\n')).toMatch(/--platform "linux-x64" is not one of macos-arm64, windows-x64/);
  });

  it('judges preview like promised', () => {
    const v = judge([promised([{ id: 'save_is_atomic::gone', kind: 'rust', platforms: BOTH }], { status: 'preview' })]);
    expect(v.failures).toHaveLength(1);
  });

  it('does not gate pending-proof, and says out loud that it is not a pass', () => {
    const v = judge([{ id: 'ocr', status: 'pending-proof', owner_stream: 'C', journeys: ['J-60'], tests: [{ id: 'nothing::here', kind: 'rust', platforms: BOTH }] }]);
    expect(v.failures).toEqual([]);
    expect(v.pending).toEqual(['PENDING-PROOF (not a pass): ocr — promised in public, not proven; journeys J-60; stream C.']);
  });

  const MAP = {
    schema: 1,
    journeys: {
      'J-74': { title: 'Merge', priority: 'P1', spec: 'tests/journeys/J-74-merge.e2e.ts', platforms: BOTH, gaps: [] },
      'J-73': { title: 'Pages', priority: 'P1', spec: 'tests/journeys/J-73-pages.e2e.ts', platforms: BOTH, gaps: [{ id: 'insert-before', owner: 'stream-A', reason: 'x', platforms: ['windows-x64'] }] },
      'J-75': { title: 'Compress', priority: 'P1', spec: null, platforms: BOTH, gaps: [] },
    },
  };
  const withJourneys = (journeys: Record<string, { status: string }>, platform = 'macos-arm64') =>
    gate({ features: [promised([{ id: MERGE, kind: 'rust', platforms: BOTH }], { journeys: ['J-74', 'J-73', 'J-75'] })] }, {
      platform,
      results: { ...results(), journeys },
      journeyTests: MAP,
    });

  it('requires the real-app journey test once docs/JOURNEY_TESTS.json gives the journey a spec', () => {
    const v = withJourneys({});
    expect(v.failures).toEqual([
      'FAIL merge-pdfs (promised) on macos-arm64: journey J-74 (tests/journeys/J-74-merge.e2e.ts, e2e-real-app) — no result in the journey results for macos-arm64 (journey-results/macos-arm64/J-74.json, passed with --journey-results).',
      'FAIL merge-pdfs (promised) on macos-arm64: journey J-73 (tests/journeys/J-73-pages.e2e.ts, e2e-real-app) — no result in the journey results for macos-arm64 (journey-results/macos-arm64/J-73.json, passed with --journey-results).',
    ]);
  });

  it('passes on journey results that passed, and leaves a journey without a spec to the feature\'s own tests', () => {
    const v = withJourneys({ 'J-74': { status: 'pass' }, 'J-73': { status: 'pass' } });
    expect(v.failures).toEqual([]);
    expect(v.passes).toContain('PASS merge-pdfs: journey J-74 (tests/journeys/J-74-merge.e2e.ts, e2e-real-app)');
  });

  it('fails a skipped or failed journey result', () => {
    const v = withJourneys({ 'J-74': { status: 'skipped' }, 'J-73': { status: 'fail' } });
    expect(v.failures.join('\n')).toMatch(/J-74 .* SKIPPED, which is not a pass/);
    expect(v.failures.join('\n')).toMatch(/J-73 .* FAIL, which is not a pass/);
  });

  it('fails a journey with a known gap on this platform, naming gap and owner, even when its run passed', () => {
    const v = withJourneys({ 'J-74': { status: 'pass' }, 'J-73': { status: 'pass' } }, 'windows-x64');
    expect(v.failures).toEqual([
      'FAIL merge-pdfs (promised) on windows-x64: journey J-73 (tests/journeys/J-73-pages.e2e.ts, e2e-real-app) has a known gap, which is not a pass: insert-before (owner stream-A).',
    ]);
  });

  // The unit/cargo job and the journeys job of a platform do not wait for each
  // other, so each judges its half: `skip` leaves the journeys to the journeys
  // job, `only` judges nothing but them.
  const halves = (journeys: 'skip' | 'only', journeyResults: Record<string, { status: string }>) =>
    gate({ features: [promised([{ id: MERGE, kind: 'rust', platforms: BOTH }], { journeys: ['J-74'] }),
                      promised([{ id: 'nothing::here', kind: 'rust', platforms: BOTH }], { id: 'other', journeys: ['J-73'] })] }, {
      platform: 'macos-arm64',
      results: { ...results(), journeys: journeyResults },
      journeyTests: MAP,
      journeys,
    });

  it('skip: judges the unit and cargo tests and does not ask for journey results', () => {
    const v = halves('skip', {});
    expect(v.failures).toEqual(['FAIL other (promised) on macos-arm64: test nothing::here (rust) — not in this run\'s results.']);
    expect(v.passes).toContain(`PASS merge-pdfs: ${MERGE} (rust)`);
  });

  it('skip: a promise whose only proof is a journey is not reported as unproven', () => {
    const v = gate({ features: [promised([], { journeys: ['J-74'] })] }, { platform: 'macos-arm64', results: results(), journeyTests: MAP, journeys: 'skip' });
    expect(v.failures).toEqual([]);
  });

  it('only: judges the journey results and nothing else', () => {
    const v = halves('only', { 'J-74': { status: 'pass' } });
    expect(v.failures).toEqual([
      'FAIL other (promised) on macos-arm64: journey J-73 (tests/journeys/J-73-pages.e2e.ts, e2e-real-app) — no result in the journey results for macos-arm64 (journey-results/macos-arm64/J-73.json, passed with --journey-results).',
    ]);
    expect(v.passes).toEqual(['PASS merge-pdfs: journey J-74 (tests/journeys/J-74-merge.e2e.ts, e2e-real-app)']);
  });

  it('says so when docs/JOURNEY_TESTS.json is absent', () => {
    expect(judge([]).notes.join('\n')).toMatch(/docs\/JOURNEY_TESTS\.json is absent/);
  });
});

describe('features --publish', () => {
  const source = {
    schema: 2,
    groups: [{ id: 'pages', title: 'Put the document together' }],
    pending_proof_ceiling: ['ocr'],
    features: [
      { id: 'merge-pdfs', group: 'pages', status: 'promised', journeys: ['J-74'], register: ['panels:merge'], tests: [{ id: MERGE, kind: 'rust', platforms: BOTH }], limits: [], copy: { name: 'Merge PDFs', site: 'Combine PDFs.', store_bullet: null, claims: [] }, since: '1.0.0' },
      { id: 'ocr', group: 'pages', status: 'pending-proof', owner_stream: 'C', journeys: ['J-60'], register: [], tests: [], limits: ['A component is downloaded.'], copy: { name: 'OCR', site: 'Run OCR.', store_bullet: 'OCR', claims: [] }, since: '1.0.0' },
      { id: 'old', group: 'pages', status: 'retired', journeys: [], register: [], tests: [], limits: [], copy: { name: 'Old', site: 'Old.', store_bullet: null, claims: [] }, since: '1.0.0' },
    ],
  };
  const text = JSON.stringify(source);

  it('writes the same bytes for the same input', () => {
    expect(JSON.stringify(publish(source, { sourceText: text, commit: 'abc' }))).toBe(JSON.stringify(publish(source, { sourceText: text, commit: 'abc' })));
  });

  it('publishes copy, status and limits, and leaves out retired features, tests and register refs', () => {
    const out = publish(source, { sourceText: text, commit: 'abc' });
    expect(out.features.map((f: { id: string }) => f.id)).toEqual(['merge-pdfs', 'ocr']);
    expect(out.features[1]).toEqual({ id: 'ocr', group: 'pages', status: 'pending-proof', journeys: ['J-60'], limits: ['A component is downloaded.'], copy: { name: 'OCR', site: 'Run OCR.', store_bullet: 'OCR', claims: [] }, since: '1.0.0', owner_stream: 'C' });
    expect(JSON.stringify(out)).not.toMatch(/panels:merge|op_merge_pdfs/);
  });

  it('carries an integrity hash that a hand edit breaks', () => {
    const out = publish(source, { sourceText: text, commit: 'abc' });
    expect(integrityOf(out)).toBe(out.integrity);
    out.features[0].copy.site = 'Combine PDFs, and more.';
    expect(integrityOf(out)).not.toBe(out.integrity);
  });
});

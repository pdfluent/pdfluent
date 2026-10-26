// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// "Fixed" without e-mail: issue labels → fixed_feedback in latest.json.

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { fixedFeedbackIds, forgottenDuplicates, idsInBody } from '../../scripts/release/fixed-feedback.mjs';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const GEN = path.join(REPO_ROOT, 'scripts', 'ci-generate-latest-json.mjs');

const issues = [
  { number: 1, body: 'fb:FB-ABCDEFGH\n\n**Area:** forms', labels: [{ name: 'feedback' }, { name: 'fixed-in:1.0.1' }], stateReason: 'completed' },
  { number: 2, body: 'fb:FB-0123456Z', labels: [{ name: 'fixed-in:1.0.1' }], stateReason: 'completed' },
  { number: 3, body: 'fb:FB-ZZZZZZZZ', labels: [{ name: 'fixed-in:1.1.0' }], stateReason: 'completed' },
  { number: 4, body: 'fb:FB-D0PD0PDP', labels: [{ name: 'feedback' }], stateReason: 'duplicate' },
  { number: 5, body: 'no marker here', labels: [{ name: 'fixed-in:1.0.1' }], stateReason: 'completed' },
  { number: 6, body: 'mentions fb:FB-ABCDEFGH again', labels: ['fixed-in:1.0.1'], stateReason: 'completed' },
];

describe('fixed-feedback.mjs', () => {
  it('reads the marker the Worker writes, and nothing that only looks like it', () => {
    expect(idsInBody('fb:FB-ABCDEFGH\nx')).toEqual(['FB-ABCDEFGH']);
    expect(idsInBody('fb:FB-ABCDEFGHI')).toEqual([]);
    expect(idsInBody('xfb:FB-ABCDEFGH')).toEqual([]);
    expect(idsInBody('fb:FB-ABCDEFGL')).toEqual([]); // L is not Crockford
  });

  it('collects the IDs of issues labelled fixed-in:<version>, once each, sorted', () => {
    expect(fixedFeedbackIds(issues, '1.0.1')).toEqual(['FB-0123456Z', 'FB-ABCDEFGH']);
    expect(fixedFeedbackIds(issues, '1.1.0')).toEqual(['FB-ZZZZZZZZ']);
  });

  it('names duplicates whose reporters would not be told', () => {
    expect(forgottenDuplicates(issues)).toEqual([4]);
  });

  it('refuses something that is not a version', () => {
    expect(() => fixedFeedbackIds(issues, 'latest')).toThrow(/not a release version/);
  });
});

function generate(fixed: unknown | undefined) {
  const dir = mkdtempSync(path.join(tmpdir(), 'pdfl-fixed-'));
  mkdirSync(path.join(dir, 'artifacts', 'linux'), { recursive: true });
  writeFileSync(path.join(dir, 'artifacts', 'linux', 'PDFluent_1.0.1_amd64.AppImage.tar.gz.sig'), 'c2lnCg==\n');
  const env: Record<string, string | undefined> = {
    ...process.env,
    CI_COMMIT_TAG: 'v1.0.1',
    CF_R2_PUBLIC_URL: 'https://pdfluent.com/releases',
    CF_R2_BUCKET_NAME: 'pdfluent-releases',
    // Linux only, so no quality report is consulted; this test is about the feed's fields.
    FIXED_FEEDBACK_FILE: undefined,
  };
  if (fixed !== undefined) {
    writeFileSync(path.join(dir, 'fixed.json'), JSON.stringify(fixed));
    env.FIXED_FEEDBACK_FILE = path.join(dir, 'fixed.json');
  }
  const r = spawnSync('node', [GEN], { cwd: dir, env, encoding: 'utf8' });
  return { status: r.status, stderr: r.stderr, dir };
}

describe('latest.json carries fixed_feedback', () => {
  it('writes the list it is given', () => {
    const { status, dir } = generate(['FB-ABCDEFGH', 'FB-0123456Z', 'FB-ABCDEFGH']);
    expect(status).toBe(0);
    const out = JSON.parse(readFileSync(path.join(dir, 'latest.json'), 'utf8'));
    expect(out.fixed_feedback).toEqual(['FB-0123456Z', 'FB-ABCDEFGH']);
  });

  it('writes an empty list when there is none, so the field is always there', () => {
    const { status, dir } = generate(undefined);
    expect(status).toBe(0);
    expect(JSON.parse(readFileSync(path.join(dir, 'latest.json'), 'utf8')).fixed_feedback).toEqual([]);
  });

  it('refuses a list with something that is not a report ID', () => {
    const { status, stderr } = generate(['FB-ABCDEFGH', 'anna@example.com']);
    expect(status).toBe(1);
    expect(stderr).toContain('not report IDs');
  });

  it('is what the script prints for the generator to read', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pdfl-fixed-cli-'));
    writeFileSync(path.join(dir, 'issues.json'), JSON.stringify(issues));
    const out = execFileSync('node', [path.join(REPO_ROOT, 'scripts/release/fixed-feedback.mjs'), '--version', '1.0.1', '--issues', path.join(dir, 'issues.json')], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    expect(JSON.parse(out)).toEqual(['FB-0123456Z', 'FB-ABCDEFGH']);
  });
});

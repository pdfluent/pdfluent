// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// The feedback endpoint is an opt-in exception to "the app makes no request",
// declared by path. These cases fail when the declaration goes, when a new
// path appears on the report host without one, or when the feedback page the
// Help menu used to open (mail on, nothing kept) comes back.

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ALLOWED, scanTree, undeclaredPaths, violations } from '../scripts/ci/offline-allowlist.mjs';
import { FEEDBACK_ENDPOINT } from '../src/lib/feedback/feedback';
import { REPORT_ENDPOINT } from '../src/lib/telemetry/report';

const root = resolve(__dirname, '..');

interface Entry { origin: string; kind: string; paths?: { path: string; optIn: string }[] }
const entries = ALLOWED as Entry[];

describe('the report host is declared per path, each with what makes it opt-in', () => {
  const host = entries.find((e) => e.origin === 'https://report.pdfluent.com');

  it('declares the feedback path the app posts to', () => {
    const path = new URL(FEEDBACK_ENDPOINT).pathname;
    const decl = host?.paths?.find((p) => p.path === path);
    expect(decl).toBeDefined();
    expect(decl?.optIn).toMatch(/Send/);
  });

  it('declares the crash path too', () => {
    expect(host?.paths?.map((p) => p.path)).toContain(new URL(REPORT_ENDPOINT).pathname);
  });

  it('accepts the declared paths and anything below them', () => {
    expect(undeclaredPaths(`fetch("${FEEDBACK_ENDPOINT}")`)).toEqual([]);
    expect(undeclaredPaths(`"${FEEDBACK_ENDPOINT}/FB-ABCDEFGH/attachment"`)).toEqual([]);
    expect(undeclaredPaths('"https://report.pdfluent.com"')).toEqual([]);
  });

  it('fails a path on the report host that nobody declared', () => {
    expect(undeclaredPaths('"https://report.pdfluent.com/v1/telemetry"')).toEqual(['https://report.pdfluent.com/v1/telemetry']);
    expect(undeclaredPaths('"https://report.pdfluent.com/v1/feedbackx"')).toEqual(['https://report.pdfluent.com/v1/feedbackx']);
  });

  it('makes the tree scan fail on such a path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pdfl-paths-'));
    writeFileSync(join(dir, 'bundle.js'), 'fetch("https://report.pdfluent.com/v1/beacon")');
    const found = scanTree(dir);
    expect(violations([...found.keys()])).toEqual(['https://report.pdfluent.com/v1/beacon']);
  });
});

describe('the mail-only feedback page is gone from the app', () => {
  it('is no longer an endpoint the app may open', () => {
    expect(entries.map((e) => e.origin)).not.toContain('https://feedback.pdfluent.com');
  });

  it('the Help menu opens the in-app form, not a URL', () => {
    const lib = readFileSync(resolve(root, 'src-tauri/src/lib.rs'), 'utf8');
    expect(lib).toContain('"help_improve"');
    expect(lib).not.toMatch(/help_send_feedback|help_report_problem|FEEDBACK_URL/);
  });
});

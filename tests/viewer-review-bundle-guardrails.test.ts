// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const exportSource = readFileSync(
  new URL('../src/viewer/export/reviewBundleExport.ts', import.meta.url),
  'utf8'
);
const importSource = readFileSync(
  new URL('../src/viewer/import/reviewBundleImport.ts', import.meta.url),
  'utf8'
);
const mergeSource = readFileSync(
  new URL('../src/viewer/collaboration/reviewMerge.ts', import.meta.url),
  'utf8'
);
const compareSource = readFileSync(
  new URL('../src/viewer/collaboration/reviewBundleCompare.ts', import.meta.url),
  'utf8'
);
const formatSource = readFileSync(
  new URL('../src/viewer/collaboration/reviewBundleFormat.ts', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// Export guardrails
// ---------------------------------------------------------------------------

describe('isBundleExportable guardrail', () => {
  it('requires annotations or eventLog to be non-empty', () => {
    const fnStart = exportSource.indexOf('export function isBundleExportable');
    const fnEnd = exportSource.indexOf('\n}', fnStart) + 2;
    const body = exportSource.slice(fnStart, fnEnd);
    expect(body).toContain('annotations.length > 0');
    expect(body).toContain('eventLog.length > 0');
  });

  it('returns false for empty bundle (implied by || operator)', () => {
    const fnStart = exportSource.indexOf('export function isBundleExportable');
    const fnEnd = exportSource.indexOf('\n}', fnStart) + 2;
    const body = exportSource.slice(fnStart, fnEnd);
    expect(body).toContain('||');
  });
});

describe('buildBundleFilename guardrail', () => {
  it('appends REVIEW_BUNDLE_EXTENSION to filename', () => {
    const fnStart = exportSource.indexOf('export function buildBundleFilename');
    const fnEnd = exportSource.indexOf('\n}', fnStart) + 2;
    const body = exportSource.slice(fnStart, fnEnd);
    expect(body).toContain('REVIEW_BUNDLE_EXTENSION');
  });

  it('sanitises title before building filename', () => {
    const fnStart = exportSource.indexOf('export function buildBundleFilename');
    const fnEnd = exportSource.indexOf('\n}', fnStart) + 2;
    const body = exportSource.slice(fnStart, fnEnd);
    expect(body).toContain('sanitiseTitle(title)');
  });
});

describe('buildReviewBundlePayload guardrail', () => {
  it('uses readonly parameter types', () => {
    const fnStart = exportSource.indexOf('export function buildReviewBundlePayload');
    const sig = exportSource.slice(fnStart, fnStart + 300);
    expect(sig).toContain('readonly');
  });

  it('spreads annotations to avoid mutation', () => {
    const fnStart = exportSource.indexOf('export function buildReviewBundlePayload');
    const fnEnd = exportSource.indexOf('\n}', fnStart) + 2;
    const body = exportSource.slice(fnStart, fnEnd);
    expect(body).toContain('[...annotations]');
  });

  it('spreads eventLog to avoid mutation', () => {
    const fnStart = exportSource.indexOf('export function buildReviewBundlePayload');
    const fnEnd = exportSource.indexOf('\n}', fnStart) + 2;
    const body = exportSource.slice(fnStart, fnEnd);
    expect(body).toContain('[...eventLog]');
  });
});

// ---------------------------------------------------------------------------
// Import guardrails
// ---------------------------------------------------------------------------

describe('isImportResultValid guardrail', () => {
  it('rejects result when success is false', () => {
    const fnStart = importSource.indexOf('export function isImportResultValid');
    const fnEnd = importSource.indexOf('\n}', fnStart) + 2;
    const body = importSource.slice(fnStart, fnEnd);
    expect(body).toContain('!result.success');
  });

  it('verifies all three arrays with Array.isArray', () => {
    const fnStart = importSource.indexOf('export function isImportResultValid');
    const fnEnd = importSource.indexOf('\n}', fnStart) + 2;
    const body = importSource.slice(fnStart, fnEnd);
    expect(body).toContain('Array.isArray(result.reviewState.annotations)');
    expect(body).toContain('Array.isArray(result.reviewState.reviewStatuses)');
    expect(body).toContain('Array.isArray(result.reviewState.commentReplies)');
  });
});

describe('validateBundleVersion guardrail', () => {
  it('compares against REVIEW_BUNDLE_VERSION constant', () => {
    const fnStart = importSource.indexOf('export function validateBundleVersion');
    const fnEnd = importSource.indexOf('\nexport function ', fnStart + 1);
    const body = importSource.slice(fnStart, fnEnd);
    expect(body).toContain('REVIEW_BUNDLE_VERSION');
  });

  it('uses strict equality check', () => {
    const fnStart = importSource.indexOf('export function validateBundleVersion');
    const fnEnd = importSource.indexOf('\nexport function ', fnStart + 1);
    const body = importSource.slice(fnStart, fnEnd);
    expect(body).toContain('===');
  });
});

describe('patchIncompleteBundle guardrail', () => {
  it('fills missing reviewState with makeEmptyReviewState', () => {
    const fnStart = importSource.indexOf('export function patchIncompleteBundle');
    const body = importSource.slice(fnStart, fnStart + 400);
    expect(body).toContain('makeEmptyReviewState()');
  });

  it('fills missing array fields with empty arrays', () => {
    const fnStart = importSource.indexOf('export function patchIncompleteBundle');
    const body = importSource.slice(fnStart, fnStart + 500);
    expect(body).toContain('?? []');
  });
});

// ---------------------------------------------------------------------------
// Merge guardrails
// ---------------------------------------------------------------------------

describe('isMergeCompatible guardrail', () => {
  it('normalises both titles before comparison', () => {
    const fnStart = mergeSource.indexOf('export function isMergeCompatible');
    const fnEnd = mergeSource.indexOf('\nexport function ', fnStart + 1);
    const body = mergeSource.slice(fnStart, fnEnd);
    expect(body).toContain('toLowerCase()');
  });

  it('trims whitespace before comparison', () => {
    const fnStart = mergeSource.indexOf('export function isMergeCompatible');
    const fnEnd = mergeSource.indexOf('\nexport function ', fnStart + 1);
    const body = mergeSource.slice(fnStart, fnEnd);
    expect(body).toContain('trim()');
  });
});

describe('mergeReviewStates reply dedup guardrail', () => {
  it('guards against duplicate replies with existingIds Set', () => {
    const fnStart = mergeSource.indexOf('export function mergeReviewStates');
    const fnEnd = mergeSource.indexOf('\nexport function ', fnStart + 1);
    const body = mergeSource.slice(fnStart, fnEnd);
    expect(body).toContain('existingIds');
    expect(body).toContain('!existingIds.has(r.id)');
  });
});

// ---------------------------------------------------------------------------
// Compare guardrails
// ---------------------------------------------------------------------------

describe('compareReviewBundles diff accuracy guardrail', () => {
  it('uses Sets for O(1) id lookup', () => {
    const fnStart = compareSource.indexOf('export function compareReviewBundles');
    const fnEnd = compareSource.indexOf('\nexport function ', fnStart + 1);
    const body = compareSource.slice(fnStart, fnEnd);
    expect(body).toContain('new Set(');
  });

  it('does not emit addedReplyCounts entry when diff is zero or negative', () => {
    const fnStart = compareSource.indexOf('export function compareReviewBundles');
    const fnEnd = compareSource.indexOf('\nexport function ', fnStart + 1);
    const body = compareSource.slice(fnStart, fnEnd);
    expect(body).toContain('diff > 0');
  });
});

// ---------------------------------------------------------------------------
// Format version guardrail
// ---------------------------------------------------------------------------

describe('bundle format version guardrail', () => {
  it('makeBundleMetadata embeds REVIEW_BUNDLE_VERSION', () => {
    const fnStart = formatSource.indexOf('export function makeBundleMetadata');
    const fnEnd = formatSource.indexOf('\n}', fnStart) + 2;
    const body = formatSource.slice(fnStart, fnEnd);
    expect(body).toContain('REVIEW_BUNDLE_VERSION');
  });

  it('makeBundleMetadata falls back to Anonymous when exportedBy is blank', () => {
    const fnStart = formatSource.indexOf('export function makeBundleMetadata');
    const fnEnd = formatSource.indexOf('\n}', fnStart) + 2;
    const body = formatSource.slice(fnStart, fnEnd);
    expect(body).toContain("'Anonymous'");
  });
});

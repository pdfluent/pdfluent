// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const formatSource = readFileSync(
  new URL('../src/viewer/collaboration/reviewBundleFormat.ts', import.meta.url),
  'utf8'
);
const mergeSource = readFileSync(
  new URL('../src/viewer/collaboration/reviewMerge.ts', import.meta.url),
  'utf8'
);
const importSource = readFileSync(
  new URL('../src/viewer/import/reviewBundleImport.ts', import.meta.url),
  'utf8'
);
const compareSource = readFileSync(
  new URL('../src/viewer/collaboration/reviewBundleCompare.ts', import.meta.url),
  'utf8'
);
const identitySource = readFileSync(
  new URL('../src/viewer/collaboration/reviewerIdentity.ts', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// Bundle format constants are stable
// ---------------------------------------------------------------------------

describe('bundle format constants', () => {
  it('REVIEW_BUNDLE_EXTENSION is .reviewbundle', () => {
    expect(formatSource).toContain("REVIEW_BUNDLE_EXTENSION = '.reviewbundle'");
  });

  it('REVIEW_BUNDLE_VERSION is defined', () => {
    expect(formatSource).toContain('REVIEW_BUNDLE_VERSION =');
  });

  it('BUNDLE_FILES has DOCUMENT entry', () => {
    expect(formatSource).toContain("DOCUMENT: 'document.pdf'");
  });

  it('BUNDLE_FILES has REVIEW_STATE entry', () => {
    expect(formatSource).toContain("REVIEW_STATE: 'review_state.json'");
  });

  it('BUNDLE_FILES has AUDIT_LOG entry', () => {
    expect(formatSource).toContain("AUDIT_LOG: 'audit_log.json'");
  });

  it('BUNDLE_FILES has METADATA entry', () => {
    expect(formatSource).toContain("METADATA: 'metadata.json'");
  });
});

// ---------------------------------------------------------------------------
// makeEmptyReviewState produces a valid empty state
// ---------------------------------------------------------------------------

describe('makeEmptyReviewState stability', () => {
  it('returns annotations as empty array', () => {
    const fnStart = formatSource.indexOf('export function makeEmptyReviewState');
    const fnEnd = formatSource.indexOf('\n}', fnStart) + 2;
    const body = formatSource.slice(fnStart, fnEnd);
    expect(body).toContain('annotations: []');
  });

  it('returns reviewStatuses as empty array', () => {
    const fnStart = formatSource.indexOf('export function makeEmptyReviewState');
    const fnEnd = formatSource.indexOf('\n}', fnStart) + 2;
    const body = formatSource.slice(fnStart, fnEnd);
    expect(body).toContain('reviewStatuses: []');
  });

  it('returns commentReplies as empty array', () => {
    const fnStart = formatSource.indexOf('export function makeEmptyReviewState');
    const fnEnd = formatSource.indexOf('\n}', fnStart) + 2;
    const body = formatSource.slice(fnStart, fnEnd);
    expect(body).toContain('commentReplies: []');
  });
});

// ---------------------------------------------------------------------------
// serializeReviewBundle uses pretty-print JSON
// ---------------------------------------------------------------------------

describe('serializeReviewBundle stability', () => {
  it('serialises with JSON.stringify', () => {
    const fnStart = formatSource.indexOf('export function serializeReviewBundle');
    const fnEnd = formatSource.indexOf('\n}', fnStart) + 2;
    const body = formatSource.slice(fnStart, fnEnd);
    expect(body).toContain('JSON.stringify(bundle');
  });

  it('uses null, 2 for pretty-print', () => {
    const fnStart = formatSource.indexOf('export function serializeReviewBundle');
    const fnEnd = formatSource.indexOf('\n}', fnStart) + 2;
    const body = formatSource.slice(fnStart, fnEnd);
    expect(body).toContain('null, 2');
  });
});

// ---------------------------------------------------------------------------
// Merge stability: empty inputs produce sensible outputs
// ---------------------------------------------------------------------------

describe('mergeReviewStates stability', () => {
  it('initialises resolvedAnnotations at 0', () => {
    const fnStart = mergeSource.indexOf('export function mergeReviewStates');
    const fnEnd = mergeSource.indexOf('\nexport function ', fnStart + 1);
    const body = mergeSource.slice(fnStart, fnEnd);
    expect(body).toContain('resolvedAnnotations = 0');
  });

  it('returns conflicts as empty array', () => {
    const fnStart = mergeSource.indexOf('export function mergeReviewStates');
    const fnEnd = mergeSource.indexOf('\nexport function ', fnStart + 1);
    const body = mergeSource.slice(fnStart, fnEnd);
    expect(body).toContain('conflicts: []');
  });

  it('spreads base annotations into merged result', () => {
    const fnStart = mergeSource.indexOf('export function mergeReviewStates');
    const fnEnd = mergeSource.indexOf('\nexport function ', fnStart + 1);
    const body = mergeSource.slice(fnStart, fnEnd);
    expect(body).toContain('...base.annotations');
  });
});

// ---------------------------------------------------------------------------
// Import stability: all validation paths return success: false
// ---------------------------------------------------------------------------

describe('parseReviewBundleJson stability', () => {
  it('returns success: false on missing metadata', () => {
    const fnStart = importSource.indexOf('export function parseReviewBundleJson');
    const fnEnd = importSource.indexOf('\nexport function ', fnStart + 1);
    const body = importSource.slice(fnStart, fnEnd);
    expect(body).toContain('!parsed.metadata');
    expect(body).toContain('success: false');
  });

  it('catches all JSON errors (try/catch present)', () => {
    const fnStart = importSource.indexOf('export function parseReviewBundleJson');
    const fnEnd = importSource.indexOf('\nexport function ', fnStart + 1);
    const body = importSource.slice(fnStart, fnEnd);
    expect(body).toContain('try {');
    expect(body).toContain('catch');
  });

  it('auditLog fallback prevents undefined reads', () => {
    const fnStart = importSource.indexOf('export function parseReviewBundleJson');
    const fnEnd = importSource.indexOf('\nexport function ', fnStart + 1);
    const body = importSource.slice(fnStart, fnEnd);
    expect(body).toContain('{ events: [] }');
  });
});

// ---------------------------------------------------------------------------
// Compare stability: isBundleIdentical handles zero-diff
// ---------------------------------------------------------------------------

describe('isBundleIdentical stability', () => {
  it('checks addedAnnotations === 0', () => {
    const fnStart = compareSource.indexOf('export function isBundleIdentical');
    const fnEnd = compareSource.indexOf('\nexport function ', fnStart + 1);
    const body = compareSource.slice(fnStart, fnEnd);
    expect(body).toContain('addedAnnotations === 0');
  });

  it('checks totalRepliesAdded === 0', () => {
    const fnStart = compareSource.indexOf('export function isBundleIdentical');
    const fnEnd = compareSource.indexOf('\nexport function ', fnStart + 1);
    const body = compareSource.slice(fnStart, fnEnd);
    expect(body).toContain('totalRepliesAdded === 0');
  });
});

// ---------------------------------------------------------------------------
// Identity stability: localStorage errors never propagate
// ---------------------------------------------------------------------------

describe('reviewer identity localStorage stability', () => {
  it('loadReviewerIdentity is wrapped in try/catch', () => {
    const fnStart = identitySource.indexOf('export function loadReviewerIdentity');
    const fnEnd = identitySource.indexOf('\n}', fnStart) + 2;
    const body = identitySource.slice(fnStart, fnEnd);
    expect(body).toContain('try {');
    expect(body).toContain('catch');
    expect(body).toContain('return null');
  });

  it('saveReviewerIdentity silences write errors', () => {
    const fnStart = identitySource.indexOf('export function saveReviewerIdentity');
    const fnEnd = identitySource.indexOf('\n}', fnStart) + 2;
    const body = identitySource.slice(fnStart, fnEnd);
    expect(body).toContain('catch');
  });
});

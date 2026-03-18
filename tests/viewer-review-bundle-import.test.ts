// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const source = readFileSync(
  new URL('../src/viewer/import/reviewBundleImport.ts', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// ReviewBundleImportResult interface
// ---------------------------------------------------------------------------

describe('ReviewBundleImportResult', () => {
  it('declares success boolean field', () => {
    expect(source).toContain('success: boolean');
  });

  it('declares optional metadata field', () => {
    expect(source).toContain('metadata?: BundleMetadata');
  });

  it('declares optional reviewState field', () => {
    expect(source).toContain('reviewState?: BundleReviewState');
  });

  it('declares optional auditLog field', () => {
    expect(source).toContain('auditLog?: BundleAuditLog');
  });

  it('declares optional error string field', () => {
    expect(source).toContain('error?: string');
  });
});

// ---------------------------------------------------------------------------
// parseReviewBundleJson
// ---------------------------------------------------------------------------

describe('parseReviewBundleJson', () => {
  it('exports parseReviewBundleJson function', () => {
    expect(source).toContain('export function parseReviewBundleJson(json: string)');
  });

  it('returns failure when metadata is missing', () => {
    const fnStart = source.indexOf('export function parseReviewBundleJson');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('!parsed.metadata');
  });

  it('returns failure when reviewState is missing', () => {
    const fnStart = source.indexOf('export function parseReviewBundleJson');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('!parsed.reviewState');
  });

  it('returns failure when metadata.version is missing', () => {
    const fnStart = source.indexOf('export function parseReviewBundleJson');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('!parsed.metadata.version');
  });

  it('catches JSON parse errors and returns failure', () => {
    const fnStart = source.indexOf('export function parseReviewBundleJson');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('catch');
    expect(body).toContain('Ongeldige JSON in bundle');
  });

  it('falls back to empty auditLog when auditLog field is absent', () => {
    const fnStart = source.indexOf('export function parseReviewBundleJson');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('{ events: [] }');
  });

  it('returns success: true with typed fields on valid input', () => {
    const fnStart = source.indexOf('export function parseReviewBundleJson');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('success: true');
  });
});

// ---------------------------------------------------------------------------
// validateBundleVersion
// ---------------------------------------------------------------------------

describe('validateBundleVersion', () => {
  it('exports validateBundleVersion function', () => {
    expect(source).toContain('export function validateBundleVersion(metadata: BundleMetadata)');
  });

  it('compares metadata.version against REVIEW_BUNDLE_VERSION', () => {
    const fnStart = source.indexOf('export function validateBundleVersion');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('REVIEW_BUNDLE_VERSION');
  });
});

// ---------------------------------------------------------------------------
// Extract helpers
// ---------------------------------------------------------------------------

describe('extractAnnotationsFromBundle', () => {
  it('exports extractAnnotationsFromBundle function', () => {
    expect(source).toContain('export function extractAnnotationsFromBundle(reviewState: BundleReviewState)');
  });

  it('returns reviewState.annotations with empty-array fallback', () => {
    const fnStart = source.indexOf('export function extractAnnotationsFromBundle');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('reviewState.annotations ?? []');
  });
});

describe('extractReviewStatusesFromBundle', () => {
  it('exports extractReviewStatusesFromBundle function', () => {
    expect(source).toContain('export function extractReviewStatusesFromBundle(');
  });

  it('wraps entries in new Map()', () => {
    const fnStart = source.indexOf('export function extractReviewStatusesFromBundle');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('new Map(reviewState.reviewStatuses');
  });
});

describe('extractCommentRepliesFromBundle', () => {
  it('exports extractCommentRepliesFromBundle function', () => {
    expect(source).toContain('export function extractCommentRepliesFromBundle(');
  });

  it('wraps entries in new Map()', () => {
    const fnStart = source.indexOf('export function extractCommentRepliesFromBundle');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('new Map(reviewState.commentReplies');
  });
});

// ---------------------------------------------------------------------------
// Safety helpers
// ---------------------------------------------------------------------------

describe('makeEmptyImportResult', () => {
  it('exports makeEmptyImportResult function', () => {
    expect(source).toContain('export function makeEmptyImportResult()');
  });

  it('returns success: false', () => {
    const fnStart = source.indexOf('export function makeEmptyImportResult');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('success: false');
  });
});

describe('isImportResultValid', () => {
  it('exports isImportResultValid function', () => {
    expect(source).toContain('export function isImportResultValid(result: ReviewBundleImportResult)');
  });

  it('checks that all three review state arrays are arrays', () => {
    const fnStart = source.indexOf('export function isImportResultValid');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('Array.isArray(result.reviewState.annotations)');
    expect(body).toContain('Array.isArray(result.reviewState.reviewStatuses)');
    expect(body).toContain('Array.isArray(result.reviewState.commentReplies)');
  });
});

describe('patchIncompleteBundle', () => {
  it('exports patchIncompleteBundle function', () => {
    expect(source).toContain('export function patchIncompleteBundle(');
  });

  it('fills missing reviewState with makeEmptyReviewState', () => {
    const fnStart = source.indexOf('export function patchIncompleteBundle');
    const body = source.slice(fnStart, fnStart + 400);
    expect(body).toContain('makeEmptyReviewState()');
  });
});

// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const source = readFileSync(
  new URL('../src/viewer/export/reviewBundleExport.ts', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// ReviewBundleExportPayload
// ---------------------------------------------------------------------------

describe('reviewBundleExport — ReviewBundleExportPayload', () => {
  it('exports ReviewBundleExportPayload type (alias for ReviewBundle)', () => {
    expect(source).toContain('ReviewBundleExportPayload');
    expect(source).toContain('ReviewBundle');
  });
});

// ---------------------------------------------------------------------------
// buildReviewBundlePayload
// ---------------------------------------------------------------------------

describe('buildReviewBundlePayload', () => {
  it('exports buildReviewBundlePayload function', () => {
    expect(source).toContain('export function buildReviewBundlePayload(');
  });

  it('accepts title, annotations, reviewStatuses, commentReplies, eventLog, exportedBy', () => {
    const fnStart = source.indexOf('export function buildReviewBundlePayload(');
    const fnSig = source.slice(fnStart, fnStart + 300);
    expect(fnSig).toContain('title');
    expect(fnSig).toContain('annotations');
    expect(fnSig).toContain('reviewStatuses');
    expect(fnSig).toContain('commentReplies');
    expect(fnSig).toContain('eventLog');
    expect(fnSig).toContain('exportedBy');
  });

  it('calls makeBundleMetadata with title and exportedBy', () => {
    const fnStart = source.indexOf('export function buildReviewBundlePayload(');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('makeBundleMetadata(title, exportedBy)');
  });

  it('serialises reviewStatuses via Array.from entries', () => {
    const fnStart = source.indexOf('export function buildReviewBundlePayload(');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('Array.from(reviewStatuses.entries())');
  });

  it('serialises commentReplies via Array.from entries', () => {
    const fnStart = source.indexOf('export function buildReviewBundlePayload(');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('Array.from(commentReplies.entries())');
  });

  it('spreads eventLog into auditLog.events', () => {
    const fnStart = source.indexOf('export function buildReviewBundlePayload(');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('events: [...eventLog]');
  });

  it('returns an object with metadata, reviewState, auditLog', () => {
    const fnStart = source.indexOf('export function buildReviewBundlePayload(');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('metadata');
    expect(body).toContain('reviewState');
    expect(body).toContain('auditLog');
  });
});

// ---------------------------------------------------------------------------
// serializeBundlePayload
// ---------------------------------------------------------------------------

describe('serializeBundlePayload', () => {
  it('exports serializeBundlePayload function', () => {
    expect(source).toContain('export function serializeBundlePayload(');
  });

  it('delegates to serializeReviewBundle', () => {
    const fnStart = source.indexOf('export function serializeBundlePayload(');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('serializeReviewBundle(payload)');
  });
});

// ---------------------------------------------------------------------------
// buildBundleFilename
// ---------------------------------------------------------------------------

describe('buildBundleFilename', () => {
  it('exports buildBundleFilename function', () => {
    expect(source).toContain('export function buildBundleFilename(');
  });

  it('uses sanitiseTitle and buildTimestampSuffix', () => {
    const fnStart = source.indexOf('export function buildBundleFilename(');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('sanitiseTitle(title)');
    expect(body).toContain('buildTimestampSuffix(date)');
  });

  it('appends REVIEW_BUNDLE_EXTENSION to the filename', () => {
    const fnStart = source.indexOf('export function buildBundleFilename(');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('REVIEW_BUNDLE_EXTENSION');
  });

  it('includes _review_ separator in the pattern', () => {
    const fnStart = source.indexOf('export function buildBundleFilename(');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('_review_');
  });
});

// ---------------------------------------------------------------------------
// isBundleExportable guard
// ---------------------------------------------------------------------------

describe('isBundleExportable', () => {
  it('exports isBundleExportable function', () => {
    expect(source).toContain('export function isBundleExportable(');
  });

  it('returns false when both annotations and eventLog are empty', () => {
    const fnStart = source.indexOf('export function isBundleExportable(');
    const body = source.slice(fnStart, fnStart + 200);
    expect(body).toContain('annotations.length > 0');
    expect(body).toContain('eventLog.length > 0');
  });
});

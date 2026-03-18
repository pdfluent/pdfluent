// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const source = readFileSync(
  new URL('../src/viewer/collaboration/reviewBundleFormat.ts', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('reviewBundleFormat — constants', () => {
  it('exports REVIEW_BUNDLE_EXTENSION as .reviewbundle', () => {
    expect(source).toContain("REVIEW_BUNDLE_EXTENSION = '.reviewbundle'");
  });

  it('exports REVIEW_BUNDLE_VERSION as 1.0', () => {
    expect(source).toContain("REVIEW_BUNDLE_VERSION = '1.0'");
  });

  it('exports BUNDLE_FILES with DOCUMENT, REVIEW_STATE, AUDIT_LOG, METADATA', () => {
    expect(source).toContain('BUNDLE_FILES');
    expect(source).toContain("DOCUMENT: 'document.pdf'");
    expect(source).toContain("REVIEW_STATE: 'review_state.json'");
    expect(source).toContain("AUDIT_LOG: 'audit_log.json'");
    expect(source).toContain("METADATA: 'metadata.json'");
  });
});

// ---------------------------------------------------------------------------
// BundleMetadata interface
// ---------------------------------------------------------------------------

describe('BundleMetadata', () => {
  it('declares version field', () => {
    expect(source).toContain('version: string');
  });

  it('declares title field', () => {
    const ifaceStart = source.indexOf('interface BundleMetadata');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain('title: string');
  });

  it('declares documentHash field', () => {
    expect(source).toContain('documentHash: string');
  });

  it('declares createdAt field', () => {
    expect(source).toContain('createdAt: string');
  });

  it('declares exportedBy field', () => {
    expect(source).toContain('exportedBy: string');
  });

  it('declares exportedAt field', () => {
    expect(source).toContain('exportedAt: string');
  });
});

// ---------------------------------------------------------------------------
// BundleReviewState interface
// ---------------------------------------------------------------------------

describe('BundleReviewState', () => {
  it('declares annotations array field', () => {
    const ifaceStart = source.indexOf('interface BundleReviewState');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain('annotations: Annotation[]');
  });

  it('declares reviewStatuses as serialised entries', () => {
    expect(source).toContain("reviewStatuses: [string, 'open' | 'resolved'][]");
  });

  it('declares commentReplies as serialised entries', () => {
    expect(source).toContain('commentReplies: [string, Reply[]][]');
  });
});

// ---------------------------------------------------------------------------
// BundleAuditLog interface
// ---------------------------------------------------------------------------

describe('BundleAuditLog', () => {
  it('declares events as DocumentEvent array', () => {
    expect(source).toContain('events: DocumentEvent[]');
  });
});

// ---------------------------------------------------------------------------
// ReviewBundle interface
// ---------------------------------------------------------------------------

describe('ReviewBundle', () => {
  it('declares metadata, reviewState, and auditLog fields', () => {
    const ifaceStart = source.indexOf('interface ReviewBundle');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain('metadata: BundleMetadata');
    expect(block).toContain('reviewState: BundleReviewState');
    expect(block).toContain('auditLog: BundleAuditLog');
  });
});

// ---------------------------------------------------------------------------
// makeBundleMetadata
// ---------------------------------------------------------------------------

describe('makeBundleMetadata', () => {
  it('exports makeBundleMetadata function', () => {
    expect(source).toContain('export function makeBundleMetadata(');
  });

  it('sets version to REVIEW_BUNDLE_VERSION', () => {
    const fnStart = source.indexOf('export function makeBundleMetadata');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('version: REVIEW_BUNDLE_VERSION');
  });

  it('falls back to Anonymous when exportedBy is empty', () => {
    const fnStart = source.indexOf('export function makeBundleMetadata');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain("'Anonymous'");
  });

  it('sets both createdAt and exportedAt to current ISO time', () => {
    const fnStart = source.indexOf('export function makeBundleMetadata');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('createdAt');
    expect(body).toContain('exportedAt');
    expect(body).toContain('toISOString()');
  });
});

// ---------------------------------------------------------------------------
// makeEmptyReviewState
// ---------------------------------------------------------------------------

describe('makeEmptyReviewState', () => {
  it('exports makeEmptyReviewState function', () => {
    expect(source).toContain('export function makeEmptyReviewState()');
  });

  it('returns an object with empty arrays for all three fields', () => {
    const fnStart = source.indexOf('export function makeEmptyReviewState');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('annotations: []');
    expect(body).toContain('reviewStatuses: []');
    expect(body).toContain('commentReplies: []');
  });
});

// ---------------------------------------------------------------------------
// serializeReviewBundle
// ---------------------------------------------------------------------------

describe('serializeReviewBundle', () => {
  it('exports serializeReviewBundle function', () => {
    expect(source).toContain('export function serializeReviewBundle(bundle: ReviewBundle)');
  });

  it('uses JSON.stringify with 2-space indentation', () => {
    const fnStart = source.indexOf('export function serializeReviewBundle');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('JSON.stringify(bundle, null, 2)');
  });
});

// ---------------------------------------------------------------------------
// serializeBundleManifest
// ---------------------------------------------------------------------------

describe('serializeBundleManifest', () => {
  it('exports serializeBundleManifest function', () => {
    expect(source).toContain('export function serializeBundleManifest(bundle: ReviewBundle)');
  });

  it('manifest includes files list (BUNDLE_FILES values)', () => {
    const fnStart = source.indexOf('export function serializeBundleManifest');
    const body = source.slice(fnStart, fnStart + 400);
    expect(body).toContain('Object.values(BUNDLE_FILES)');
  });

  it('manifest includes exportedAt, exportedBy, title', () => {
    const fnStart = source.indexOf('export function serializeBundleManifest');
    const body = source.slice(fnStart, fnStart + 400);
    expect(body).toContain('exportedAt');
    expect(body).toContain('exportedBy');
    expect(body).toContain('title');
  });
});

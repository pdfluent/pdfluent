// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const source = readFileSync(
  new URL('../src/viewer/collaboration/reviewerIdentity.ts', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// ReviewerIdentity interface
// ---------------------------------------------------------------------------

describe('ReviewerIdentity', () => {
  it('declares id field', () => {
    const ifaceStart = source.indexOf('interface ReviewerIdentity');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain('id: string');
  });

  it('declares name field', () => {
    const ifaceStart = source.indexOf('interface ReviewerIdentity');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain('name: string');
  });

  it('declares createdAt field', () => {
    const ifaceStart = source.indexOf('interface ReviewerIdentity');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain('createdAt: string');
  });
});

// ---------------------------------------------------------------------------
// REVIEWER_IDENTITY_STORAGE_KEY
// ---------------------------------------------------------------------------

describe('REVIEWER_IDENTITY_STORAGE_KEY', () => {
  it('exports the storage key constant', () => {
    expect(source).toContain("export const REVIEWER_IDENTITY_STORAGE_KEY");
  });

  it('uses pdfluent namespace', () => {
    expect(source).toContain("'pdfluent.reviewer.identity'");
  });
});

// ---------------------------------------------------------------------------
// makeReviewerIdentity
// ---------------------------------------------------------------------------

describe('makeReviewerIdentity', () => {
  it('exports makeReviewerIdentity function', () => {
    expect(source).toContain('export function makeReviewerIdentity(name: string)');
  });

  it('generates id with reviewer- prefix', () => {
    const fnStart = source.indexOf('export function makeReviewerIdentity');
    const fnEnd = source.indexOf('\n}', fnStart) + 2;
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('reviewer-');
  });

  it('falls back to Anonymous when name is blank', () => {
    const fnStart = source.indexOf('export function makeReviewerIdentity');
    const fnEnd = source.indexOf('\n}', fnStart) + 2;
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain("'Anonymous'");
  });

  it('includes createdAt as ISO string', () => {
    const fnStart = source.indexOf('export function makeReviewerIdentity');
    const fnEnd = source.indexOf('\n}', fnStart) + 2;
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('toISOString()');
  });
});

// ---------------------------------------------------------------------------
// getReviewerDisplayName
// ---------------------------------------------------------------------------

describe('getReviewerDisplayName', () => {
  it('exports getReviewerDisplayName function', () => {
    expect(source).toContain('export function getReviewerDisplayName(identity: ReviewerIdentity)');
  });

  it('falls back to Anonymous for blank name', () => {
    const fnStart = source.indexOf('export function getReviewerDisplayName');
    const fnEnd = source.indexOf('\n}', fnStart) + 2;
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain("'Anonymous'");
  });
});

// ---------------------------------------------------------------------------
// isAnonymousReviewer
// ---------------------------------------------------------------------------

describe('isAnonymousReviewer', () => {
  it('exports isAnonymousReviewer function', () => {
    expect(source).toContain('export function isAnonymousReviewer(identity: ReviewerIdentity)');
  });

  it('checks for blank name', () => {
    const fnStart = source.indexOf('export function isAnonymousReviewer');
    const fnEnd = source.indexOf('\n}', fnStart) + 2;
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('identity.name.trim()');
  });

  it('checks for explicit Anonymous value', () => {
    const fnStart = source.indexOf('export function isAnonymousReviewer');
    const fnEnd = source.indexOf('\n}', fnStart) + 2;
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain("=== 'Anonymous'");
  });
});

// ---------------------------------------------------------------------------
// extractReviewersFromBundle
// ---------------------------------------------------------------------------

describe('extractReviewersFromBundle', () => {
  it('exports extractReviewersFromBundle function', () => {
    expect(source).toContain('export function extractReviewersFromBundle(');
  });

  it('accepts BundleReviewState parameter', () => {
    const fnStart = source.indexOf('export function extractReviewersFromBundle');
    const sig = source.slice(fnStart, fnStart + 120);
    expect(sig).toContain('BundleReviewState');
  });

  it('deduplicates authors with a Set', () => {
    const fnStart = source.indexOf('export function extractReviewersFromBundle');
    const fnEnd = source.indexOf('\n}', fnStart) + 2;
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('new Set(');
  });

  it('maps unique names to ReviewerIdentity objects', () => {
    const fnStart = source.indexOf('export function extractReviewersFromBundle');
    const fnEnd = source.indexOf('\n}', fnStart) + 2;
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('makeReviewerIdentity');
  });
});

// ---------------------------------------------------------------------------
// loadReviewerIdentity
// ---------------------------------------------------------------------------

describe('loadReviewerIdentity', () => {
  it('exports loadReviewerIdentity function', () => {
    expect(source).toContain('export function loadReviewerIdentity()');
  });

  it('reads from localStorage using the storage key', () => {
    const fnStart = source.indexOf('export function loadReviewerIdentity');
    const fnEnd = source.indexOf('\n}', fnStart) + 2;
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('localStorage.getItem(REVIEWER_IDENTITY_STORAGE_KEY)');
  });

  it('returns null when nothing is stored', () => {
    const fnStart = source.indexOf('export function loadReviewerIdentity');
    const fnEnd = source.indexOf('\n}', fnStart) + 2;
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('return null');
  });

  it('wraps in try/catch and returns null on error', () => {
    const fnStart = source.indexOf('export function loadReviewerIdentity');
    const fnEnd = source.indexOf('\n}', fnStart) + 2;
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('catch');
  });
});

// ---------------------------------------------------------------------------
// saveReviewerIdentity
// ---------------------------------------------------------------------------

describe('saveReviewerIdentity', () => {
  it('exports saveReviewerIdentity function', () => {
    expect(source).toContain('export function saveReviewerIdentity(identity: ReviewerIdentity)');
  });

  it('writes to localStorage using the storage key', () => {
    const fnStart = source.indexOf('export function saveReviewerIdentity');
    const fnEnd = source.indexOf('\n}', fnStart) + 2;
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('localStorage.setItem(REVIEWER_IDENTITY_STORAGE_KEY');
  });

  it('serialises identity with JSON.stringify', () => {
    const fnStart = source.indexOf('export function saveReviewerIdentity');
    const fnEnd = source.indexOf('\n}', fnStart) + 2;
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('JSON.stringify(identity)');
  });
});

// ---------------------------------------------------------------------------
// loadOrCreateReviewerIdentity
// ---------------------------------------------------------------------------

describe('loadOrCreateReviewerIdentity', () => {
  it('exports loadOrCreateReviewerIdentity function', () => {
    expect(source).toContain('export function loadOrCreateReviewerIdentity(');
  });

  it('has a fallbackName parameter with empty string default', () => {
    const fnStart = source.indexOf('export function loadOrCreateReviewerIdentity');
    const sig = source.slice(fnStart, fnStart + 100);
    expect(sig).toContain("fallbackName = ''");
  });

  it('calls loadReviewerIdentity and falls back with nullish coalescing', () => {
    const fnStart = source.indexOf('export function loadOrCreateReviewerIdentity');
    const fnEnd = source.indexOf('\n}', fnStart) + 2;
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('loadReviewerIdentity()');
    expect(body).toContain('??');
    expect(body).toContain('makeReviewerIdentity(fallbackName)');
  });
});

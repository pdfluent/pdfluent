// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const source = readFileSync(
  new URL('../src/viewer/collaboration/reviewBundleCompare.ts', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// AnnotationDiff interface
// ---------------------------------------------------------------------------

describe('AnnotationDiff', () => {
  it('declares id field', () => {
    const ifaceStart = source.indexOf('interface AnnotationDiff');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain('id: string');
  });

  it('declares kind field', () => {
    const ifaceStart = source.indexOf('interface AnnotationDiff');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain('kind: AnnotationDiffKind');
  });
});

// ---------------------------------------------------------------------------
// StatusChange interface
// ---------------------------------------------------------------------------

describe('StatusChange', () => {
  it('declares annotationId field', () => {
    const ifaceStart = source.indexOf('interface StatusChange');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain('annotationId: string');
  });

  it('declares from field', () => {
    const ifaceStart = source.indexOf('interface StatusChange');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain("from: 'open' | 'resolved'");
  });

  it('declares to field', () => {
    const ifaceStart = source.indexOf('interface StatusChange');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain("to: 'open' | 'resolved'");
  });
});

// ---------------------------------------------------------------------------
// BundleCompareDiff interface
// ---------------------------------------------------------------------------

describe('BundleCompareDiff', () => {
  it('declares annotationDiffs field', () => {
    const ifaceStart = source.indexOf('interface BundleCompareDiff');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain('annotationDiffs: AnnotationDiff[]');
  });

  it('declares statusChanges field', () => {
    const ifaceStart = source.indexOf('interface BundleCompareDiff');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain('statusChanges: StatusChange[]');
  });

  it('declares addedReplyCounts as Map', () => {
    const ifaceStart = source.indexOf('interface BundleCompareDiff');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain('addedReplyCounts: Map<string, number>');
  });

  it('declares addedAnnotations count', () => {
    const ifaceStart = source.indexOf('interface BundleCompareDiff');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain('addedAnnotations: number');
  });

  it('declares removedAnnotations count', () => {
    const ifaceStart = source.indexOf('interface BundleCompareDiff');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain('removedAnnotations: number');
  });

  it('declares statusChangesCount', () => {
    const ifaceStart = source.indexOf('interface BundleCompareDiff');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain('statusChangesCount: number');
  });

  it('declares totalRepliesAdded', () => {
    const ifaceStart = source.indexOf('interface BundleCompareDiff');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain('totalRepliesAdded: number');
  });
});

// ---------------------------------------------------------------------------
// compareReviewBundles
// ---------------------------------------------------------------------------

describe('compareReviewBundles', () => {
  it('exports compareReviewBundles function', () => {
    expect(source).toContain('export function compareReviewBundles(');
  });

  it('accepts base and incoming BundleReviewState', () => {
    const fnStart = source.indexOf('export function compareReviewBundles(');
    const sig = source.slice(fnStart, fnStart + 150);
    expect(sig).toContain('base: BundleReviewState');
    expect(sig).toContain('incoming: BundleReviewState');
  });

  it('detects added annotations (not in base)', () => {
    const fnStart = source.indexOf('export function compareReviewBundles(');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain("'added'");
  });

  it('detects removed annotations (in base but not incoming)', () => {
    const fnStart = source.indexOf('export function compareReviewBundles(');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain("'removed'");
  });

  it('detects status changes between bundles', () => {
    const fnStart = source.indexOf('export function compareReviewBundles(');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('statusChanges');
    expect(body).toContain('from: baseStatus');
  });

  it('counts added replies per annotation', () => {
    const fnStart = source.indexOf('export function compareReviewBundles(');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('addedReplyCounts');
  });

  it('sums totalRepliesAdded', () => {
    const fnStart = source.indexOf('export function compareReviewBundles(');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('totalRepliesAdded');
  });
});

// ---------------------------------------------------------------------------
// isBundleIdentical
// ---------------------------------------------------------------------------

describe('isBundleIdentical', () => {
  it('exports isBundleIdentical function', () => {
    expect(source).toContain('export function isBundleIdentical(diff: BundleCompareDiff)');
  });

  it('checks all four diff counts are zero', () => {
    const fnStart = source.indexOf('export function isBundleIdentical');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('addedAnnotations === 0');
    expect(body).toContain('removedAnnotations === 0');
    expect(body).toContain('statusChangesCount === 0');
    expect(body).toContain('totalRepliesAdded === 0');
  });
});

// ---------------------------------------------------------------------------
// countAnnotationsByKind
// ---------------------------------------------------------------------------

describe('countAnnotationsByKind', () => {
  it('exports countAnnotationsByKind function', () => {
    expect(source).toContain('export function countAnnotationsByKind(');
  });

  it('filters diffs by kind and counts', () => {
    const fnStart = source.indexOf('export function countAnnotationsByKind');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('filter(d => d.kind === kind)');
    expect(body).toContain('.length');
  });
});

// ---------------------------------------------------------------------------
// describeBundleDiff
// ---------------------------------------------------------------------------

describe('describeBundleDiff', () => {
  it('exports describeBundleDiff function', () => {
    expect(source).toContain('export function describeBundleDiff(diff: BundleCompareDiff)');
  });

  it('returns identical message when no changes', () => {
    const fnStart = source.indexOf('export function describeBundleDiff');
    const body = source.slice(fnStart, fnStart + 600);
    expect(body).toContain('Bundels zijn identiek');
  });

  it('mentions toegevoegd for added annotations', () => {
    const fnStart = source.indexOf('export function describeBundleDiff');
    const fnEnd = source.indexOf('\n}', fnStart + source.indexOf('\n}', fnStart) - fnStart + 2);
    const body = source.slice(fnStart, fnStart + 700);
    expect(body).toContain('toegevoegd');
  });

  it('mentions gewijzigd for status changes', () => {
    const fnStart = source.indexOf('export function describeBundleDiff');
    const body = source.slice(fnStart, fnStart + 700);
    expect(body).toContain('gewijzigd');
  });
});

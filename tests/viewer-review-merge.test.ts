// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const source = readFileSync(
  new URL('../src/viewer/collaboration/reviewMerge.ts', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// MergeConflict interface
// ---------------------------------------------------------------------------

describe('MergeConflict', () => {
  it('declares annotationId field', () => {
    expect(source).toContain('annotationId: string');
  });

  it('declares reason field', () => {
    const ifaceStart = source.indexOf('interface MergeConflict');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain('reason: string');
  });
});

// ---------------------------------------------------------------------------
// MergeResult interface
// ---------------------------------------------------------------------------

describe('MergeResult', () => {
  it('declares annotations field', () => {
    const ifaceStart = source.indexOf('interface MergeResult');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain('annotations: Annotation[]');
  });

  it('declares reviewStatuses as Map', () => {
    expect(source).toContain("reviewStatuses: Map<string, 'open' | 'resolved'>");
  });

  it('declares commentReplies as Map', () => {
    expect(source).toContain('commentReplies: Map<string, Reply[]>');
  });

  it('declares conflicts array', () => {
    expect(source).toContain('conflicts: MergeConflict[]');
  });

  it('declares addedAnnotations count', () => {
    expect(source).toContain('addedAnnotations: number');
  });

  it('declares resolvedAnnotations count', () => {
    expect(source).toContain('resolvedAnnotations: number');
  });
});

// ---------------------------------------------------------------------------
// mergeReviewStates
// ---------------------------------------------------------------------------

describe('mergeReviewStates', () => {
  it('exports mergeReviewStates function', () => {
    expect(source).toContain('export function mergeReviewStates(');
  });

  it('accepts base and incoming BundleReviewState', () => {
    const fnStart = source.indexOf('export function mergeReviewStates(');
    const fnSig = source.slice(fnStart, fnStart + 150);
    expect(fnSig).toContain('base: BundleReviewState');
    expect(fnSig).toContain('incoming: BundleReviewState');
  });

  it('deduplicates annotations by id (base ∪ incoming)', () => {
    const fnStart = source.indexOf('export function mergeReviewStates(');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('base.annotations.map(a => a.id)');
    expect(body).toContain('!baseIds.has(a.id)');
  });

  it("resolved status always overrides open (most-resolved wins)", () => {
    const fnStart = source.indexOf('export function mergeReviewStates(');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain("incomingStatus === 'resolved'");
  });

  it('deduplicates replies by id per annotation', () => {
    const fnStart = source.indexOf('export function mergeReviewStates(');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('existingIds.has(r.id)');
  });

  it('tracks resolvedAnnotations count', () => {
    const fnStart = source.indexOf('export function mergeReviewStates(');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('resolvedAnnotations++');
  });

  it('tracks addedAnnotations count', () => {
    const fnStart = source.indexOf('export function mergeReviewStates(');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('addedAnnotations: newAnnotations.length');
  });
});

// ---------------------------------------------------------------------------
// mergeToBundleReviewState
// ---------------------------------------------------------------------------

describe('mergeToBundleReviewState', () => {
  it('exports mergeToBundleReviewState function', () => {
    expect(source).toContain('export function mergeToBundleReviewState(result: MergeResult)');
  });

  it('serialises Maps back to entries arrays', () => {
    const fnStart = source.indexOf('export function mergeToBundleReviewState');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('Array.from(result.reviewStatuses.entries())');
    expect(body).toContain('Array.from(result.commentReplies.entries())');
  });
});

// ---------------------------------------------------------------------------
// isMergeCompatible
// ---------------------------------------------------------------------------

describe('isMergeCompatible', () => {
  it('exports isMergeCompatible function', () => {
    expect(source).toContain('export function isMergeCompatible(baseTitle: string, incomingTitle: string)');
  });

  it('normalises to lowercase for comparison', () => {
    const fnStart = source.indexOf('export function isMergeCompatible');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('toLowerCase()');
  });
});

// ---------------------------------------------------------------------------
// describeMergeResult
// ---------------------------------------------------------------------------

describe('describeMergeResult', () => {
  it('exports describeMergeResult function', () => {
    expect(source).toContain('export function describeMergeResult(result: MergeResult)');
  });

  it('returns a no-changes message when result is empty', () => {
    const fnStart = source.indexOf('export function describeMergeResult');
    const body = source.slice(fnStart, fnStart + 700);
    expect(body).toContain('Geen wijzigingen gevonden');
  });
});

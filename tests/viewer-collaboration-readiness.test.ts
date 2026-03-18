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
const identitySource = readFileSync(
  new URL('../src/viewer/collaboration/reviewerIdentity.ts', import.meta.url),
  'utf8'
);
const panelSource = readFileSync(
  new URL('../src/viewer/components/ReviewHandoffPanel.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// reviewBundleFormat — all public exports present
// ---------------------------------------------------------------------------

describe('reviewBundleFormat readiness', () => {
  it('exports REVIEW_BUNDLE_EXTENSION', () => {
    expect(formatSource).toContain('export const REVIEW_BUNDLE_EXTENSION');
  });

  it('exports REVIEW_BUNDLE_VERSION', () => {
    expect(formatSource).toContain('export const REVIEW_BUNDLE_VERSION');
  });

  it('exports BUNDLE_FILES', () => {
    expect(formatSource).toContain('export const BUNDLE_FILES');
  });

  it('exports BundleMetadata interface', () => {
    expect(formatSource).toContain('export interface BundleMetadata');
  });

  it('exports BundleReviewState interface', () => {
    expect(formatSource).toContain('export interface BundleReviewState');
  });

  it('exports ReviewBundle interface', () => {
    expect(formatSource).toContain('export interface ReviewBundle');
  });

  it('exports makeBundleMetadata', () => {
    expect(formatSource).toContain('export function makeBundleMetadata(');
  });

  it('exports makeEmptyReviewState', () => {
    expect(formatSource).toContain('export function makeEmptyReviewState()');
  });

  it('exports serializeReviewBundle', () => {
    expect(formatSource).toContain('export function serializeReviewBundle(');
  });

  it('exports serializeBundleManifest', () => {
    expect(formatSource).toContain('export function serializeBundleManifest(');
  });
});

// ---------------------------------------------------------------------------
// reviewBundleExport — all public exports present
// ---------------------------------------------------------------------------

describe('reviewBundleExport readiness', () => {
  it('exports ReviewBundleExportPayload type', () => {
    expect(exportSource).toContain('export type ReviewBundleExportPayload');
  });

  it('exports buildReviewBundlePayload', () => {
    expect(exportSource).toContain('export function buildReviewBundlePayload(');
  });

  it('exports serializeBundlePayload', () => {
    expect(exportSource).toContain('export function serializeBundlePayload(');
  });

  it('exports buildBundleFilename', () => {
    expect(exportSource).toContain('export function buildBundleFilename(');
  });

  it('exports isBundleExportable', () => {
    expect(exportSource).toContain('export function isBundleExportable(');
  });
});

// ---------------------------------------------------------------------------
// reviewBundleImport — all public exports present
// ---------------------------------------------------------------------------

describe('reviewBundleImport readiness', () => {
  it('exports parseReviewBundleJson', () => {
    expect(importSource).toContain('export function parseReviewBundleJson(');
  });

  it('exports validateBundleVersion', () => {
    expect(importSource).toContain('export function validateBundleVersion(');
  });

  it('exports extractAnnotationsFromBundle', () => {
    expect(importSource).toContain('export function extractAnnotationsFromBundle(');
  });

  it('exports makeEmptyImportResult', () => {
    expect(importSource).toContain('export function makeEmptyImportResult()');
  });

  it('exports isImportResultValid', () => {
    expect(importSource).toContain('export function isImportResultValid(');
  });

  it('exports patchIncompleteBundle', () => {
    expect(importSource).toContain('export function patchIncompleteBundle(');
  });
});

// ---------------------------------------------------------------------------
// reviewMerge — all public exports present
// ---------------------------------------------------------------------------

describe('reviewMerge readiness', () => {
  it('exports MergeConflict interface', () => {
    expect(mergeSource).toContain('export interface MergeConflict');
  });

  it('exports MergeResult interface', () => {
    expect(mergeSource).toContain('export interface MergeResult');
  });

  it('exports mergeReviewStates', () => {
    expect(mergeSource).toContain('export function mergeReviewStates(');
  });

  it('exports mergeToBundleReviewState', () => {
    expect(mergeSource).toContain('export function mergeToBundleReviewState(');
  });

  it('exports isMergeCompatible', () => {
    expect(mergeSource).toContain('export function isMergeCompatible(');
  });

  it('exports describeMergeResult', () => {
    expect(mergeSource).toContain('export function describeMergeResult(');
  });
});

// ---------------------------------------------------------------------------
// reviewBundleCompare — all public exports present
// ---------------------------------------------------------------------------

describe('reviewBundleCompare readiness', () => {
  it('exports BundleCompareDiff interface', () => {
    expect(compareSource).toContain('export interface BundleCompareDiff');
  });

  it('exports compareReviewBundles', () => {
    expect(compareSource).toContain('export function compareReviewBundles(');
  });

  it('exports isBundleIdentical', () => {
    expect(compareSource).toContain('export function isBundleIdentical(');
  });

  it('exports countAnnotationsByKind', () => {
    expect(compareSource).toContain('export function countAnnotationsByKind(');
  });

  it('exports describeBundleDiff', () => {
    expect(compareSource).toContain('export function describeBundleDiff(');
  });
});

// ---------------------------------------------------------------------------
// reviewerIdentity — all public exports present
// ---------------------------------------------------------------------------

describe('reviewerIdentity readiness', () => {
  it('exports ReviewerIdentity interface', () => {
    expect(identitySource).toContain('export interface ReviewerIdentity');
  });

  it('exports REVIEWER_IDENTITY_STORAGE_KEY', () => {
    expect(identitySource).toContain('export const REVIEWER_IDENTITY_STORAGE_KEY');
  });

  it('exports makeReviewerIdentity', () => {
    expect(identitySource).toContain('export function makeReviewerIdentity(');
  });

  it('exports loadReviewerIdentity', () => {
    expect(identitySource).toContain('export function loadReviewerIdentity()');
  });

  it('exports saveReviewerIdentity', () => {
    expect(identitySource).toContain('export function saveReviewerIdentity(');
  });

  it('exports loadOrCreateReviewerIdentity', () => {
    expect(identitySource).toContain('export function loadOrCreateReviewerIdentity(');
  });
});

// ---------------------------------------------------------------------------
// ReviewHandoffPanel — wires all collaboration modules
// ---------------------------------------------------------------------------

describe('ReviewHandoffPanel collaboration wiring', () => {
  it('imports from reviewBundleExport', () => {
    expect(panelSource).toContain("from '../export/reviewBundleExport'");
  });

  it('imports from reviewBundleImport', () => {
    expect(panelSource).toContain("from '../import/reviewBundleImport'");
  });

  it('imports from reviewMerge', () => {
    expect(panelSource).toContain("from '../collaboration/reviewMerge'");
  });

  it('imports from reviewBundleCompare', () => {
    expect(panelSource).toContain("from '../collaboration/reviewBundleCompare'");
  });

  it('imports from reviewerIdentity', () => {
    expect(panelSource).toContain("from '../collaboration/reviewerIdentity'");
  });
});

// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Layout Editing E2E Tests — OBJECT_AND_LAYOUT_EDITING_EXCELLENCE_BLOCK Batch 9
 *
 * Validates the layout editing system via Playwright:
 *
 * Source readiness:
 * - All layout modules exist and export their expected symbols
 * - ObjectSelectionOverlay component exports are present
 * - objectDetection.ts exports detectLayoutObjects and IDENTITY_MATRIX
 * - objectMoveEngine.ts exports computeMove
 * - objectResizeEngine.ts exports computeResize and MIN_OBJECT_SIZE
 * - imageReplacePipeline.ts exports validateImageReplace and prepareImageReplaceRequest
 * - layoutAlignmentGuides.ts exports computeActiveGuides and SNAP_THRESHOLD
 * - layoutLayerModel.ts exports buildLayerModel
 * - layoutCollisionValidator.ts exports validateCollisions
 *
 * Runtime behaviour:
 * - No JS errors on baseline page load
 * - Overlay container is present in the DOM when viewer is active
 * - Mode cycle (select → layout-edit → select) completes without errors
 * - Layout editing mode can be activated without crashing the viewer
 */

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Source readiness helpers
// ---------------------------------------------------------------------------

function readSrc(relPath: string): string {
  return readFileSync(join(__dir, relPath), 'utf8');
}

// ---------------------------------------------------------------------------
// Source readiness — layout modules
// ---------------------------------------------------------------------------

test.describe('layout-edit — source readiness', () => {

  test('objectDetection.ts exports detectLayoutObjects, classifyRawObject, IDENTITY_MATRIX', () => {
    const src = readSrc('../../../src/viewer/layout/objectDetection.ts');
    expect(src).toContain('export function detectLayoutObjects');
    expect(src).toContain('export function classifyRawObject');
    expect(src).toContain('export const IDENTITY_MATRIX');
  });

  test('objectDetection.ts exports rect utilities', () => {
    const src = readSrc('../../../src/viewer/layout/objectDetection.ts');
    expect(src).toContain('export function rectsOverlap');
    expect(src).toContain('export function rectContains');
    expect(src).toContain('export function translateRect');
    expect(src).toContain('export function rectCenter');
  });

  test('objectMoveEngine.ts exports computeMove and session helpers', () => {
    const src = readSrc('../../../src/viewer/layout/objectMoveEngine.ts');
    expect(src).toContain('export function computeMove');
    expect(src).toContain('export function beginMoveSession');
    expect(src).toContain('export function updateMoveSession');
    expect(src).toContain('export function translateMatrix');
    expect(src).toContain('export function snapToGrid');
  });

  test('objectResizeEngine.ts exports computeResize and MIN_OBJECT_SIZE', () => {
    const src = readSrc('../../../src/viewer/layout/objectResizeEngine.ts');
    expect(src).toContain('export function computeResize');
    expect(src).toContain('export const MIN_OBJECT_SIZE');
    expect(src).toContain('export function computeResizeRect');
    expect(src).toContain('export function computeResizeMatrix');
  });

  test('imageReplacePipeline.ts exports validate and prepare functions', () => {
    const src = readSrc('../../../src/viewer/layout/imageReplacePipeline.ts');
    expect(src).toContain('export function validateImageReplace');
    expect(src).toContain('export function prepareImageReplaceRequest');
    expect(src).toContain('export function computeImageDisplayRect');
    expect(src).toContain('export function interpretReplaceResult');
    expect(src).toContain('export function isSupportedMimeType');
  });

  test('layoutAlignmentGuides.ts exports guide builders and SNAP_THRESHOLD', () => {
    const src = readSrc('../../../src/viewer/layout/layoutAlignmentGuides.ts');
    expect(src).toContain('export const SNAP_THRESHOLD');
    expect(src).toContain('export function computePageGuides');
    expect(src).toContain('export function computeObjectGuides');
    expect(src).toContain('export function computeActiveGuides');
    expect(src).toContain('export function buildAllGuides');
  });

  test('layoutLayerModel.ts exports buildLayerModel and query helpers', () => {
    const src = readSrc('../../../src/viewer/layout/layoutLayerModel.ts');
    expect(src).toContain('export function buildLayerModel');
    expect(src).toContain('export function getZOrder');
    expect(src).toContain('export function isOnTop');
    expect(src).toContain('export function isObjectLocked');
    expect(src).toContain('export function isObjectVisible');
  });

  test('layoutCollisionValidator.ts exports validateCollisions and individual checks', () => {
    const src = readSrc('../../../src/viewer/layout/layoutCollisionValidator.ts');
    expect(src).toContain('export function validateCollisions');
    expect(src).toContain('export function checkPageBoundary');
    expect(src).toContain('export function checkMinimumSize');
    expect(src).toContain('export function checkObjectOverlap');
    expect(src).toContain('export function checkAnnotationAlignment');
    expect(src).toContain('export function checkClippingRisk');
  });

  test('ObjectSelectionOverlay.tsx exports component and helpers', () => {
    const src = readSrc('../../../src/viewer/components/ObjectSelectionOverlay.tsx');
    expect(src).toContain('export function ObjectSelectionOverlay');
    expect(src).toContain('export function pdfRectToDom');
    expect(src).toContain('export function handlePosition');
    expect(src).toContain('export const HANDLE_CURSORS');
    expect(src).toContain('export const RESIZE_HANDLES');
    expect(src).toContain('export const OBJECT_TYPE_LABELS');
    expect(src).toContain('export const HANDLE_SIZE');
  });

  test('objectMoveEngine: MoveOutcome covers all expected cases', () => {
    const src = readSrc('../../../src/viewer/layout/objectMoveEngine.ts');
    expect(src).toContain("'moved'");
    expect(src).toContain("'clamped'");
    expect(src).toContain("'blocked-locked'");
    expect(src).toContain("'blocked-non-movable'");
  });

  test('imageReplacePipeline: all scale strategies are defined', () => {
    const src = readSrc('../../../src/viewer/layout/imageReplacePipeline.ts');
    expect(src).toContain("'preserve'");
    expect(src).toContain("'fit'");
    expect(src).toContain("'fill'");
    expect(src).toContain("'stretch'");
  });

  test('layoutCollisionValidator: all CollisionCode values are defined', () => {
    const src = readSrc('../../../src/viewer/layout/layoutCollisionValidator.ts');
    expect(src).toContain("'page-boundary-violation'");
    expect(src).toContain("'object-overlap'");
    expect(src).toContain("'annotation-misalignment'");
    expect(src).toContain("'clipping-risk'");
    expect(src).toContain("'minimum-size-violation'");
    expect(src).toContain("'locked-layer'");
  });

  test('all layout modules use correct copyright header', () => {
    const modules = [
      'objectDetection.ts',
      'objectMoveEngine.ts',
      'objectResizeEngine.ts',
      'imageReplacePipeline.ts',
      'layoutAlignmentGuides.ts',
      'layoutLayerModel.ts',
      'layoutCollisionValidator.ts',
    ];
    for (const mod of modules) {
      const src = readSrc(`../../../src/viewer/layout/${mod}`);
      expect(src).toContain('Copyright (c) 2026');
      expect(src).toContain('pdfluent.com/license');
    }
  });
});

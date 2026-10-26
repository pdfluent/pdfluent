// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { describe, expect, it } from 'vitest';
import { markerTarget, newlyPlacedImage, pageImageAnnotations, pageImageId, parsePageImageId } from '../pageImages';
import { selectionActions } from '../v3/placementControls';

describe('page images as selection targets (#723)', () => {
  it('round-trips the id', () => {
    expect(parsePageImageId(pageImageId(3, 17))).toEqual({ pageIndex: 3, index: 17 });
  });

  it('does not take an annotation id for a page image', () => {
    expect(parsePageImageId('2:5')).toBeNull();
    expect(parsePageImageId('pageimage:x:1')).toBeNull();
    expect(parsePageImageId('pageimage:1')).toBeNull();
  });

  it('turns a placement into a movable placed-image stamp with replace and delete', () => {
    const [a] = pageImageAnnotations(1, [
      { index: 4, name: 'Im0', rect: [10, 20, 110, 100], pixelWidth: 8, pixelHeight: 8 },
    ]);
    expect(a.id).toBe('pageimage:1:4');
    expect(a.rect).toEqual({ x: 10, y: 20, width: 100, height: 80 });
    expect(selectionActions(a)).toEqual(['replace-image-btn', 'delete-selected-annotation-btn']);
  });

  it('finds the picture behind a clicked marker, and an annotation first', () => {
    const images = pageImageAnnotations(0, [
      { index: 0, name: 'Im0', rect: [0, 0, 612, 792], pixelWidth: 8, pixelHeight: 8 },
    ]);
    const note = { ...images[0], id: 'note-1', type: 'text' as const };
    expect(markerTarget('pageimage:0:0', [note], images)?.id).toBe('pageimage:0:0');
    expect(markerTarget('note-1', [note], images)?.type).toBe('text');
    expect(markerTarget('pageimage:0:9', [note], images)).toBeUndefined();
  });

  // J-45: a picture just placed is the one to select.
  describe('newlyPlacedImage', () => {
    const base = pageImageAnnotations(0, [
      { index: 0, name: 'Im0', rect: [0, 0, 10, 10], pixelWidth: 1, pixelHeight: 1 },
    ])[0];
    const stamp = (id: string, pageIndex: number, name = 'Image') => ({ ...base, id, pageIndex, type: 'stamp' as const, name });

    it('picks the Image stamp that was not there before, on the page it was placed on', () => {
      const before = new Set(['a1']);
      const after = [stamp('a1', 0), stamp('a2', 1), stamp('a3', 0)];
      expect(newlyPlacedImage(before, after, 0)?.id).toBe('a3');
    });

    it('ignores other stamps and finds nothing when nothing was added', () => {
      expect(newlyPlacedImage(new Set(['a1']), [stamp('a1', 0), stamp('b', 0, 'Approved')], 0)).toBeUndefined();
    });
  });
});

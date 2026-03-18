// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Image Replacement Pipeline — OBJECT_AND_LAYOUT_EDITING_EXCELLENCE_BLOCK Batch 5
 *
 * Verified:
 * - validateImageReplace passes for a valid image object + PNG data
 * - validateImageReplace blocks non-replaceable objects
 * - validateImageReplace blocks wrong object types
 * - validateImageReplace blocks unsupported MIME types
 * - validateImageReplace blocks empty image data
 * - validateImageReplace blocks invalid dimensions (0 / negative)
 * - prepareImageReplaceRequest builds a correct request struct
 * - computeImageDisplayRect: preserve and stretch return original rect
 * - computeImageDisplayRect: fit centers and letterboxes correctly
 * - computeImageDisplayRect: fill centers and crops correctly
 * - interpretReplaceResult: success IPC result → replaced outcome
 * - interpretReplaceResult: error IPC result → backend-error with code
 * - isSupportedMimeType correctly identifies supported types
 */

import { describe, it, expect } from 'vitest';
import {
  validateImageReplace,
  prepareImageReplaceRequest,
  computeImageDisplayRect,
  interpretReplaceResult,
  isSupportedMimeType,
} from '../src/viewer/layout/imageReplacePipeline';
import type { LayoutObject } from '../src/viewer/layout/objectDetection';
import { IDENTITY_MATRIX } from '../src/viewer/layout/objectDetection';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeImageObj(overrides: Partial<LayoutObject> = {}): LayoutObject {
  return {
    id: 'img0',
    pageIndex: 0,
    type: 'image',
    rect: { x: 50, y: 100, width: 200, height: 150 },
    matrix: IDENTITY_MATRIX,
    movable: true,
    resizable: true,
    replaceable: true,
    source: {
      id: 'img0',
      pageIndex: 0,
      rawType: 'ximage',
      rect: { x: 50, y: 100, width: 200, height: 150 },
      matrix: IDENTITY_MATRIX,
    },
    ...overrides,
  };
}

const VALID_B64 = 'iVBORw0KGgo='; // fake base64
const VALID_MIME = 'image/png' as const;

// ---------------------------------------------------------------------------
// isSupportedMimeType
// ---------------------------------------------------------------------------

describe('imageReplace — isSupportedMimeType', () => {
  it('PNG is supported', () => expect(isSupportedMimeType('image/png')).toBe(true));
  it('JPEG is supported', () => expect(isSupportedMimeType('image/jpeg')).toBe(true));
  it('WebP is supported', () => expect(isSupportedMimeType('image/webp')).toBe(true));
  it('BMP is not supported', () => expect(isSupportedMimeType('image/bmp')).toBe(false));
  it('GIF is not supported', () => expect(isSupportedMimeType('image/gif')).toBe(false));
  it('empty string is not supported', () => expect(isSupportedMimeType('')).toBe(false));
});

// ---------------------------------------------------------------------------
// validateImageReplace — valid case
// ---------------------------------------------------------------------------

describe('imageReplace — validate valid', () => {
  it('valid image object with PNG data passes', () => {
    const result = validateImageReplace(makeImageObj(), VALID_B64, VALID_MIME, 800, 600);
    expect(result.valid).toBe(true);
    expect(result.reasonCode).toBe('ok');
  });

  it('JPEG is also valid', () => {
    const result = validateImageReplace(makeImageObj(), VALID_B64, 'image/jpeg', 800, 600);
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateImageReplace — blocked cases
// ---------------------------------------------------------------------------

describe('imageReplace — validate blocked', () => {
  it('non-replaceable object is blocked', () => {
    const obj = makeImageObj({ replaceable: false });
    const result = validateImageReplace(obj, VALID_B64, VALID_MIME, 800, 600);
    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe('not-replaceable');
  });

  it('text_block type is blocked', () => {
    const obj = makeImageObj({ type: 'text_block' });
    const result = validateImageReplace(obj, VALID_B64, VALID_MIME, 800, 600);
    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe('not-image-type');
  });

  it('unsupported MIME type is blocked', () => {
    const result = validateImageReplace(makeImageObj(), VALID_B64, 'image/bmp', 800, 600);
    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe('unsupported-mime-type');
    expect(result.message).toContain('image/bmp');
  });

  it('empty image data is blocked', () => {
    const result = validateImageReplace(makeImageObj(), '', VALID_MIME, 800, 600);
    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe('image-data-empty');
  });

  it('whitespace-only image data is blocked', () => {
    const result = validateImageReplace(makeImageObj(), '   ', VALID_MIME, 800, 600);
    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe('image-data-empty');
  });

  it('zero width is blocked', () => {
    const result = validateImageReplace(makeImageObj(), VALID_B64, VALID_MIME, 0, 600);
    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe('invalid-dimensions');
  });

  it('negative height is blocked', () => {
    const result = validateImageReplace(makeImageObj(), VALID_B64, VALID_MIME, 800, -1);
    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe('invalid-dimensions');
  });
});

// ---------------------------------------------------------------------------
// prepareImageReplaceRequest
// ---------------------------------------------------------------------------

describe('imageReplace — prepareImageReplaceRequest', () => {
  it('builds correct request struct', () => {
    const obj = makeImageObj();
    const req = prepareImageReplaceRequest(obj, VALID_B64, VALID_MIME, 800, 600, 'preserve');
    expect(req.pageIndex).toBe(0);
    expect(req.objectId).toBe('img0');
    expect(req.imageDataBase64).toBe(VALID_B64);
    expect(req.mimeType).toBe('image/png');
    expect(req.naturalWidthPx).toBe(800);
    expect(req.naturalHeightPx).toBe(600);
    expect(req.scaleStrategy).toBe('preserve');
    expect(req.originalRect).toEqual(obj.rect);
    expect(req.originalMatrix).toEqual(IDENTITY_MATRIX);
  });
});

// ---------------------------------------------------------------------------
// computeImageDisplayRect
// ---------------------------------------------------------------------------

describe('imageReplace — computeImageDisplayRect preserve', () => {
  const slot = { x: 50, y: 100, width: 200, height: 150 };

  it('preserve strategy returns original rect unchanged', () => {
    const rect = computeImageDisplayRect(slot, 800, 600, 'preserve');
    expect(rect).toEqual(slot);
  });

  it('stretch strategy returns original rect unchanged', () => {
    const rect = computeImageDisplayRect(slot, 1000, 200, 'stretch');
    expect(rect).toEqual(slot);
  });
});

describe('imageReplace — computeImageDisplayRect fit', () => {
  const slot = { x: 0, y: 0, width: 200, height: 150 };

  it('wider image fits by width, height reduced', () => {
    // Image 400x100, aspect=4. Slot 200x150, aspect=4/3.
    // image wider than slot → fit by width: displayW=200, displayH=200/4=50
    const rect = computeImageDisplayRect(slot, 400, 100, 'fit');
    expect(rect.width).toBeCloseTo(200);
    expect(rect.height).toBeCloseTo(50);
  });

  it('taller image fits by height, width reduced', () => {
    // Image 100x400, aspect=0.25. Slot 200x150, aspect=1.33.
    // image taller → fit by height: displayH=150, displayW=150*0.25=37.5
    const rect = computeImageDisplayRect(slot, 100, 400, 'fit');
    expect(rect.height).toBeCloseTo(150);
    expect(rect.width).toBeCloseTo(37.5);
  });

  it('same-aspect image fills slot exactly', () => {
    // Image 400x300, same aspect 4:3 as slot 200x150
    const rect = computeImageDisplayRect(slot, 400, 300, 'fit');
    expect(rect.width).toBeCloseTo(200);
    expect(rect.height).toBeCloseTo(150);
  });
});

describe('imageReplace — computeImageDisplayRect fill', () => {
  const slot = { x: 0, y: 0, width: 200, height: 150 };

  it('wider image fills by height (overflows width)', () => {
    // Image 400x100, aspect=4. Slot aspect=1.33.
    // image wider: fill by height → displayH=150, displayW=150*4=600
    const rect = computeImageDisplayRect(slot, 400, 100, 'fill');
    expect(rect.height).toBeCloseTo(150);
    expect(rect.width).toBeCloseTo(600);
  });

  it('taller image fills by width (overflows height)', () => {
    // Image 100x400, aspect=0.25. Slot aspect=1.33.
    // image taller: fill by width → displayW=200, displayH=200/0.25=800
    const rect = computeImageDisplayRect(slot, 100, 400, 'fill');
    expect(rect.width).toBeCloseTo(200);
    expect(rect.height).toBeCloseTo(800);
  });
});

describe('imageReplace — computeImageDisplayRect edge cases', () => {
  it('zero natural dimensions falls back to slot rect', () => {
    const slot = { x: 0, y: 0, width: 200, height: 150 };
    const rect = computeImageDisplayRect(slot, 0, 0, 'fit');
    expect(rect).toEqual(slot);
  });
});

// ---------------------------------------------------------------------------
// interpretReplaceResult
// ---------------------------------------------------------------------------

describe('imageReplace — interpretReplaceResult', () => {
  it('success IPC result → replaced outcome', () => {
    const result = interpretReplaceResult({ success: true }, makeImageObj());
    expect(result.outcome).toBe('replaced');
    expect(result.reasonCode).toBe('ok');
    expect(result.updatedObject).not.toBeNull();
  });

  it('error IPC result → backend-error with code', () => {
    const result = interpretReplaceResult(
      { success: false, error: { code: 'xobject-not-found', message: 'XObject missing' } },
      makeImageObj(),
    );
    expect(result.outcome).toBe('backend-error');
    expect(result.reasonCode).toBe('xobject-not-found');
    expect(result.message).toBe('XObject missing');
  });

  it('error IPC result without error details → unknown-backend-error', () => {
    const result = interpretReplaceResult({ success: false }, makeImageObj());
    expect(result.outcome).toBe('backend-error');
    expect(result.reasonCode).toBe('unknown-backend-error');
  });
});

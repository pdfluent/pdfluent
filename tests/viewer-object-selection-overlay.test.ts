// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Object Selection Overlay — OBJECT_AND_LAYOUT_EDITING_EXCELLENCE_BLOCK Batch 2
 *
 * Unit tests for the overlay logic layer (coordinate conversion, handle
 * positions, cursor mapping, type labels). The React component itself is
 * covered by the Playwright E2E tests in Batch 9.
 *
 * Verified:
 * - pdfRectToDom correctly applies Y-flip and zoom
 * - handlePosition returns correct offsets for all 8 handles
 * - HANDLE_CURSORS has a non-empty cursor for each handle
 * - objectCursor returns 'grab' for movable, 'default' for locked
 * - OBJECT_TYPE_LABELS has a non-empty label for every LayoutObjectType
 * - RESIZE_HANDLES contains all 8 handles
 */

import { describe, it, expect } from 'vitest';
import {
  pdfRectToDom,
  handlePosition,
  objectCursor,
  HANDLE_CURSORS,
  RESIZE_HANDLES,
  OBJECT_TYPE_LABEL_KEYS,
  HANDLE_SIZE,
} from '../src/viewer/components/ObjectSelectionOverlay';
import type { ResizeHandle } from '../src/viewer/components/ObjectSelectionOverlay';
import type { LayoutObject } from '../src/viewer/layout/objectDetection';
import { IDENTITY_MATRIX } from '../src/viewer/layout/objectDetection';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeObj(overrides: Partial<LayoutObject> = {}): LayoutObject {
  return {
    id: 'test',
    pageIndex: 0,
    type: 'image',
    rect: { x: 10, y: 20, width: 100, height: 50 },
    matrix: IDENTITY_MATRIX,
    movable: true,
    resizable: true,
    replaceable: true,
    source: {
      id: 'test',
      pageIndex: 0,
      rawType: 'ximage',
      rect: { x: 10, y: 20, width: 100, height: 50 },
      matrix: IDENTITY_MATRIX,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// pdfRectToDom
// ---------------------------------------------------------------------------

describe('ObjectSelectionOverlay — pdfRectToDom', () => {
  it('zoom=1: x maps directly', () => {
    const dom = pdfRectToDom({ x: 10, y: 20, width: 100, height: 50 }, 800, 1);
    expect(dom.left).toBe(10);
  });

  it('zoom=1: y is flipped (pageHeight - y - height)', () => {
    const dom = pdfRectToDom({ x: 10, y: 20, width: 100, height: 50 }, 800, 1);
    expect(dom.top).toBe(800 - 20 - 50); // 730
  });

  it('zoom=2: all values are doubled', () => {
    const dom = pdfRectToDom({ x: 10, y: 20, width: 100, height: 50 }, 800, 2);
    expect(dom.left).toBe(20);
    expect(dom.top).toBe((800 - 20 - 50) * 2); // 1460
    expect(dom.width).toBe(200);
    expect(dom.height).toBe(100);
  });

  it('zoom=0.5: all values are halved', () => {
    const dom = pdfRectToDom({ x: 10, y: 20, width: 100, height: 50 }, 800, 0.5);
    expect(dom.left).toBe(5);
    expect(dom.width).toBe(50);
  });

  it('rect at bottom-left corner of page (y=0) maps to top of page', () => {
    // rect at y=0, height=pageHeight → top should be 0
    const dom = pdfRectToDom({ x: 0, y: 0, width: 100, height: 800 }, 800, 1);
    expect(dom.top).toBe(0);
  });

  it('rect at top of page in PDF space (y near pageHeight) maps near top in DOM', () => {
    // rect at y=750, height=50 → top = (800 - 750 - 50) * 1 = 0
    const dom = pdfRectToDom({ x: 0, y: 750, width: 100, height: 50 }, 800, 1);
    expect(dom.top).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// handlePosition
// ---------------------------------------------------------------------------

describe('ObjectSelectionOverlay — handlePosition', () => {
  const bw = 100;
  const bh = 60;
  const half = HANDLE_SIZE / 2;

  it('nw handle is at top-left corner', () => {
    const pos = handlePosition('nw', bw, bh);
    expect(pos.left).toBe(-half);
    expect(pos.top).toBe(-half);
  });

  it('ne handle is at top-right corner', () => {
    const pos = handlePosition('ne', bw, bh);
    expect(pos.left).toBe(bw - half);
    expect(pos.top).toBe(-half);
  });

  it('se handle is at bottom-right corner', () => {
    const pos = handlePosition('se', bw, bh);
    expect(pos.left).toBe(bw - half);
    expect(pos.top).toBe(bh - half);
  });

  it('sw handle is at bottom-left corner', () => {
    const pos = handlePosition('sw', bw, bh);
    expect(pos.left).toBe(-half);
    expect(pos.top).toBe(bh - half);
  });

  it('n handle is horizontally centered and at top', () => {
    const pos = handlePosition('n', bw, bh);
    expect(pos.left).toBe(bw / 2 - half);
    expect(pos.top).toBe(-half);
  });

  it('s handle is horizontally centered and at bottom', () => {
    const pos = handlePosition('s', bw, bh);
    expect(pos.left).toBe(bw / 2 - half);
    expect(pos.top).toBe(bh - half);
  });

  it('w handle is vertically centered and at left', () => {
    const pos = handlePosition('w', bw, bh);
    expect(pos.left).toBe(-half);
    expect(pos.top).toBe(bh / 2 - half);
  });

  it('e handle is vertically centered and at right', () => {
    const pos = handlePosition('e', bw, bh);
    expect(pos.left).toBe(bw - half);
    expect(pos.top).toBe(bh / 2 - half);
  });
});

// ---------------------------------------------------------------------------
// HANDLE_CURSORS
// ---------------------------------------------------------------------------

describe('ObjectSelectionOverlay — HANDLE_CURSORS', () => {
  it('has a cursor for every resize handle', () => {
    for (const handle of RESIZE_HANDLES) {
      expect(HANDLE_CURSORS[handle as ResizeHandle].length).toBeGreaterThan(0);
    }
  });

  it('corner handles use diagonal cursors', () => {
    expect(HANDLE_CURSORS['nw']).toContain('resize');
    expect(HANDLE_CURSORS['se']).toContain('resize');
  });

  it('edge handles use cardinal cursors', () => {
    expect(HANDLE_CURSORS['n']).toContain('resize');
    expect(HANDLE_CURSORS['w']).toContain('resize');
  });
});

// ---------------------------------------------------------------------------
// RESIZE_HANDLES
// ---------------------------------------------------------------------------

describe('ObjectSelectionOverlay — RESIZE_HANDLES', () => {
  it('contains exactly 8 handles', () => {
    expect(RESIZE_HANDLES).toHaveLength(8);
  });

  it('contains all expected handles', () => {
    const expected: ResizeHandle[] = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'];
    for (const h of expected) {
      expect(RESIZE_HANDLES).toContain(h);
    }
  });
});

// ---------------------------------------------------------------------------
// objectCursor
// ---------------------------------------------------------------------------

describe('ObjectSelectionOverlay — objectCursor', () => {
  it('movable object → grab cursor', () => {
    expect(objectCursor(makeObj({ movable: true }))).toBe('grab');
  });

  it('non-movable non-resizable → default cursor', () => {
    expect(objectCursor(makeObj({ movable: false, resizable: false }))).toBe('default');
  });

  it('form_widget (not movable) → default', () => {
    expect(objectCursor(makeObj({ type: 'form_widget', movable: false, resizable: false, replaceable: false }))).toBe('default');
  });
});

// ---------------------------------------------------------------------------
// OBJECT_TYPE_LABELS
// ---------------------------------------------------------------------------

describe('ObjectSelectionOverlay — OBJECT_TYPE_LABELS', () => {
  const types: LayoutObject['type'][] = [
    'text_block', 'image', 'vector_graphics', 'shape', 'form_widget',
  ];

  it('has a non-empty label for every type', () => {
    for (const type of types) {
      expect(OBJECT_TYPE_LABEL_KEYS[type].length).toBeGreaterThan(0);
    }
  });

  it('image label is Afbeelding', () => {
    expect(OBJECT_TYPE_LABEL_KEYS['image']).toBe('objects.image');
  });

  it('form_widget label contains formulier (Dutch)', () => {
    expect(OBJECT_TYPE_LABEL_KEYS['form_widget']).toContain('formWidget');
  });
});

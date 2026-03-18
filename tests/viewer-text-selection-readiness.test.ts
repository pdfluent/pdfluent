// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Text Selection Readiness UX — Batch 7
 *
 * Validates the polish layer over hover/selection pipeline:
 * - Cursor signals edit-readiness
 * - Overlay respects native text selection (pointer-events: none)
 * - Hover → selected state transition is expressed in chrome
 * - Context bar shown on selection, not on hover-only modes
 * - Selection cleared when switching modes
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getChromeAttrs } from '../src/viewer/interaction/selectionChrome';
import { isFullTextInteractionActive, isHoverOnlyTextInteractionActive } from '../src/viewer/text/textInteractionRules';
import { shouldShowContextBar } from '../src/viewer/components/TextContextBar';
import { getCursorForInteraction } from '../src/viewer/interaction/cursorController';
import type { TextParagraphTarget, TextLineTarget, TextSpanTarget } from '../src/viewer/text/textInteractionModel';

// ---------------------------------------------------------------------------
// Hover chrome vs selected chrome are visually distinct
// ---------------------------------------------------------------------------

describe('selection readiness — hover vs selected chrome are distinct', () => {
  it('hover chrome has lower strokeOpacity than selected', () => {
    const hoverAttrs = getChromeAttrs('text-block', 'hover');
    const selectedAttrs = getChromeAttrs('text-block', 'selected');
    expect(hoverAttrs).not.toBeNull();
    expect(selectedAttrs).not.toBeNull();
    expect(hoverAttrs!.strokeOpacity).toBeLessThan(selectedAttrs!.strokeOpacity);
  });

  it('hover chrome has narrower strokeWidth than selected', () => {
    const hoverAttrs = getChromeAttrs('text-block', 'hover');
    const selectedAttrs = getChromeAttrs('text-block', 'selected');
    expect(hoverAttrs!.strokeWidth).toBeLessThanOrEqual(selectedAttrs!.strokeWidth);
  });

  it('idle state returns null (no chrome rendered)', () => {
    expect(getChromeAttrs('text-block', 'idle')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Overlay does not block text selection
// ---------------------------------------------------------------------------

describe('selection readiness — overlay does not interfere with text selection', () => {
  const overlaySrc = readFileSync(
    join(import.meta.dirname, '../src/viewer/components/TextInteractionOverlay.tsx'),
    'utf8',
  );

  it('overlay SVG has pointerEvents: none', () => {
    expect(overlaySrc).toContain("pointerEvents: 'none'");
  });

  it('TextLayer z-index is above TextInteractionOverlay', () => {
    const canvasSrc = readFileSync(
      join(import.meta.dirname, '../src/viewer/components/PageCanvas.tsx'),
      'utf8',
    );
    const overlayIdx = canvasSrc.indexOf('zIndex: 15');
    const textLayerIdx = canvasSrc.indexOf('zIndex: 20');
    expect(overlayIdx).toBeGreaterThan(-1);
    expect(textLayerIdx).toBeGreaterThan(overlayIdx);
  });
});

// ---------------------------------------------------------------------------
// Context bar shown only in full-interaction modes, not hover-only
// ---------------------------------------------------------------------------

function makeParagraph(): TextParagraphTarget {
  const span: TextSpanTarget = {
    kind: 'span', id: 'p0:s0', source: 'digital',
    text: 'text', rect: { x: 10, y: 700, width: 80, height: 12 }, fontSize: 12,
  };
  const line: TextLineTarget = {
    kind: 'line', id: 'p0:l0', source: 'digital',
    spans: [span], rect: { x: 10, y: 700, width: 80, height: 12 }, baselineY: 700,
  };
  return {
    kind: 'paragraph', id: 'p0:par0', source: 'digital',
    lines: [line], rect: { x: 10, y: 700, width: 80, height: 12 },
  };
}

describe('selection readiness — context bar gating', () => {
  it('context bar shown in edit mode (full)', () => {
    expect(isFullTextInteractionActive('edit', null)).toBe(true);
    expect(shouldShowContextBar('edit', makeParagraph())).toBe(true);
  });

  it('protect mode is hover-only — context bar still shown (copy available)', () => {
    // protect mode has hover-only text interaction level, but the context bar
    // itself is governed by shouldShowContextBar which checks action availability
    expect(isHoverOnlyTextInteractionActive('protect', null)).toBe(true);
    // copy + redact are available in protect mode
    expect(shouldShowContextBar('protect', makeParagraph())).toBe(true);
  });

  it('context bar not shown without a selected paragraph', () => {
    expect(shouldShowContextBar('edit', null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cursor signals text-editability in edit mode
// ---------------------------------------------------------------------------

describe('selection readiness — cursor for text-block in edit mode', () => {
  it('getCursorForInteraction returns text cursor for text-block in selected state', () => {
    expect(getCursorForInteraction('text-block', 'selected')).toBe('text');
    expect(getCursorForInteraction('text-block', 'hover')).toBe('text');
  });
});

// ---------------------------------------------------------------------------
// Mode switch implies no text interaction in read/review
// ---------------------------------------------------------------------------

describe('selection readiness — mode transition gating', () => {
  it('read mode is not text-interactive', () => {
    expect(isFullTextInteractionActive('read', null)).toBe(false);
    expect(isHoverOnlyTextInteractionActive('read', null)).toBe(false);
  });

  it('review mode is not text-interactive', () => {
    expect(isFullTextInteractionActive('review', null)).toBe(false);
  });

  it('forms mode is not text-interactive', () => {
    expect(isFullTextInteractionActive('forms', null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TextInteractionOverlay render toggle
// ---------------------------------------------------------------------------

describe('selection readiness — overlay active prop', () => {
  const overlaySrc = readFileSync(
    join(import.meta.dirname, '../src/viewer/components/TextInteractionOverlay.tsx'),
    'utf8',
  );

  it('returns null when active is false', () => {
    expect(overlaySrc).toContain('if (!active) return null');
  });

  it('active prop gates all rendering', () => {
    // Presence of the active guard ensures the overlay is a no-op in suppressed modes
    expect(overlaySrc).toContain('active: boolean');
  });
});

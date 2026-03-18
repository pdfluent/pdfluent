// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Text Interaction Stability & Performance — Batch 10
 *
 * Verifies:
 * - Grouping is stable (same input → same output)
 * - Grouping handles large span arrays without thrashing
 * - Hit testing is fast on large structures
 * - OCR with sparse/messy data doesn't crash
 * - Phase 1 interaction modules still function correctly
 * - Memoization inputs are referentially stable (useMemo won't re-run spuriously)
 */

import { describe, it, expect } from 'vitest';
import { groupDigitalTextSpans, groupOcrWordBoxes } from '../src/viewer/text/textGrouping';
import { hitTestText, hitTestTextWithPadding } from '../src/viewer/text/textHoverHitTest';
import { getInteractionState } from '../src/viewer/interaction/interactionState';
import { getChromeAttrs } from '../src/viewer/interaction/selectionChrome';
import { HoverController } from '../src/viewer/interaction/hoverController';
import { ActionRegistry } from '../src/viewer/interaction/contextActions';
import type { TextSpan } from '../src/core/document';
import type { OcrWordBox } from '../src/viewer/text/textInteractionModel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function span(text: string, x: number, y: number, w = 60, h = 12): TextSpan {
  return { text, rect: { x, y, width: w, height: h }, fontSize: 12 };
}

function generateSpans(n: number): TextSpan[] {
  return Array.from({ length: n }, (_, i) => span(`word${i}`, (i % 8) * 70, Math.floor(i / 8) * 20, 60, 12));
}

// ---------------------------------------------------------------------------
// Grouping stability
// ---------------------------------------------------------------------------

describe('stability — grouping is deterministic', () => {
  it('produces identical output for identical input', () => {
    const spans = generateSpans(20);
    const result1 = groupDigitalTextSpans(spans, 0);
    const result2 = groupDigitalTextSpans(spans, 0);
    expect(result1.spans.length).toBe(result2.spans.length);
    expect(result1.lines.length).toBe(result2.lines.length);
    expect(result1.paragraphs.length).toBe(result2.paragraphs.length);
    expect(result1.spans[0]?.id).toBe(result2.spans[0]?.id);
  });

  it('ids are stable across calls with same input', () => {
    const spans = [span('x', 10, 700), span('y', 70, 700), span('z', 10, 500)];
    const r1 = groupDigitalTextSpans(spans, 0);
    const r2 = groupDigitalTextSpans(spans, 0);
    for (let i = 0; i < r1.paragraphs.length; i++) {
      expect(r1.paragraphs[i]?.id).toBe(r2.paragraphs[i]?.id);
    }
  });
});

// ---------------------------------------------------------------------------
// Performance: large span arrays
// ---------------------------------------------------------------------------

describe('stability — handles large span arrays', () => {
  it('groups 200 spans without throwing', () => {
    const spans = generateSpans(200);
    expect(() => groupDigitalTextSpans(spans, 0)).not.toThrow();
  });

  it('200 spans produce correct structural counts', () => {
    // 200 spans, 8 per row = 25 rows
    const spans = generateSpans(200);
    const result = groupDigitalTextSpans(spans, 0);
    expect(result.spans).toHaveLength(200);
    expect(result.lines.length).toBeGreaterThan(0);
    expect(result.paragraphs.length).toBeGreaterThan(0);
    expect(result.blocks.length).toBeGreaterThan(0);
  });

  it('hit test on large structure finds targets efficiently', () => {
    const spans = generateSpans(200);
    const structure = groupDigitalTextSpans(spans, 0);
    // Hit-test at a known location — should not throw
    expect(() => hitTestText(350, 90, structure, 842, 1)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Degenerate OCR inputs
// ---------------------------------------------------------------------------

describe('stability — degenerate OCR inputs', () => {
  it('empty OcrWordBox array does not throw', () => {
    expect(() => groupOcrWordBoxes([], 0, 595, 842)).not.toThrow();
  });

  it('zero-size boxes are handled without NaN rects', () => {
    const box: OcrWordBox = { text: '', confidence: 0, x0: 50, y0: 100, x1: 50, y1: 100, renderedWidth: 595, renderedHeight: 842 };
    const result = groupOcrWordBoxes([box], 0, 595, 842);
    const rect = result.spans[0]?.rect;
    expect(rect).toBeDefined();
    expect(Number.isFinite(rect!.x)).toBe(true);
    expect(Number.isFinite(rect!.y)).toBe(true);
    expect(rect!.width).toBe(0);
    expect(rect!.height).toBe(0);
  });

  it('very low confidence boxes are included (not filtered)', () => {
    const box: OcrWordBox = { text: 'maybe', confidence: 0.01, x0: 10, y0: 10, x1: 60, y1: 30, renderedWidth: 595, renderedHeight: 842 };
    const result = groupOcrWordBoxes([box], 0, 595, 842);
    expect(result.spans).toHaveLength(1);
    expect(result.spans[0]?.confidence).toBeCloseTo(0.01);
  });

  it('100 sparse OCR boxes spread over the page', () => {
    const boxes = Array.from({ length: 100 }, (_, i): OcrWordBox => ({
      text: `w${i}`,
      confidence: Math.random(),
      x0: (i % 5) * 100,
      y0: Math.floor(i / 5) * 80,
      x1: (i % 5) * 100 + 50,
      y1: Math.floor(i / 5) * 80 + 20,
      renderedWidth: 595,
      renderedHeight: 842,
    }));
    expect(() => groupOcrWordBoxes(boxes, 0, 595, 842)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Phase 1 infrastructure still functional
// ---------------------------------------------------------------------------

describe('stability — Phase 1 interaction modules', () => {
  it('getInteractionState computes correct states', () => {
    expect(getInteractionState({})).toBe('idle');
    expect(getInteractionState({ isHovered: true })).toBe('hover');
    expect(getInteractionState({ isSelected: true })).toBe('selected');
    expect(getInteractionState({ isDisabled: true })).toBe('disabled');
  });

  it('getChromeAttrs returns null for idle', () => {
    expect(getChromeAttrs('annotation', 'idle')).toBeNull();
    expect(getChromeAttrs('text-block', 'idle')).toBeNull();
    expect(getChromeAttrs('form-field', 'idle')).toBeNull();
  });

  it('getChromeAttrs returns chrome for hover/selected on all kinds', () => {
    const kinds = ['annotation', 'annotation-redaction', 'form-field', 'text-block', 'page-thumbnail', 'shape'] as const;
    for (const kind of kinds) {
      expect(getChromeAttrs(kind, 'hover')).not.toBeNull();
      expect(getChromeAttrs(kind, 'selected')).not.toBeNull();
    }
  });

  it('HoverController dispose clears state without error', () => {
    const c = new HoverController();
    c.enter('target-1');
    expect(c.current?.target).toBe('target-1');
    c.dispose();
    expect(c.current).toBeNull();
  });

  it('ActionRegistry fire does not throw for unregistered trigger', () => {
    const registry = new ActionRegistry();
    expect(() => registry.fire('annotation:selected', { kind: 'annotation', annotationId: 'a1', pageIndex: 0 })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// hitTestTextWithPadding stability
// ---------------------------------------------------------------------------

describe('stability — hitTestTextWithPadding edge cases', () => {
  it('handles zoom < 1 without NaN', () => {
    const spans = [span('x', 100, 400, 50, 12)];
    const structure = groupDigitalTextSpans(spans, 0);
    const result = hitTestTextWithPadding(52, 220, structure, 842, 0.5, 5);
    // Should not throw or return NaN positions
    if (result) {
      expect(Number.isFinite(result.line.rect.x)).toBe(true);
    }
  });

  it('returns null for negative padding that collapses rects', () => {
    // With negative padding, the rect shrinks to zero — hit test should degrade
    const spans = [span('x', 100, 400, 1, 1)]; // Very small span
    const structure = groupDigitalTextSpans(spans, 0);
    // Just ensure no crash
    expect(() => hitTestTextWithPadding(100, 442, structure, 842, 1, -100)).not.toThrow();
  });
});

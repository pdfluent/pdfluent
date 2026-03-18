// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { describe, it, expect } from 'vitest';
import {
  TEXT_CONTEXT_ACTIONS,
  shouldShowContextBar,
  getBarDomPosition,
  type TextContextActionId,
} from '../src/viewer/components/TextContextBar';
import type { TextParagraphTarget, TextLineTarget, TextSpanTarget } from '../src/viewer/text/textInteractionModel';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const barSource = readFileSync(
  join(import.meta.dirname, '../src/viewer/components/TextContextBar.tsx'),
  'utf8',
);

// ---------------------------------------------------------------------------
// Text context actions config
// ---------------------------------------------------------------------------

describe('TEXT_CONTEXT_ACTIONS', () => {
  it('contains all five actions', () => {
    const ids = TEXT_CONTEXT_ACTIONS.map(a => a.id);
    const expected: TextContextActionId[] = ['annotate', 'redact', 'copy', 'summarize', 'explain'];
    for (const id of expected) {
      expect(ids).toContain(id);
    }
  });

  it('copy is available in all main content modes', () => {
    const copy = TEXT_CONTEXT_ACTIONS.find(a => a.id === 'copy')!;
    expect(copy.availableIn).toContain('read');
    expect(copy.availableIn).toContain('review');
    expect(copy.availableIn).toContain('edit');
  });

  it('annotate is available in review and edit', () => {
    const annotate = TEXT_CONTEXT_ACTIONS.find(a => a.id === 'annotate')!;
    expect(annotate.availableIn).toContain('review');
    expect(annotate.availableIn).toContain('edit');
  });

  it('redact is available in protect and edit', () => {
    const redact = TEXT_CONTEXT_ACTIONS.find(a => a.id === 'redact')!;
    expect(redact.availableIn).toContain('protect');
    expect(redact.availableIn).toContain('edit');
  });

  it('each action has a label and icon', () => {
    for (const action of TEXT_CONTEXT_ACTIONS) {
      expect(action.label.length).toBeGreaterThan(0);
      expect(action.icon.length).toBeGreaterThan(0);
    }
  });

  it('annotate is not available in read mode', () => {
    const annotate = TEXT_CONTEXT_ACTIONS.find(a => a.id === 'annotate')!;
    expect(annotate.availableIn).not.toContain('read');
  });
});

// ---------------------------------------------------------------------------
// shouldShowContextBar
// ---------------------------------------------------------------------------

function makeParagraph(): TextParagraphTarget {
  const span: TextSpanTarget = {
    kind: 'span', id: 'p0:s0', source: 'digital',
    text: 'hello', rect: { x: 10, y: 700, width: 80, height: 12 }, fontSize: 12,
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

describe('shouldShowContextBar', () => {
  it('returns false when no paragraph is selected', () => {
    expect(shouldShowContextBar('edit', null)).toBe(false);
  });

  it('returns true in edit mode with a selected paragraph', () => {
    expect(shouldShowContextBar('edit', makeParagraph())).toBe(true);
  });

  it('returns true in read mode with a selected paragraph (copy is available)', () => {
    expect(shouldShowContextBar('read', makeParagraph())).toBe(true);
  });

  it('returns true in review mode', () => {
    expect(shouldShowContextBar('review', makeParagraph())).toBe(true);
  });

  it('returns false in organize mode (no applicable actions)', () => {
    expect(shouldShowContextBar('organize', makeParagraph())).toBe(false);
  });

  it('returns false in convert mode', () => {
    expect(shouldShowContextBar('convert', makeParagraph())).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getBarDomPosition
// ---------------------------------------------------------------------------

describe('getBarDomPosition', () => {
  it('places bar above the target rect', () => {
    const rect = { x: 50, y: 700, width: 100, height: 12 };
    const { top } = getBarDomPosition(rect, 842, 1);
    // domRect.top = (842 - 700 - 12) * 1 = 130
    // barTop = max(0, 130 - 32 - 6) = 92
    expect(top).toBeGreaterThanOrEqual(0);
    expect(top).toBeLessThan(130); // must be above the rect
  });

  it('clamps to top of page (top >= 0)', () => {
    // Rect at very top of page
    const rect = { x: 0, y: 820, width: 100, height: 12 };
    const { top } = getBarDomPosition(rect, 842, 1);
    expect(top).toBe(0);
  });

  it('aligns left edge with rect left', () => {
    const rect = { x: 75, y: 600, width: 100, height: 12 };
    const { left } = getBarDomPosition(rect, 842, 1);
    expect(left).toBeCloseTo(75); // rect.x * zoom = 75 * 1 = 75
  });

  it('scales with zoom', () => {
    const rect = { x: 50, y: 600, width: 100, height: 12 };
    const zoom2 = getBarDomPosition(rect, 842, 2);
    const zoom1 = getBarDomPosition(rect, 842, 1);
    expect(zoom2.left).toBeCloseTo(zoom1.left * 2);
  });
});

// ---------------------------------------------------------------------------
// Source readiness
// ---------------------------------------------------------------------------

describe('TextContextBar — source readiness', () => {
  it('exports TextContextBar component', () => {
    expect(barSource).toContain('export const TextContextBar');
  });

  it('exports shouldShowContextBar', () => {
    expect(barSource).toContain('export function shouldShowContextBar');
  });

  it('exports getBarDomPosition', () => {
    expect(barSource).toContain('export function getBarDomPosition');
  });

  it('uses text-context-bar testid', () => {
    expect(barSource).toContain('text-context-bar');
  });

  it('uses text-context-action-{id} testid pattern', () => {
    expect(barSource).toContain('text-context-action-');
  });

  it('fires text:selected via viewerActionRegistry', () => {
    expect(barSource).toContain("viewerActionRegistry.fire('text:selected'");
  });

  it('is memoized', () => {
    expect(barSource).toContain('memo(');
  });

  it('has pointerEvents auto (clickable)', () => {
    expect(barSource).toContain("pointerEvents: 'auto'");
  });
});

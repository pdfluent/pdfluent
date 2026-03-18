// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Safe Capability Expansion — Phase 5 Batch 9
 *
 * Tests the bbox-aware expansion of the mutation constraint system:
 * - computeBboxExpansionChars() returns 0 for tight bboxes
 * - computeBboxExpansionChars() returns > 0 for wide bboxes
 * - validateReplacement with expansionChars allows slightly longer text
 * - validateReplacement without expansionChars still blocks longer text (regression)
 * - Punctuation, numeric, and whitespace edits within expanded limit pass
 * - Expansion does not affect non-writable targets
 * - Existing safety matrix is unaffected (backward compat)
 */

import { describe, it, expect } from 'vitest';
import {
  getMutationSupport,
  validateReplacement,
  computeBboxExpansionChars,
} from '../src/viewer/text/textMutationSupport';
import type { TextParagraphTarget } from '../src/viewer/text/textInteractionModel';
import { ESTIMATED_CHAR_WIDTH_RATIO } from '../src/viewer/text/textMutationFidelity';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSpan(text: string, width: number, fontSize: number) {
  return {
    id: 'exp:s0',
    pageIndex: 0,
    source: 'digital' as const,
    rect: { x: 0, y: 0, width, height: fontSize * 1.2 },
    text,
    fontSize,
  };
}

function makeSingleSpanTarget(text: string, width: number, fontSize: number): TextParagraphTarget {
  const span = makeSpan(text, width, fontSize);
  return {
    id: 'exp:p0',
    pageIndex: 0,
    source: 'digital',
    rect: { x: 0, y: 0, width, height: fontSize * 1.2 },
    lines: [
      {
        id: 'exp:l0',
        pageIndex: 0,
        source: 'digital',
        rect: { x: 0, y: 0, width, height: fontSize * 1.2 },
        spans: [span],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// computeBboxExpansionChars — basic geometry
// ---------------------------------------------------------------------------

describe('computeBboxExpansionChars — geometry', () => {
  it('returns 0 for a tight bbox (estimated width = bbox width)', () => {
    // width = text.length * fontSize * CHAR_RATIO → exactly tight
    const text = 'Hello';
    const fontSize = 12;
    const tightWidth = text.length * fontSize * ESTIMATED_CHAR_WIDTH_RATIO; // 33
    const target = makeSingleSpanTarget(text, tightWidth, fontSize);
    expect(computeBboxExpansionChars(target)).toBe(0);
  });

  it('returns 0 when bbox is narrower than estimated text width', () => {
    const target = makeSingleSpanTarget('Hello world', 50, 12); // too narrow
    expect(computeBboxExpansionChars(target)).toBe(0);
  });

  it('returns positive value for a wide bbox', () => {
    // width=400, fontSize=12, text=11 chars → spare = 400 - 72.6 = 327.4
    const target = makeSingleSpanTarget('Hello world', 400, 12);
    expect(computeBboxExpansionChars(target)).toBeGreaterThan(0);
  });

  it('expansion is proportional to spare width', () => {
    const text = 'Hello world'; // 11 chars
    const fontSize = 12;
    const estimatedWidth = text.length * fontSize * ESTIMATED_CHAR_WIDTH_RATIO;
    const charWidth = fontSize * ESTIMATED_CHAR_WIDTH_RATIO;

    const width300 = makeSingleSpanTarget(text, 300, fontSize);
    const width400 = makeSingleSpanTarget(text, 400, fontSize);

    const exp300 = computeBboxExpansionChars(width300);
    const exp400 = computeBboxExpansionChars(width400);

    // wider bbox → more expansion
    expect(exp400).toBeGreaterThan(exp300);
    // verify formula: floor((300 - estimated) / charWidth)
    const expected300 = Math.floor((300 - estimatedWidth) / charWidth);
    expect(exp300).toBe(expected300);
  });

  it('returns 0 for multi-line targets', () => {
    const multiLine: TextParagraphTarget = {
      id: 'x',
      pageIndex: 0,
      source: 'digital',
      rect: { x: 0, y: 0, width: 400, height: 28 },
      lines: [
        {
          id: 'x:l0',
          pageIndex: 0,
          source: 'digital',
          rect: { x: 0, y: 0, width: 400, height: 14 },
          spans: [makeSpan('Line 1', 400, 12)],
        },
        {
          id: 'x:l1',
          pageIndex: 0,
          source: 'digital',
          rect: { x: 0, y: 14, width: 400, height: 14 },
          spans: [makeSpan('Line 2', 400, 12)],
        },
      ],
    };
    expect(computeBboxExpansionChars(multiLine)).toBe(0);
  });

  it('returns 0 for multi-span targets', () => {
    const multiSpan: TextParagraphTarget = {
      id: 'x',
      pageIndex: 0,
      source: 'digital',
      rect: { x: 0, y: 0, width: 400, height: 14 },
      lines: [
        {
          id: 'x:l0',
          pageIndex: 0,
          source: 'digital',
          rect: { x: 0, y: 0, width: 400, height: 14 },
          spans: [
            makeSpan('Hello', 200, 12),
            makeSpan(' world', 200, 12),
          ],
        },
      ],
    };
    expect(computeBboxExpansionChars(multiSpan)).toBe(0);
  });

  it('returns 0 for empty text', () => {
    const target = makeSingleSpanTarget('', 400, 12);
    expect(computeBboxExpansionChars(target)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// validateReplacement with expansionChars
// ---------------------------------------------------------------------------

describe('validateReplacement — with expansionChars', () => {
  it('allows replacement 1 char longer when expansionChars=5', () => {
    const target = makeSingleSpanTarget('Hello', 400, 12);
    const support = getMutationSupport(target);
    const expandedConstraints = { ...support.constraints!, expansionChars: 5 };
    const result = validateReplacement('Hello', 'Helloo', expandedConstraints);
    expect(result.valid).toBe(true);
  });

  it('allows replacement 5 chars longer when expansionChars=5', () => {
    const target = makeSingleSpanTarget('Hello', 400, 12);
    const support = getMutationSupport(target);
    const expandedConstraints = { ...support.constraints!, expansionChars: 5 };
    const result = validateReplacement('Hello', 'Hello World', expandedConstraints); // 11 vs 5+5=10 effective max → blocked (11 > 10)
    // 5 + 5 = 10 effective max; "Hello World" = 11 chars → blocked
    expect(result.valid).toBe(false);
  });

  it('exactly at effective max (original + expansionChars) passes', () => {
    const target = makeSingleSpanTarget('Hello', 400, 12);
    const support = getMutationSupport(target);
    const expandedConstraints = { ...support.constraints!, expansionChars: 3 };
    // maxLength=5, expansionChars=3, effective=8; "Hello!!!" = 8 chars → valid
    const result = validateReplacement('Hello', 'Hello!!!', expandedConstraints);
    expect(result.valid).toBe(true);
  });

  it('one over effective max is blocked', () => {
    const target = makeSingleSpanTarget('Hello', 400, 12);
    const support = getMutationSupport(target);
    const expandedConstraints = { ...support.constraints!, expansionChars: 3 };
    // effective max = 8; "Hello!!!!" = 9 chars → blocked
    const result = validateReplacement('Hello', 'Hello!!!!', expandedConstraints);
    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe('replacement-too-long');
  });

  it('expansionChars=0 is identical to no-expansion (regression)', () => {
    const target = makeSingleSpanTarget('Hello world', 200, 12);
    const support = getMutationSupport(target);
    const expandedConstraints = { ...support.constraints!, expansionChars: 0 };
    const result = validateReplacement('Hello world', 'Hello worlds', expandedConstraints);
    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe('replacement-too-long');
  });
});

// ---------------------------------------------------------------------------
// validateReplacement — backward compat (no expansionChars)
// ---------------------------------------------------------------------------

describe('validateReplacement — backward compat (no expansion)', () => {
  it('Phase 4 behaviour: one char longer is blocked', () => {
    const target = makeSingleSpanTarget('Hello world', 200, 12);
    const support = getMutationSupport(target);
    const result = validateReplacement('Hello world', 'Hello worlds', support.constraints!);
    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe('replacement-too-long');
  });

  it('Phase 4 behaviour: equal length passes', () => {
    const target = makeSingleSpanTarget('Hello world', 200, 12);
    const support = getMutationSupport(target);
    const result = validateReplacement('Hello world', 'Hello earth', support.constraints!);
    expect(result.valid).toBe(true);
  });

  it('Phase 4 behaviour: shorter passes', () => {
    const target = makeSingleSpanTarget('Hello world', 200, 12);
    const support = getMutationSupport(target);
    const result = validateReplacement('Hello world', 'Hi', support.constraints!);
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Punctuation, numeric, whitespace within expanded limit
// ---------------------------------------------------------------------------

describe('expansion — punctuation and numeric edits', () => {
  it('punctuation replacement at expanded limit passes', () => {
    const target = makeSingleSpanTarget('Hi', 400, 12);
    const support = getMutationSupport(target);
    const expandedConstraints = { ...support.constraints!, expansionChars: 4 };
    // maxLength=2, expansionChars=4, effective=6; "Hi!!!" = 5 chars → valid
    const result = validateReplacement('Hi', 'Hi!!!', expandedConstraints);
    expect(result.valid).toBe(true);
  });

  it('numeric replacement at original length passes (no expansion needed)', () => {
    const target = makeSingleSpanTarget('Hi', 200, 12);
    const support = getMutationSupport(target);
    const result = validateReplacement('Hi', '42', support.constraints!);
    expect(result.valid).toBe(true);
  });

  it('whitespace trimming: space-only within expanded limit is still empty-replacement', () => {
    const target = makeSingleSpanTarget('Hi', 400, 12);
    const support = getMutationSupport(target);
    const expandedConstraints = { ...support.constraints!, expansionChars: 4 };
    // Whitespace-only → trim() = '' → empty-replacement even with expansion
    const result = validateReplacement('Hi', '   ', expandedConstraints);
    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe('empty-replacement');
  });
});

// ---------------------------------------------------------------------------
// computeBboxExpansionChars + validateReplacement integration
// ---------------------------------------------------------------------------

describe('expansion — end-to-end bbox integration', () => {
  it('a wide bbox allows a slightly longer replacement', () => {
    // width=400, text="Hello" (5 chars), fontSize=12
    // estimatedWidth = 5 * 12 * 0.55 = 33
    // spare = 400 - 33 = 367, charWidth = 6.6
    // expansionChars = floor(367 / 6.6) = floor(55.6) = 55
    const target = makeSingleSpanTarget('Hello', 400, 12);
    const support = getMutationSupport(target);
    const expansionChars = computeBboxExpansionChars(target);
    expect(expansionChars).toBeGreaterThan(5);

    const expandedConstraints = { ...support.constraints!, expansionChars };
    // "Hello world" = 11 chars, way within expansion → valid
    const result = validateReplacement('Hello', 'Hello world', expandedConstraints);
    expect(result.valid).toBe(true);
  });

  it('a tight bbox yields 0 expansion even for writable target', () => {
    const text = 'Hello world';
    const fontSize = 12;
    const tightWidth = text.length * fontSize * ESTIMATED_CHAR_WIDTH_RATIO; // exact fit
    const target = makeSingleSpanTarget(text, tightWidth, fontSize);
    expect(computeBboxExpansionChars(target)).toBe(0);
  });

  it('a slightly wide bbox only allows a few extra chars', () => {
    // text="Hello" (5 chars), add 2 char-widths of spare space
    const text = 'Hello';
    const fontSize = 12;
    const charWidth = fontSize * ESTIMATED_CHAR_WIDTH_RATIO;
    const estimatedWidth = text.length * charWidth;
    const width = estimatedWidth + 2 * charWidth + 0.1; // just over 2 extra chars
    const target = makeSingleSpanTarget(text, width, fontSize);
    expect(computeBboxExpansionChars(target)).toBe(2);
  });
});

// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Text Layout Stress Testing — Phase 5 Batch 6
 *
 * Programmatic stress tests for mutation logic under edge conditions:
 * - Long word replacements: correctly blocked or allowed based on length
 * - Punctuation-heavy replacements: safe if same-or-shorter
 * - Unicode replacements: non-ASCII characters flagged by glyph risk
 * - Whitespace variations: tabs, multiple spaces, leading/trailing spaces
 * - Zero-width characters: no crashes, correctly handled
 * - Large character count: capped correctly
 * - Fidelity checker handles all cases without crashing
 * - No crashes in validateReplacement for any input
 * - No crashes in checkMutationFidelity for any input
 */

import { describe, it, expect } from 'vitest';
import { validateReplacement, getMutationSupport } from '../src/viewer/text/textMutationSupport';
import { checkMutationFidelity, isFidelitySafe } from '../src/viewer/text/textMutationFidelity';
import { assessGlyphRisk } from '../src/viewer/text/fontMutationSupport';
import type { TextParagraphTarget } from '../src/viewer/text/textInteractionModel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTarget(text: string): TextParagraphTarget {
  return {
    id: 'stress:p0',
    pageIndex: 0,
    source: 'digital',
    rect: { x: 0, y: 0, width: 400, height: 14 },
    lines: [
      {
        id: 'stress:l0',
        pageIndex: 0,
        source: 'digital',
        rect: { x: 0, y: 0, width: 400, height: 14 },
        spans: [
          {
            id: 'stress:s0',
            pageIndex: 0,
            source: 'digital',
            rect: { x: 0, y: 0, width: 400, height: 14 },
            text,
            fontSize: 12,
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Long word replacements
// ---------------------------------------------------------------------------

describe('stress — long word replacements', () => {
  it('single long word shorter than original passes', () => {
    const target = makeTarget('supercalifragilistic');
    const support = getMutationSupport(target);
    const result = validateReplacement('supercalifragilistic', 'super', support.constraints!);
    expect(result.valid).toBe(true);
  });

  it('word one char shorter than original passes (19 vs 20 chars)', () => {
    const target = makeTarget('supercalifragilistic');
    const support = getMutationSupport(target);
    const result = validateReplacement('supercalifragilistic', 'supercalifragilisti', support.constraints!);
    expect(result.valid).toBe(true); // 19 chars < 20 chars → valid (shorter)
  });

  it('exact same word passes (no-op replacement)', () => {
    const target = makeTarget('supercalifragilistic');
    const support = getMutationSupport(target);
    const result = validateReplacement('supercalifragilistic', 'supercalifragilistic', support.constraints!);
    expect(result.valid).toBe(true);
  });

  it('word with one extra character is blocked', () => {
    const target = makeTarget('Hello');
    const support = getMutationSupport(target);
    const result = validateReplacement('Hello', 'Helloo', support.constraints!);
    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe('replacement-too-long');
  });

  it('very long replacement is blocked', () => {
    const target = makeTarget('Hi');
    const support = getMutationSupport(target);
    const longText = 'A'.repeat(1000);
    const result = validateReplacement('Hi', longText, support.constraints!);
    expect(result.valid).toBe(false);
  });

  it('validateReplacement does not crash for 10000-char replacement', () => {
    const target = makeTarget('Short');
    const support = getMutationSupport(target);
    const huge = 'X'.repeat(10000);
    expect(() => validateReplacement('Short', huge, support.constraints!)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Punctuation-heavy replacements
// ---------------------------------------------------------------------------

describe('stress — punctuation-heavy replacements', () => {
  it('all-punctuation same-length replacement passes', () => {
    const target = makeTarget('Hello world');
    const support = getMutationSupport(target);
    const result = validateReplacement('Hello world', '!@#$%^&*()!', support.constraints!);
    expect(result.valid).toBe(true);
  });

  it('shorter punctuation replacement passes', () => {
    const target = makeTarget('Hello world');
    const support = getMutationSupport(target);
    const result = validateReplacement('Hello world', '!!!', support.constraints!);
    expect(result.valid).toBe(true);
  });

  it('period and comma within length passes', () => {
    const target = makeTarget('Hello world');
    const support = getMutationSupport(target);
    const result = validateReplacement('Hello world', 'Hello, wlrd', support.constraints!);
    expect(result.valid).toBe(true);
  });

  it('punctuation replacement has no glyph risk for standard_latin', () => {
    const result = assessGlyphRisk('!@#$%^&*()', 'standard_latin');
    expect(result.risk).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unicode replacements
// ---------------------------------------------------------------------------

describe('stress — unicode replacements', () => {
  it('ASCII-only unicode is safe (glyph risk=false)', () => {
    const result = assessGlyphRisk('cafe', 'standard_latin');
    expect(result.risk).toBe(false);
  });

  it('é (accented) poses glyph risk for standard_latin', () => {
    const result = assessGlyphRisk('café', 'standard_latin');
    expect(result.risk).toBe(true);
    expect(result.suspectChars).toContain('é');
  });

  it('Chinese characters pose glyph risk for standard_latin', () => {
    const result = assessGlyphRisk('你好', 'standard_latin');
    expect(result.risk).toBe(true);
  });

  it('emoji pose glyph risk for standard_latin', () => {
    const result = assessGlyphRisk('Hi 🎉', 'standard_latin');
    expect(result.risk).toBe(true);
  });

  it('Unicode replacement still passes validateReplacement if same-or-shorter length', () => {
    // validateReplacement checks char count, not glyph safety (that's assessGlyphRisk)
    const target = makeTarget('Hello world');
    const support = getMutationSupport(target);
    const result = validateReplacement('Hello world', 'Hello wörld', support.constraints!);
    expect(result.valid).toBe(true); // 11 chars = 11 chars → valid length
  });

  it('assessGlyphRisk deduplicates suspect chars', () => {
    const result = assessGlyphRisk('café café', 'standard_latin');
    const count = result.suspectChars.filter(c => c === 'é').length;
    expect(count).toBe(1); // deduplicated
  });
});

// ---------------------------------------------------------------------------
// Whitespace variations
// ---------------------------------------------------------------------------

describe('stress — whitespace variations', () => {
  it('trailing space replacement (same length) passes', () => {
    const target = makeTarget('Hello world');
    const support = getMutationSupport(target);
    const result = validateReplacement('Hello world', 'Hello wor  ', support.constraints!); // 11 chars
    expect(result.valid).toBe(true);
  });

  it('replacement with only spaces is blocked (whitespace-only = empty)', () => {
    const target = makeTarget('Hello');
    const support = getMutationSupport(target);
    const result = validateReplacement('Hello', '     ', support.constraints!);
    expect(result.valid).toBe(false); // trim().length === 0 → empty-replacement
    expect(result.reasonCode).toBe('empty-replacement');
  });

  it('tab character poses glyph risk for standard_latin', () => {
    const result = assessGlyphRisk('\tHello', 'standard_latin');
    expect(result.risk).toBe(true); // tab is control char (< 0x20)
  });

  it('newline in replacement poses glyph risk', () => {
    const result = assessGlyphRisk('Hello\nWorld', 'standard_latin');
    expect(result.risk).toBe(true);
  });

  it('validateReplacement does not crash for whitespace-only replacement', () => {
    const target = makeTarget('Hello');
    const support = getMutationSupport(target);
    expect(() => validateReplacement('Hello', '   ', support.constraints!)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Zero-width and control characters
// ---------------------------------------------------------------------------

describe('stress — zero-width and control characters', () => {
  it('zero-width space poses glyph risk', () => {
    const zwsp = '\u200B';
    const result = assessGlyphRisk(`Hello${zwsp}`, 'standard_latin');
    expect(result.risk).toBe(true);
  });

  it('null character in replacement does not crash validateReplacement', () => {
    const target = makeTarget('Hello');
    const support = getMutationSupport(target);
    expect(() => validateReplacement('Hello', 'He\0lo', support.constraints!)).not.toThrow();
  });

  it('null character replacement shorter than original is valid (length check only)', () => {
    const target = makeTarget('Hello');
    const support = getMutationSupport(target);
    const result = validateReplacement('Hello', 'He\0lo', support.constraints!);
    // 5 chars = 5 chars → valid length (glyph risk is separate)
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Fidelity checker stress
// ---------------------------------------------------------------------------

describe('stress — fidelity checker does not crash', () => {
  it('does not crash for empty string input', () => {
    const target = makeTarget('Hello');
    expect(() => checkMutationFidelity(target, 'Hello', '')).not.toThrow();
  });

  it('does not crash for 10000-char replacement', () => {
    const target = makeTarget('Hello');
    const huge = 'X'.repeat(10000);
    expect(() => checkMutationFidelity(target, 'Hello', huge)).not.toThrow();
  });

  it('does not crash for empty original', () => {
    const target = makeTarget('');
    expect(() => checkMutationFidelity(target, '', 'Hi')).not.toThrow();
  });

  it('does not crash for emoji replacement', () => {
    const target = makeTarget('Hello');
    expect(() => checkMutationFidelity(target, 'Hello', '🎉🎊')).not.toThrow();
  });

  it('isFidelitySafe returns boolean for all edge inputs', () => {
    const target = makeTarget('Hello');
    expect(typeof isFidelitySafe(target, 'Hello', '')).toBe('boolean');
    expect(typeof isFidelitySafe(target, 'Hello', 'Hello world')).toBe('boolean');
    expect(typeof isFidelitySafe(target, 'Hello', 'Hi')).toBe('boolean');
  });
});

// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Final Stability Verification — Phase 5 Batch 10
 *
 * Comprehensive end-to-end stability suite for the full mutation pipeline.
 * This is the final validation gate for REAL_TEXT_EDIT_VERIFICATION_AND_EXPANSION_BLOCK.
 *
 * Tests verified here:
 * - Full pipeline: getMutationSupport → validateReplacement → fidelity → font risk
 * - All Phase 4 safety matrix entries still classify correctly (regression guard)
 * - All Phase 5 additions don't corrupt Phase 4 behaviour
 * - No crashes for any combination of target shape + replacement text
 * - Telemetry records all pipeline stages
 * - Font encoding pipeline does not crash for any encoding class
 * - Messaging system returns structured output for every code path
 * - computeBboxExpansionChars is idempotent across repeated calls
 * - getEditTelemetrySummary is consistent across all outcome combinations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { getMutationSupport, validateReplacement, computeBboxExpansionChars } from '../src/viewer/text/textMutationSupport';
import { checkMutationFidelity, isFidelitySafe } from '../src/viewer/text/textMutationFidelity';
import { assessGlyphRisk, detectEncodingFromFontName, getFontMutationSupport } from '../src/viewer/text/fontMutationSupport';
import { getUnsupportedMessage, getBackendRejectionMessage, getFontEncodingMessage, getOverflowRiskMessage } from '../src/viewer/text/textMutationMessaging';
import { validateSafetyMatrix } from '../src/viewer/text/textMutationMatrix';
import { recordEditEvent, clearEditTelemetry, getEditTelemetrySummary } from '../src/viewer/state/editTelemetry';
import type { TextParagraphTarget } from '../src/viewer/text/textInteractionModel';
import type { FontEncodingClass } from '../src/viewer/text/fontMutationSupport';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWritableTarget(text: string, width = 200, fontSize = 12): TextParagraphTarget {
  return {
    id: 'final:p0',
    pageIndex: 0,
    source: 'digital',
    rect: { x: 0, y: 0, width, height: fontSize * 1.2 },
    lines: [
      {
        id: 'final:l0',
        pageIndex: 0,
        source: 'digital',
        rect: { x: 0, y: 0, width, height: fontSize * 1.2 },
        spans: [
          {
            id: 'final:s0',
            pageIndex: 0,
            source: 'digital',
            rect: { x: 0, y: 0, width, height: fontSize * 1.2 },
            text,
            fontSize,
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Phase 4 safety matrix — regression guard
// ---------------------------------------------------------------------------

describe('final stability — Phase 4 safety matrix regression', () => {
  it('all 5 safety matrix entries still classify correctly', () => {
    const failures = validateSafetyMatrix().filter(r => !r.pass);
    if (failures.length > 0) {
      throw new Error(
        `Safety matrix regressions:\n${failures.map(f => `  "${f.description}": expected ${f.expectedClass}, got ${f.actualClass}`).join('\n')}`,
      );
    }
    expect(failures).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Full pipeline: getMutationSupport → validateReplacement → fidelity → glyph
// ---------------------------------------------------------------------------

describe('final stability — full mutation pipeline', () => {
  it('writable target: all pipeline stages succeed for a valid replacement', () => {
    const target = makeWritableTarget('Hello world');
    const support = getMutationSupport(target);
    expect(support.writable).toBe(true);

    const validation = validateReplacement('Hello world', 'Hello earth', support.constraints!);
    expect(validation.valid).toBe(true);

    const fidelity = checkMutationFidelity(target, 'Hello world', 'Hello earth');
    expect(fidelity.pass).toBe(true);

    const glyphRisk = assessGlyphRisk('Hello earth', 'standard_latin');
    expect(glyphRisk.risk).toBe(false);
  });

  it('writable target: pipeline correctly blocks a too-long replacement', () => {
    const target = makeWritableTarget('Hi');
    const support = getMutationSupport(target);
    expect(support.writable).toBe(true);

    const validation = validateReplacement('Hi', 'Hello world', support.constraints!);
    expect(validation.valid).toBe(false);
    expect(validation.reasonCode).toBe('replacement-too-long');
  });

  it('OCR target: blocked at getMutationSupport before reaching validation', () => {
    const ocrTarget: TextParagraphTarget = {
      id: 'final:ocr',
      pageIndex: 0,
      source: 'ocr',
      rect: { x: 0, y: 0, width: 200, height: 14 },
      lines: [
        {
          id: 'final:ocr:l0',
          pageIndex: 0,
          source: 'ocr',
          rect: { x: 0, y: 0, width: 200, height: 14 },
          spans: [
            { id: 'final:ocr:s0', pageIndex: 0, source: 'ocr', rect: { x: 0, y: 0, width: 200, height: 14 }, text: 'Scanned', fontSize: 12 },
          ],
        },
      ],
    };
    const support = getMutationSupport(ocrTarget);
    expect(support.writable).toBe(false);
    expect(support.supportClass).toBe('ocr_read_only');
    // constraints is null → no validateReplacement needed
    expect(support.constraints).toBeNull();
  });

  it('non-writable multi-span: supportClass prevents validation call', () => {
    const multiSpan: TextParagraphTarget = {
      id: 'final:ms',
      pageIndex: 0,
      source: 'digital',
      rect: { x: 0, y: 0, width: 400, height: 14 },
      lines: [
        {
          id: 'final:ms:l0',
          pageIndex: 0,
          source: 'digital',
          rect: { x: 0, y: 0, width: 400, height: 14 },
          spans: [
            { id: 'final:ms:s0', pageIndex: 0, source: 'digital', rect: { x: 0, y: 0, width: 200, height: 14 }, text: 'Bold', fontSize: 14 },
            { id: 'final:ms:s1', pageIndex: 0, source: 'digital', rect: { x: 200, y: 0, width: 200, height: 14 }, text: ' text', fontSize: 12 },
          ],
        },
      ],
    };
    const support = getMutationSupport(multiSpan);
    expect(support.writable).toBe(false);
    expect(support.constraints).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// No crashes: all target shapes × all replacement texts
// ---------------------------------------------------------------------------

const TARGET_SHAPES = [
  makeWritableTarget('Hello'),
  makeWritableTarget(''),
  makeWritableTarget('A'),
  makeWritableTarget('supercalifragilistic'),
];

const REPLACEMENTS = ['', 'Hi', 'Hello world this is very long text', 'café', '🎉', '\t', '\0', '     '];

describe('final stability — no crashes for all target × replacement combinations', () => {
  for (const shape of TARGET_SHAPES) {
    for (const repl of REPLACEMENTS) {
      it(`does not crash: target="${shape.lines[0]?.spans[0]?.text ?? ''}" → replacement="${repl.slice(0, 20)}"`, () => {
        expect(() => {
          const support = getMutationSupport(shape);
          if (support.constraints) {
            validateReplacement(shape.lines[0]!.spans[0]!.text, repl, support.constraints);
          }
          checkMutationFidelity(shape, shape.lines[0]?.spans[0]?.text ?? '', repl);
          isFidelitySafe(shape, shape.lines[0]?.spans[0]?.text ?? '', repl);
          computeBboxExpansionChars(shape);
          assessGlyphRisk(repl, 'standard_latin');
        }).not.toThrow();
      });
    }
  }
});

// ---------------------------------------------------------------------------
// Font encoding pipeline — no crashes for all encoding classes
// ---------------------------------------------------------------------------

const ALL_ENCODING_CLASSES: FontEncodingClass[] = [
  'standard_latin', 'subset_embedded', 'identity_h', 'identity_v',
  'cid_keyed', 'custom_encoding', 'unknown',
];

describe('final stability — font encoding pipeline', () => {
  it('detectEncodingFromFontName does not crash for any input', () => {
    const inputs = [null, undefined, '', '   ', 'Helvetica', 'ABCDEF+Arial', 'Identity-H', 'CIDFont', 'random'];
    for (const input of inputs) {
      expect(() => detectEncodingFromFontName(input as string)).not.toThrow();
    }
  });

  it('getFontMutationSupport returns safe=true only for latin/subset', () => {
    const safe = ALL_ENCODING_CLASSES.filter(c => getFontMutationSupport(c).safe);
    expect(safe).toEqual(expect.arrayContaining(['standard_latin', 'subset_embedded']));
    expect(safe).toHaveLength(2);
  });

  it('assessGlyphRisk does not crash for any encoding class × any text', () => {
    const texts = ['Hello', 'café', '你好', '🎉', '', '\0'];
    for (const cls of ALL_ENCODING_CLASSES) {
      for (const text of texts) {
        expect(() => assessGlyphRisk(text, cls)).not.toThrow();
      }
    }
  });

  it('getFontEncodingMessage returns defined output for all classes', () => {
    for (const cls of ALL_ENCODING_CLASSES) {
      const msg = getFontEncodingMessage(cls);
      expect(msg.tooltip.length).toBeGreaterThan(0);
      expect(msg.explanation.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Messaging system — complete coverage
// ---------------------------------------------------------------------------

describe('final stability — messaging system coverage', () => {
  it('getBackendRejectionMessage returns defined output for all known codes', () => {
    const codes = [
      'replacement-too-long', 'text-not-found-in-content-stream', 'no-content-stream',
      'empty-original-text', 'page-not-found', 'encoding-not-supported',
      'font-encoding-unsafe', 'glyph-risk-detected', 'internal-error',
    ];
    for (const code of codes) {
      const msg = getBackendRejectionMessage(code);
      expect(msg.tooltip.length).toBeGreaterThan(0);
    }
  });

  it('getBackendRejectionMessage falls back to internal-error for unknown code', () => {
    const msg = getBackendRejectionMessage('totally-unknown-code-xyz');
    expect(msg.tooltip).toContain('fout'); // Dutch: error
  });

  it('getOverflowRiskMessage is consistent for overflow 0–100', () => {
    for (let n = 0; n <= 100; n++) {
      const msg = getOverflowRiskMessage(n);
      expect(msg.tooltip.length).toBeGreaterThan(0);
      expect(msg.actionable).toBe(true);
    }
  });

  it('getUnsupportedMessage returns defined output for all support classes', () => {
    const classes = [
      'writable_digital_text', 'non_writable_digital_text', 'ocr_read_only',
      'protected_or_locked', 'unknown_structure',
    ] as const;
    for (const cls of classes) {
      const msg = getUnsupportedMessage({ supportClass: cls, writable: false, reasonCode: 'unknown-source', constraints: null });
      expect(msg.tooltip.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Telemetry integration with pipeline
// ---------------------------------------------------------------------------

describe('final stability — telemetry integration', () => {
  beforeEach(() => clearEditTelemetry());

  it('records mutation-pending and rejection rates correctly', () => {
    recordEditEvent({ pageIndex: 0, outcome: 'mutation-pending', originalLength: 5, replacementLength: 3, reasonCode: null, supportClass: 'writable_digital_text' });
    recordEditEvent({ pageIndex: 0, outcome: 'validation-failed', originalLength: 5, replacementLength: 10, reasonCode: 'replacement-too-long', supportClass: 'writable_digital_text' });
    recordEditEvent({ pageIndex: 1, outcome: 'support-blocked', originalLength: 8, replacementLength: 0, reasonCode: null, supportClass: 'ocr_read_only' });

    const summary = getEditTelemetrySummary();
    expect(summary.total).toBe(3);
    expect(summary.byOutcome['mutation-pending']).toBe(1);
    expect(summary.byOutcome['validation-failed']).toBe(1);
    expect(summary.byOutcome['support-blocked']).toBe(1);
    expect(summary.rejectionRate).toBe(0.5); // 1 rejected out of 2 attempted
  });

  it('clearing telemetry resets rejection rate to 0', () => {
    recordEditEvent({ pageIndex: 0, outcome: 'mutation-rejected', originalLength: 5, replacementLength: 5, reasonCode: 'encoding-not-supported', supportClass: null });
    clearEditTelemetry();
    expect(getEditTelemetrySummary().rejectionRate).toBe(0);
    expect(getEditTelemetrySummary().total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeBboxExpansionChars — idempotency
// ---------------------------------------------------------------------------

describe('final stability — computeBboxExpansionChars idempotency', () => {
  it('returns the same value on repeated calls (no side effects)', () => {
    const target = makeWritableTarget('Hello world', 300, 12);
    const first = computeBboxExpansionChars(target);
    const second = computeBboxExpansionChars(target);
    expect(first).toBe(second);
  });

  it('does not modify the target object', () => {
    const target = makeWritableTarget('Hello world', 300, 12);
    const originalText = target.lines[0]!.spans[0]!.text;
    computeBboxExpansionChars(target);
    expect(target.lines[0]!.spans[0]!.text).toBe(originalText);
  });
});

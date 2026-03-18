// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Text Mutation Support Classification — Phase 4 Batch 1
 *
 * Verifies:
 * - writable_digital_text: single-line, single-span digital paragraphs
 * - non_writable_digital_text: multi-span and multi-line digital paragraphs
 * - ocr_read_only: OCR source paragraphs
 * - unknown_structure: empty content and unknown sources
 * - MutationConstraints: maxLength equals original text length
 * - validateReplacement: valid, no-change, empty, too-long paths
 * - isWritable and isNonWritableDigital predicates
 * - Source readiness: all expected exports present in the module
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getMutationSupport,
  validateReplacement,
  isWritable,
  isNonWritableDigital,
} from '../src/viewer/text/textMutationSupport';
import type {
  TextMutationSupportResult,
  MutationConstraints,
} from '../src/viewer/text/textMutationSupport';
import type { TextParagraphTarget } from '../src/viewer/text/textInteractionModel';

const __dir = dirname(fileURLToPath(import.meta.url));

const mutationSupportSrc = readFileSync(
  join(__dir, '../src/viewer/text/textMutationSupport.ts'),
  'utf8',
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSpan(text: string) {
  return {
    id: 'p0:s0',
    source: 'digital' as const,
    rect: { x: 10, y: 700, width: 100, height: 14 },
    text,
    fontSize: 12,
  };
}

function makeLine(spans: ReturnType<typeof makeSpan>[]) {
  return {
    id: 'p0:l0',
    source: 'digital' as const,
    rect: { x: 10, y: 700, width: 200, height: 14 },
    spans,
  };
}

/** Single-line, single-span digital paragraph — Phase 4 MVP writable class. */
function makeWritableParagraph(text = 'Hello world'): TextParagraphTarget {
  return {
    id: 'p0:par0',
    source: 'digital',
    rect: { x: 10, y: 700, width: 200, height: 14 },
    lines: [makeLine([makeSpan(text)])],
  } as unknown as TextParagraphTarget;
}

/** Single-line, multi-span digital paragraph. */
function makeMultiSpanParagraph(): TextParagraphTarget {
  return {
    id: 'p0:par0',
    source: 'digital',
    rect: { x: 10, y: 700, width: 300, height: 14 },
    lines: [
      makeLine([
        makeSpan('Hello '),
        { ...makeSpan('world'), id: 'p0:s1' },
      ]),
    ],
  } as unknown as TextParagraphTarget;
}

/** Multi-line paragraph with single span per line. */
function makeMultiLineParagraph(): TextParagraphTarget {
  return {
    id: 'p0:par0',
    source: 'digital',
    rect: { x: 10, y: 680, width: 200, height: 30 },
    lines: [
      makeLine([makeSpan('Line one')]),
      {
        id: 'p0:l1',
        source: 'digital' as const,
        rect: { x: 10, y: 694, width: 200, height: 14 },
        spans: [{ ...makeSpan('Line two'), id: 'p0:s1' }],
      },
    ],
  } as unknown as TextParagraphTarget;
}

/** OCR paragraph. */
function makeOcrParagraph(): TextParagraphTarget {
  return {
    id: 'p0:par0',
    source: 'ocr',
    rect: { x: 10, y: 700, width: 200, height: 14 },
    lines: [
      {
        id: 'p0:l0',
        source: 'ocr' as const,
        rect: { x: 10, y: 700, width: 200, height: 14 },
        spans: [
          {
            id: 'p0:s0',
            source: 'ocr' as const,
            rect: { x: 10, y: 700, width: 200, height: 14 },
            text: 'OCR text',
            fontSize: 12,
            confidence: 0.9,
          },
        ],
      },
    ],
  } as unknown as TextParagraphTarget;
}

/** Paragraph with no spans (empty structure). */
function makeEmptyParagraph(): TextParagraphTarget {
  return {
    id: 'p0:par0',
    source: 'digital',
    rect: { x: 10, y: 700, width: 200, height: 14 },
    lines: [],
  } as unknown as TextParagraphTarget;
}

const MVP_CONSTRAINTS: MutationConstraints = {
  maxLength: 11,
  assumedEncoding: 'standard-latin',
};

// ---------------------------------------------------------------------------
// Source readiness
// ---------------------------------------------------------------------------

describe('textMutationSupport — source readiness', () => {
  it('exports getMutationSupport', () => {
    expect(mutationSupportSrc).toContain('export function getMutationSupport');
  });

  it('exports validateReplacement', () => {
    expect(mutationSupportSrc).toContain('export function validateReplacement');
  });

  it('exports isWritable', () => {
    expect(mutationSupportSrc).toContain('export function isWritable');
  });

  it('exports isNonWritableDigital', () => {
    expect(mutationSupportSrc).toContain('export function isNonWritableDigital');
  });

  it('defines all four support class strings', () => {
    expect(mutationSupportSrc).toContain("'writable_digital_text'");
    expect(mutationSupportSrc).toContain("'non_writable_digital_text'");
    expect(mutationSupportSrc).toContain("'ocr_read_only'");
    expect(mutationSupportSrc).toContain("'protected_or_locked'");
    expect(mutationSupportSrc).toContain("'unknown_structure'");
  });

  it('defines MutationConstraints interface', () => {
    expect(mutationSupportSrc).toContain('MutationConstraints');
    expect(mutationSupportSrc).toContain('maxLength');
    expect(mutationSupportSrc).toContain('assumedEncoding');
  });

  it('documents encoding assumption explicitly', () => {
    expect(mutationSupportSrc).toContain('standard-latin');
    expect(mutationSupportSrc).toContain('WinAnsi');
  });

  it('documents save-safety rule', () => {
    expect(mutationSupportSrc).toContain('validateReplacement()');
  });
});

// ---------------------------------------------------------------------------
// writable_digital_text — single-line, single-span digital paragraph
// ---------------------------------------------------------------------------

describe('getMutationSupport — writable_digital_text', () => {
  it('returns writable_digital_text for single-span digital paragraph', () => {
    const result = getMutationSupport(makeWritableParagraph());
    expect(result.supportClass).toBe('writable_digital_text');
  });

  it('writable is true', () => {
    expect(getMutationSupport(makeWritableParagraph()).writable).toBe(true);
  });

  it('reasonCode is single-span-digital', () => {
    expect(getMutationSupport(makeWritableParagraph()).reasonCode).toBe('single-span-digital');
  });

  it('label is non-empty Dutch string', () => {
    const { label } = getMutationSupport(makeWritableParagraph());
    expect(label.length).toBeGreaterThan(10);
  });

  it('constraints are present', () => {
    const { constraints } = getMutationSupport(makeWritableParagraph());
    expect(constraints).not.toBeNull();
  });

  it('maxLength equals original text length', () => {
    const text = 'Hello world'; // 11 chars
    const { constraints } = getMutationSupport(makeWritableParagraph(text));
    expect(constraints?.maxLength).toBe(11);
  });

  it('maxLength reflects actual span text, not paragraph text', () => {
    const result = getMutationSupport(makeWritableParagraph('Short'));
    expect(result.constraints?.maxLength).toBe(5);
  });

  it('assumedEncoding is standard-latin', () => {
    expect(getMutationSupport(makeWritableParagraph()).constraints?.assumedEncoding).toBe(
      'standard-latin',
    );
  });
});

// ---------------------------------------------------------------------------
// non_writable_digital_text — multi-span
// ---------------------------------------------------------------------------

describe('getMutationSupport — multi-span non_writable_digital_text', () => {
  it('multi-span paragraph returns non_writable_digital_text', () => {
    expect(getMutationSupport(makeMultiSpanParagraph()).supportClass).toBe(
      'non_writable_digital_text',
    );
  });

  it('writable is false', () => {
    expect(getMutationSupport(makeMultiSpanParagraph()).writable).toBe(false);
  });

  it('reasonCode is multi-span-unsupported', () => {
    expect(getMutationSupport(makeMultiSpanParagraph()).reasonCode).toBe('multi-span-unsupported');
  });

  it('constraints are null', () => {
    expect(getMutationSupport(makeMultiSpanParagraph()).constraints).toBeNull();
  });

  it('label is informative', () => {
    expect(getMutationSupport(makeMultiSpanParagraph()).label.length).toBeGreaterThan(10);
  });
});

// ---------------------------------------------------------------------------
// non_writable_digital_text — multi-line
// ---------------------------------------------------------------------------

describe('getMutationSupport — multi-line non_writable_digital_text', () => {
  it('multi-line paragraph returns non_writable_digital_text', () => {
    expect(getMutationSupport(makeMultiLineParagraph()).supportClass).toBe(
      'non_writable_digital_text',
    );
  });

  it('writable is false', () => {
    expect(getMutationSupport(makeMultiLineParagraph()).writable).toBe(false);
  });

  it('reasonCode is multi-line-unsupported', () => {
    expect(getMutationSupport(makeMultiLineParagraph()).reasonCode).toBe('multi-line-unsupported');
  });

  it('constraints are null', () => {
    expect(getMutationSupport(makeMultiLineParagraph()).constraints).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ocr_read_only
// ---------------------------------------------------------------------------

describe('getMutationSupport — ocr_read_only', () => {
  it('OCR paragraph returns ocr_read_only', () => {
    expect(getMutationSupport(makeOcrParagraph()).supportClass).toBe('ocr_read_only');
  });

  it('writable is false for OCR', () => {
    expect(getMutationSupport(makeOcrParagraph()).writable).toBe(false);
  });

  it('reasonCode is ocr-source', () => {
    expect(getMutationSupport(makeOcrParagraph()).reasonCode).toBe('ocr-source');
  });

  it('constraints are null for OCR', () => {
    expect(getMutationSupport(makeOcrParagraph()).constraints).toBeNull();
  });

  it('OCR label mentions OCR', () => {
    expect(getMutationSupport(makeOcrParagraph()).label.toLowerCase()).toContain('ocr');
  });
});

// ---------------------------------------------------------------------------
// unknown_structure — empty content
// ---------------------------------------------------------------------------

describe('getMutationSupport — unknown_structure (empty)', () => {
  it('paragraph with no spans returns unknown_structure', () => {
    expect(getMutationSupport(makeEmptyParagraph()).supportClass).toBe('unknown_structure');
  });

  it('writable is false for empty paragraph', () => {
    expect(getMutationSupport(makeEmptyParagraph()).writable).toBe(false);
  });

  it('reasonCode is empty-content', () => {
    expect(getMutationSupport(makeEmptyParagraph()).reasonCode).toBe('empty-content');
  });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe('getMutationSupport — determinism', () => {
  it('same input produces identical result', () => {
    const para = makeWritableParagraph('Consistent');
    const r1 = getMutationSupport(para);
    const r2 = getMutationSupport(para);
    expect(r1.supportClass).toBe(r2.supportClass);
    expect(r1.reasonCode).toBe(r2.reasonCode);
    expect(r1.writable).toBe(r2.writable);
    expect(r1.constraints?.maxLength).toBe(r2.constraints?.maxLength);
  });

  it('does not mutate the input target', () => {
    const para = makeWritableParagraph('Test');
    const linesBefore = para.lines.length;
    getMutationSupport(para);
    expect(para.lines.length).toBe(linesBefore);
  });
});

// ---------------------------------------------------------------------------
// validateReplacement — valid cases
// ---------------------------------------------------------------------------

describe('validateReplacement — valid cases', () => {
  it('shorter replacement is valid', () => {
    const result = validateReplacement('Hello world', 'Hi', MVP_CONSTRAINTS);
    expect(result.valid).toBe(true);
  });

  it('same-length replacement is valid', () => {
    const result = validateReplacement('Hello', 'World', { maxLength: 5, assumedEncoding: 'standard-latin' });
    expect(result.valid).toBe(true);
  });

  it('no-change returns valid with no-change reasonCode', () => {
    const result = validateReplacement('Hello', 'Hello', { maxLength: 5, assumedEncoding: 'standard-latin' });
    expect(result.valid).toBe(true);
    expect(result.reasonCode).toBe('no-change');
  });

  it('valid result has reasonCode "valid"', () => {
    const result = validateReplacement('Hello world', 'Hi there', MVP_CONSTRAINTS);
    expect(result.valid).toBe(true);
    expect(result.reasonCode).toBe('valid');
  });
});

// ---------------------------------------------------------------------------
// validateReplacement — rejection cases
// ---------------------------------------------------------------------------

describe('validateReplacement — rejection cases', () => {
  it('longer replacement is rejected', () => {
    const result = validateReplacement('Hi', 'Hello world!', { maxLength: 2, assumedEncoding: 'standard-latin' });
    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe('replacement-too-long');
  });

  it('too-long message includes both lengths', () => {
    const result = validateReplacement('Hi', 'Hello world!', { maxLength: 2, assumedEncoding: 'standard-latin' });
    expect(result.message).toContain('12'); // replacement length
    expect(result.message).toContain('2');  // max length
  });

  it('empty replacement is rejected', () => {
    const result = validateReplacement('Hello', '   ', MVP_CONSTRAINTS);
    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe('empty-replacement');
  });

  it('empty replacement message mentions redactie', () => {
    const result = validateReplacement('Hello', '', MVP_CONSTRAINTS);
    expect(result.message.toLowerCase()).toContain('redactie');
  });

  it('null maxLength does not block longer replacement', () => {
    const constraints: MutationConstraints = { maxLength: null, assumedEncoding: 'standard-latin' };
    const result = validateReplacement('Hi', 'This is much longer text!', constraints);
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateReplacement — integration with getMutationSupport
// ---------------------------------------------------------------------------

describe('validateReplacement — integrated with getMutationSupport constraints', () => {
  it('writable paragraph constraints reject too-long replacement', () => {
    const para = makeWritableParagraph('Hi'); // maxLength: 2
    const { constraints } = getMutationSupport(para);
    expect(constraints).not.toBeNull();
    const result = validateReplacement('Hi', 'Hello world!', constraints!);
    expect(result.valid).toBe(false);
  });

  it('writable paragraph constraints allow shorter replacement', () => {
    const para = makeWritableParagraph('Hello world'); // maxLength: 11
    const { constraints } = getMutationSupport(para);
    const result = validateReplacement('Hello world', 'Hi', constraints!);
    expect(result.valid).toBe(true);
  });

  it('writable paragraph constraints allow same-length replacement', () => {
    const para = makeWritableParagraph('Hello'); // maxLength: 5
    const { constraints } = getMutationSupport(para);
    const result = validateReplacement('Hello', 'World', constraints!);
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isWritable predicate
// ---------------------------------------------------------------------------

describe('isWritable predicate', () => {
  it('true for single-span digital paragraph', () => {
    expect(isWritable(makeWritableParagraph())).toBe(true);
  });

  it('false for multi-span paragraph', () => {
    expect(isWritable(makeMultiSpanParagraph())).toBe(false);
  });

  it('false for multi-line paragraph', () => {
    expect(isWritable(makeMultiLineParagraph())).toBe(false);
  });

  it('false for OCR paragraph', () => {
    expect(isWritable(makeOcrParagraph())).toBe(false);
  });

  it('false for empty paragraph', () => {
    expect(isWritable(makeEmptyParagraph())).toBe(false);
  });

  it('consistent with getMutationSupport().writable', () => {
    const para = makeWritableParagraph();
    expect(isWritable(para)).toBe(getMutationSupport(para).writable);
  });
});

// ---------------------------------------------------------------------------
// isNonWritableDigital predicate
// ---------------------------------------------------------------------------

describe('isNonWritableDigital predicate', () => {
  it('true for multi-span digital paragraph', () => {
    expect(isNonWritableDigital(makeMultiSpanParagraph())).toBe(true);
  });

  it('true for multi-line digital paragraph', () => {
    expect(isNonWritableDigital(makeMultiLineParagraph())).toBe(true);
  });

  it('false for single-span digital (that is writable)', () => {
    expect(isNonWritableDigital(makeWritableParagraph())).toBe(false);
  });

  it('false for OCR (different class)', () => {
    expect(isNonWritableDigital(makeOcrParagraph())).toBe(false);
  });

  it('false for empty paragraph (unknown_structure)', () => {
    expect(isNonWritableDigital(makeEmptyParagraph())).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Support class completeness
// ---------------------------------------------------------------------------

describe('getMutationSupport — class coverage', () => {
  it('all four main classes are reachable', () => {
    const classes = new Set<string>();
    classes.add(getMutationSupport(makeWritableParagraph()).supportClass);
    classes.add(getMutationSupport(makeMultiSpanParagraph()).supportClass);
    classes.add(getMutationSupport(makeOcrParagraph()).supportClass);
    classes.add(getMutationSupport(makeEmptyParagraph()).supportClass);
    expect(classes.has('writable_digital_text')).toBe(true);
    expect(classes.has('non_writable_digital_text')).toBe(true);
    expect(classes.has('ocr_read_only')).toBe(true);
    expect(classes.has('unknown_structure')).toBe(true);
  });

  it('all results have non-empty labels', () => {
    const paragraphs = [
      makeWritableParagraph(),
      makeMultiSpanParagraph(),
      makeMultiLineParagraph(),
      makeOcrParagraph(),
      makeEmptyParagraph(),
    ];
    for (const para of paragraphs) {
      const { label } = getMutationSupport(para);
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('non-writable results always have null constraints', () => {
    const nonWritable = [
      makeMultiSpanParagraph(),
      makeMultiLineParagraph(),
      makeOcrParagraph(),
      makeEmptyParagraph(),
    ];
    for (const para of nonWritable) {
      expect(getMutationSupport(para).constraints).toBeNull();
    }
  });
});

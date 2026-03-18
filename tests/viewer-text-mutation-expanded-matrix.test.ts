// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Extended Mutation Matrix — Phase 5 Batch 4
 *
 * Expands the Phase 4 safety matrix with replacement-length scenarios:
 * - shorter replacement → valid
 * - equal-length replacement → valid
 * - longer replacement (small overflow) → blocked
 * - large overflow → blocked
 * - empty replacement → blocked
 * - single character replacement → valid
 * - punctuation replacement → valid
 * - numeric replacement → valid
 *
 * Also verifies the original 5-entry matrix still passes (regression guard).
 */

import { describe, it, expect } from 'vitest';
import {
  REPLACEMENT_SAFETY_MATRIX,
  REPLACEMENT_MATRIX_TARGET,
  validateReplacementMatrix,
  validateSafetyMatrix,
} from '../src/viewer/text/textMutationMatrix';
import { validateReplacement, getMutationSupport } from '../src/viewer/text/textMutationSupport';

// ---------------------------------------------------------------------------
// Original safety matrix — regression guard
// ---------------------------------------------------------------------------

describe('expanded matrix — original 5-entry matrix still passes', () => {
  it('validateSafetyMatrix returns no failures', () => {
    const failures = validateSafetyMatrix().filter(r => !r.pass);
    expect(failures).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Replacement matrix structure
// ---------------------------------------------------------------------------

describe('expanded matrix — replacement matrix structure', () => {
  it('has at least 8 replacement entries', () => {
    expect(REPLACEMENT_SAFETY_MATRIX.length).toBeGreaterThanOrEqual(8);
  });

  it('all entries have non-empty descriptions', () => {
    for (const entry of REPLACEMENT_SAFETY_MATRIX) {
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  it('REPLACEMENT_MATRIX_TARGET is writable', () => {
    const support = getMutationSupport(REPLACEMENT_MATRIX_TARGET);
    expect(support.writable).toBe(true);
    expect(support.constraints).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Full replacement matrix validation
// ---------------------------------------------------------------------------

describe('expanded matrix — all replacement cases pass', () => {
  it('validateReplacementMatrix returns no failures', () => {
    const results = validateReplacementMatrix();
    const failures = results.filter(r => !r.pass);
    if (failures.length > 0) {
      const msgs = failures.map(f =>
        `"${f.description}": expectedValid=${f.expectedValid}, actualValid=${f.actualValid}`,
      );
      throw new Error(`Replacement matrix failures:\n${msgs.join('\n')}`);
    }
    expect(failures).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Individual replacement scenarios
// ---------------------------------------------------------------------------

describe('expanded matrix — shorter replacement', () => {
  it('shorter replacement (5 chars vs 11) is valid', () => {
    const support = getMutationSupport(REPLACEMENT_MATRIX_TARGET);
    const result = validateReplacement('Hello world', 'Hello', support.constraints!);
    expect(result.valid).toBe(true);
  });
});

describe('expanded matrix — equal-length replacement', () => {
  it('equal-length replacement is valid', () => {
    const support = getMutationSupport(REPLACEMENT_MATRIX_TARGET);
    const result = validateReplacement('Hello world', 'Hello earth', support.constraints!);
    expect(result.valid).toBe(true);
  });
});

describe('expanded matrix — longer replacement blocked', () => {
  it('longer replacement (12 chars vs 11) is invalid', () => {
    const support = getMutationSupport(REPLACEMENT_MATRIX_TARGET);
    const result = validateReplacement('Hello world', 'Hello worlds', support.constraints!);
    expect(result.valid).toBe(false);
  });

  it('longer replacement returns replacement-too-long reason code', () => {
    const support = getMutationSupport(REPLACEMENT_MATRIX_TARGET);
    const result = validateReplacement('Hello world', 'Hello worlds', support.constraints!);
    expect(result.reasonCode).toBe('replacement-too-long');
  });

  it('longer replacement has non-empty message', () => {
    const support = getMutationSupport(REPLACEMENT_MATRIX_TARGET);
    const result = validateReplacement('Hello world', 'Hello worlds', support.constraints!);
    expect(result.message.length).toBeGreaterThan(0);
  });
});

describe('expanded matrix — large overflow blocked', () => {
  it('large overflow (30 chars vs 11) is invalid', () => {
    const support = getMutationSupport(REPLACEMENT_MATRIX_TARGET);
    const result = validateReplacement('Hello world', 'Hello world this is very long text', support.constraints!);
    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe('replacement-too-long');
  });
});

describe('expanded matrix — empty replacement blocked', () => {
  it('empty replacement is invalid', () => {
    const support = getMutationSupport(REPLACEMENT_MATRIX_TARGET);
    const result = validateReplacement('Hello world', '', support.constraints!);
    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe('empty-replacement');
  });
});

describe('expanded matrix — safe special cases', () => {
  it('single character replacement is valid', () => {
    const support = getMutationSupport(REPLACEMENT_MATRIX_TARGET);
    const result = validateReplacement('Hello world', 'H', support.constraints!);
    expect(result.valid).toBe(true);
  });

  it('punctuation-only same-length replacement is valid', () => {
    const support = getMutationSupport(REPLACEMENT_MATRIX_TARGET);
    const result = validateReplacement('Hello world', 'Hello, wlrd', support.constraints!);
    expect(result.valid).toBe(true);
  });

  it('numeric replacement (shorter) is valid', () => {
    const support = getMutationSupport(REPLACEMENT_MATRIX_TARGET);
    const result = validateReplacement('Hello world', '42', support.constraints!);
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// OCR and multi-line — blocked at support class level
// ---------------------------------------------------------------------------

describe('expanded matrix — blocked at support class level', () => {
  it('OCR target → getMutationSupport returns ocr_read_only (blocked before replacement check)', () => {
    const ocrTarget = {
      id: 'x',
      pageIndex: 0,
      source: 'ocr' as const,
      rect: { x: 0, y: 0, width: 200, height: 14 },
      lines: [
        {
          id: 'x:l0',
          pageIndex: 0,
          source: 'ocr' as const,
          rect: { x: 0, y: 0, width: 200, height: 14 },
          spans: [
            {
              id: 'x:s0',
              pageIndex: 0,
              source: 'ocr' as const,
              rect: { x: 0, y: 0, width: 200, height: 14 },
              text: 'OCR text',
              fontSize: 12,
            },
          ],
        },
      ],
    };
    const support = getMutationSupport(ocrTarget);
    expect(support.writable).toBe(false);
    expect(support.supportClass).toBe('ocr_read_only');
  });

  it('mixed font run → getMutationSupport returns non_writable_digital_text', () => {
    const mixedTarget = {
      id: 'x',
      pageIndex: 0,
      source: 'digital' as const,
      rect: { x: 0, y: 0, width: 300, height: 14 },
      lines: [
        {
          id: 'x:l0',
          pageIndex: 0,
          source: 'digital' as const,
          rect: { x: 0, y: 0, width: 300, height: 14 },
          spans: [
            {
              id: 'x:s0',
              pageIndex: 0,
              source: 'digital' as const,
              rect: { x: 0, y: 0, width: 150, height: 14 },
              text: 'Bold',
              fontSize: 14,
            },
            {
              id: 'x:s1',
              pageIndex: 0,
              source: 'digital' as const,
              rect: { x: 150, y: 0, width: 150, height: 14 },
              text: ' regular',
              fontSize: 12,
            },
          ],
        },
      ],
    };
    const support = getMutationSupport(mixedTarget);
    expect(support.writable).toBe(false);
    expect(support.supportClass).toBe('non_writable_digital_text');
  });

  it('cross-line edit → multi-line target is non_writable_digital_text', () => {
    const multiLine = {
      id: 'x',
      pageIndex: 0,
      source: 'digital' as const,
      rect: { x: 0, y: 0, width: 200, height: 30 },
      lines: [
        {
          id: 'x:l0',
          pageIndex: 0,
          source: 'digital' as const,
          rect: { x: 0, y: 16, width: 200, height: 14 },
          spans: [{ id: 'x:s0', pageIndex: 0, source: 'digital' as const, rect: { x: 0, y: 16, width: 200, height: 14 }, text: 'Line 1', fontSize: 12 }],
        },
        {
          id: 'x:l1',
          pageIndex: 0,
          source: 'digital' as const,
          rect: { x: 0, y: 0, width: 200, height: 14 },
          spans: [{ id: 'x:s1', pageIndex: 0, source: 'digital' as const, rect: { x: 0, y: 0, width: 200, height: 14 }, text: 'Line 2', fontSize: 12 }],
        },
      ],
    };
    const support = getMutationSupport(multiLine);
    expect(support.writable).toBe(false);
    expect(support.supportClass).toBe('non_writable_digital_text');
  });
});

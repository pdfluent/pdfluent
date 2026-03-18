// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Text Mutation Safety Matrix — Phase 4 Batch 9
 *
 * Defines a small corpus of canonical text-edit target shapes and their
 * expected mutation outcome. Each entry in the matrix maps a target
 * description to the expected TextMutationSupportClass.
 *
 * Purpose:
 *   - Makes Phase 4 mutation assumptions explicit and testable
 *   - Acts as a regression guard: if getMutationSupport() changes, the
 *     matrix tests will catch unintended shifts in classification
 *   - Documents the supported/unsupported surface for new contributors
 *
 * The matrix is intentionally minimal — it captures exactly the shapes
 * that Phase 4 supports or explicitly does not support. Advanced cases
 * (CID fonts, custom encodings, embedded images) are deferred.
 */

import { getMutationSupport, validateReplacement } from './textMutationSupport';
import type { TextMutationSupportClass } from './textMutationSupport';
import type { TextParagraphTarget } from './textInteractionModel';

// ---------------------------------------------------------------------------
// Matrix entry
// ---------------------------------------------------------------------------

export interface SafetyMatrixEntry {
  /** Human-readable description of the target shape. */
  readonly description: string;
  /** The target under test. */
  readonly target: TextParagraphTarget;
  /** Expected mutation support class. */
  readonly expectedClass: TextMutationSupportClass;
  /**
   * Whether real PDF mutation should be attempted for this target.
   * Derived from expectedClass — always true for writable_digital_text.
   */
  readonly expectedWritable: boolean;
}

// ---------------------------------------------------------------------------
// Canonical target shapes
// ---------------------------------------------------------------------------

const singleLineDigital: TextParagraphTarget = {
  kind: 'paragraph',
  id: 'matrix:single-line-digital',
  source: 'digital',
  rect: { x: 10, y: 700, width: 200, height: 14 },
  lines: [
    {
      kind: 'line',
      id: 'matrix:l0',
      source: 'digital',
      rect: { x: 10, y: 700, width: 200, height: 14 },
      baselineY: 700,
      spans: [
        {
          kind: 'span',
          id: 'matrix:s0',
          source: 'digital',
          rect: { x: 10, y: 700, width: 200, height: 14 },
          text: 'Simple single-line text',
          fontSize: 12,
        },
      ],
    },
  ],
};

const multiLineParagraph: TextParagraphTarget = {
  kind: 'paragraph',
  id: 'matrix:multi-line',
  source: 'digital',
  rect: { x: 10, y: 680, width: 200, height: 30 },
  lines: [
    {
      kind: 'line',
      id: 'matrix:l0',
      source: 'digital',
      rect: { x: 10, y: 694, width: 200, height: 14 },
      baselineY: 694,
      spans: [
        {
          kind: 'span',
          id: 'matrix:s0',
          source: 'digital',
          rect: { x: 10, y: 694, width: 200, height: 14 },
          text: 'First line',
          fontSize: 12,
        },
      ],
    },
    {
      kind: 'line',
      id: 'matrix:l1',
      source: 'digital',
      rect: { x: 10, y: 680, width: 200, height: 14 },
      baselineY: 680,
      spans: [
        {
          kind: 'span',
          id: 'matrix:s1',
          source: 'digital',
          rect: { x: 10, y: 680, width: 200, height: 14 },
          text: 'Second line',
          fontSize: 12,
        },
      ],
    },
  ],
};

const multiSpanLine: TextParagraphTarget = {
  kind: 'paragraph',
  id: 'matrix:multi-span',
  source: 'digital',
  rect: { x: 10, y: 700, width: 300, height: 14 },
  lines: [
    {
      kind: 'line',
      id: 'matrix:l0',
      source: 'digital',
      rect: { x: 10, y: 700, width: 300, height: 14 },
      baselineY: 700,
      spans: [
        {
          kind: 'span',
          id: 'matrix:s0',
          source: 'digital',
          rect: { x: 10, y: 700, width: 150, height: 14 },
          text: 'Bold heading',
          fontSize: 14,
        },
        {
          kind: 'span',
          id: 'matrix:s1',
          source: 'digital',
          rect: { x: 160, y: 700, width: 150, height: 14 },
          text: ' regular text',
          fontSize: 12,
        },
      ],
    },
  ],
};

const ocrText: TextParagraphTarget = {
  kind: 'paragraph',
  id: 'matrix:ocr',
  source: 'ocr',
  rect: { x: 10, y: 700, width: 200, height: 14 },
  lines: [
    {
      kind: 'line',
      id: 'matrix:l0',
      source: 'ocr',
      rect: { x: 10, y: 700, width: 200, height: 14 },
      baselineY: 700,
      spans: [
        {
          kind: 'span',
          id: 'matrix:s0',
          source: 'ocr',
          rect: { x: 10, y: 700, width: 200, height: 14 },
          text: 'Scanned text from OCR',
          fontSize: 12,
        },
      ],
    },
  ],
};

const unknownStructure: TextParagraphTarget = {
  kind: 'paragraph',
  id: 'matrix:unknown',
  source: 'digital',
  rect: { x: 10, y: 700, width: 200, height: 14 },
  lines: [], // empty lines → unknown structure
};

// ---------------------------------------------------------------------------
// Safety matrix
// ---------------------------------------------------------------------------

/**
 * The canonical safety matrix for Phase 4 MVP text mutation.
 *
 * Each entry documents the expected outcome for a given target shape.
 * Tests run getMutationSupport() on each target and compare against expectedClass.
 */
export const TEXT_MUTATION_SAFETY_MATRIX: readonly SafetyMatrixEntry[] = [
  {
    description: 'Simple single-line, single-span digital text',
    target: singleLineDigital,
    expectedClass: 'writable_digital_text',
    expectedWritable: true,
  },
  {
    description: 'Multi-line paragraph (wraps to 2 lines)',
    target: multiLineParagraph,
    expectedClass: 'non_writable_digital_text',
    expectedWritable: false,
  },
  {
    description: 'Single-line with multiple spans (mixed font/size)',
    target: multiSpanLine,
    expectedClass: 'non_writable_digital_text',
    expectedWritable: false,
  },
  {
    description: 'OCR-derived text (overlay, not PDF operators)',
    target: ocrText,
    expectedClass: 'ocr_read_only',
    expectedWritable: false,
  },
  {
    description: 'Digital text with empty lines array (unknown structure)',
    target: unknownStructure,
    expectedClass: 'unknown_structure',
    expectedWritable: false,
  },
];

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

export interface MatrixValidationResult {
  readonly description: string;
  readonly expectedClass: TextMutationSupportClass;
  readonly actualClass: TextMutationSupportClass;
  readonly expectedWritable: boolean;
  readonly actualWritable: boolean;
  readonly pass: boolean;
}

/**
 * Run getMutationSupport() against every matrix entry and return results.
 * A pass means expectedClass and expectedWritable match the actual values.
 */
export function validateSafetyMatrix(): MatrixValidationResult[] {
  return TEXT_MUTATION_SAFETY_MATRIX.map(entry => {
    const result = getMutationSupport(entry.target);
    const classMatch = result.supportClass === entry.expectedClass;
    const writableMatch = result.writable === entry.expectedWritable;
    return {
      description: entry.description,
      expectedClass: entry.expectedClass,
      actualClass: result.supportClass,
      expectedWritable: entry.expectedWritable,
      actualWritable: result.writable,
      pass: classMatch && writableMatch,
    };
  });
}

// ---------------------------------------------------------------------------
// Extended replacement matrix — Phase 5 Batch 4
// ---------------------------------------------------------------------------

/**
 * A replacement scenario tested against a specific writable target.
 */
export interface ReplacementMatrixEntry {
  /** Human-readable description of the scenario. */
  readonly description: string;
  /** The original text in the PDF. */
  readonly original: string;
  /** The proposed replacement. */
  readonly replacement: string;
  /** Whether the replacement should be considered valid. */
  readonly expectedValid: boolean;
  /** Expected reason code from validateReplacement (if not valid). */
  readonly expectedReasonCode?: string;
}

/** Canonical writable target used for replacement matrix tests. */
export const REPLACEMENT_MATRIX_TARGET: TextParagraphTarget = {
  kind: 'paragraph',
  id: 'matrix:replacement',
  source: 'digital',
  rect: { x: 10, y: 700, width: 200, height: 14 },
  lines: [
    {
      kind: 'line',
      id: 'matrix:r:l0',
      source: 'digital',
      rect: { x: 10, y: 700, width: 200, height: 14 },
      baselineY: 700,
      spans: [
        {
          kind: 'span',
          id: 'matrix:r:s0',
          source: 'digital',
          rect: { x: 10, y: 700, width: 200, height: 14 },
          text: 'Hello world',
          fontSize: 12,
        },
      ],
    },
  ],
};

/**
 * Extended replacement safety matrix.
 *
 * Tests validateReplacement() for a writable single-span target.
 * Original text is always 'Hello world' (11 chars).
 */
export const REPLACEMENT_SAFETY_MATRIX: readonly ReplacementMatrixEntry[] = [
  {
    description: 'shorter replacement (5 chars vs 11)',
    original: 'Hello world',
    replacement: 'Hello',
    expectedValid: true,
  },
  {
    description: 'equal-length replacement (11 chars)',
    original: 'Hello world',
    replacement: 'Hello earth',
    expectedValid: true,
  },
  {
    description: 'longer replacement — small overflow (12 chars vs 11)',
    original: 'Hello world',
    replacement: 'Hello worlds',
    expectedValid: false,
    expectedReasonCode: 'replacement-too-long',
  },
  {
    description: 'large overflow (30 chars vs 11)',
    original: 'Hello world',
    replacement: 'Hello world this is very long text',
    expectedValid: false,
    expectedReasonCode: 'replacement-too-long',
  },
  {
    description: 'empty replacement (blocked)',
    original: 'Hello world',
    replacement: '',
    expectedValid: false,
    expectedReasonCode: 'empty-replacement',
  },
  {
    description: 'single character replacement (safe — much shorter)',
    original: 'Hello world',
    replacement: 'H',
    expectedValid: true,
  },
  {
    description: 'punctuation replacement (same length, safe)',
    original: 'Hello world',
    replacement: 'Hello, wlrd',
    expectedValid: true,
  },
  {
    description: 'numeric replacement (shorter, safe)',
    original: 'Hello world',
    replacement: '42',
    expectedValid: true,
  },
];

export interface ReplacementValidationResult {
  readonly description: string;
  readonly original: string;
  readonly replacement: string;
  readonly expectedValid: boolean;
  readonly actualValid: boolean;
  readonly pass: boolean;
  readonly reasonCode?: string;
}

/**
 * Run validateReplacement() against every replacement matrix entry.
 */
export function validateReplacementMatrix(): ReplacementValidationResult[] {
  const support = getMutationSupport(REPLACEMENT_MATRIX_TARGET);
  if (!support.writable || !support.constraints) return [];

  return REPLACEMENT_SAFETY_MATRIX.map(entry => {
    const result = validateReplacement(entry.original, entry.replacement, support.constraints!);
    return {
      description: entry.description,
      original: entry.original,
      replacement: entry.replacement,
      expectedValid: entry.expectedValid,
      actualValid: result.valid,
      pass: result.valid === entry.expectedValid,
      reasonCode: result.reasonCode,
    };
  });
}

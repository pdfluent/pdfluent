// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Real Document Corpus — Phase 5 Batch 1
 *
 * Defines the canonical corpus of representative PDF document categories
 * used to validate text mutation behavior against real-world structures.
 *
 * This file contains:
 * - CorpusCategory: the 10 document categories with descriptions
 * - CorpusEntry: per-category expectations (writable / blocked / ocr)
 * - DOCUMENT_CORPUS: the full expected corpus definition
 * - Representative TextParagraphTarget fixtures for each category
 *   (used when real PDFs are not yet present in the corpus directory)
 *
 * Real PDF files (when available) should be placed in:
 *   tests/real_documents/<category>/
 *
 * Example:
 *   tests/real_documents/simple_digital_text/word-export.pdf
 *   tests/real_documents/embedded_fonts/helvetica-subset.pdf
 *
 * Classification rationale:
 *   writable   = single-span, single-line, digital source → Phase 4 MVP
 *   blocked    = multi-line, multi-span, protected, or unknown structure
 *   ocr        = OCR overlay (source = 'ocr')
 */

import type { TextParagraphTarget } from '../../src/viewer/text/textInteractionModel';
import type { TextMutationSupportClass } from '../../src/viewer/text/textMutationSupport';

// ---------------------------------------------------------------------------
// Corpus category
// ---------------------------------------------------------------------------

export type CorpusCategory =
  | 'simple_digital_text'
  | 'multi_line_paragraph'
  | 'embedded_fonts'
  | 'kerning_heavy'
  | 'forms_document'
  | 'mixed_content'
  | 'ocr_only'
  | 'mixed_ocr_digital'
  | 'protected_text'
  | 'complex_layout';

// ---------------------------------------------------------------------------
// Corpus entry
// ---------------------------------------------------------------------------

export interface CorpusEntry {
  /** Document category identifier. */
  readonly category: CorpusCategory;
  /** Human-readable description of the document type. */
  readonly description: string;
  /** Example file name (may not exist on disk yet). */
  readonly exampleFile: string;
  /**
   * Expected classification for the primary text target in this document.
   * Used to validate classification logic with representative synthetic targets.
   */
  readonly expectedClass: TextMutationSupportClass;
  /**
   * Whether the primary target is expected to be writable.
   * Derived from expectedClass.
   */
  readonly expectedWritable: boolean;
  /**
   * Representative synthetic target for this category.
   * Approximates the structure of the real document type.
   */
  readonly representativeTarget: TextParagraphTarget;
}

// ---------------------------------------------------------------------------
// Representative target builders
// ---------------------------------------------------------------------------

function makeSpan(id: string, text: string, source: 'digital' | 'ocr' = 'digital') {
  return {
    id,
    pageIndex: 0,
    source,
    rect: { x: 10, y: 700, width: Math.max(50, text.length * 7), height: 14 },
    text,
    fontSize: 12,
  };
}

function makeSingleSpanLine(
  id: string,
  text: string,
  source: 'digital' | 'ocr' = 'digital',
) {
  return {
    id: `${id}:l0`,
    pageIndex: 0,
    source,
    rect: { x: 10, y: 700, width: Math.max(50, text.length * 7), height: 14 },
    spans: [makeSpan(`${id}:s0`, text, source)],
  };
}

function makeSingleLineParagraph(id: string, text: string): TextParagraphTarget {
  return {
    id,
    pageIndex: 0,
    source: 'digital',
    rect: { x: 10, y: 700, width: Math.max(50, text.length * 7), height: 14 },
    lines: [makeSingleSpanLine(id, text)],
  };
}

function makeMultiLineParagraph(id: string, lines: string[]): TextParagraphTarget {
  return {
    id,
    pageIndex: 0,
    source: 'digital',
    rect: { x: 10, y: 680, width: 400, height: lines.length * 16 },
    lines: lines.map((text, i) => ({
      id: `${id}:l${i}`,
      pageIndex: 0,
      source: 'digital' as const,
      rect: { x: 10, y: 700 - i * 16, width: Math.max(50, text.length * 7), height: 14 },
      spans: [makeSpan(`${id}:s${i}`, text)],
    })),
  };
}

function makeMultiSpanLine(id: string, spans: string[]): TextParagraphTarget {
  return {
    id,
    pageIndex: 0,
    source: 'digital',
    rect: { x: 10, y: 700, width: 400, height: 14 },
    lines: [
      {
        id: `${id}:l0`,
        pageIndex: 0,
        source: 'digital',
        rect: { x: 10, y: 700, width: 400, height: 14 },
        spans: spans.map((text, i) => ({
          ...makeSpan(`${id}:s${i}`, text),
          rect: { x: 10 + i * 100, y: 700, width: Math.max(50, text.length * 7), height: 14 },
          fontSize: i === 0 ? 14 : 12, // mixed font sizes
        })),
      },
    ],
  };
}

function makeOcrParagraph(id: string, text: string): TextParagraphTarget {
  return {
    id,
    pageIndex: 0,
    source: 'ocr',
    rect: { x: 10, y: 700, width: Math.max(50, text.length * 7), height: 14 },
    lines: [
      {
        id: `${id}:l0`,
        pageIndex: 0,
        source: 'ocr' as const,
        rect: { x: 10, y: 700, width: Math.max(50, text.length * 7), height: 14 },
        spans: [makeSpan(`${id}:s0`, text, 'ocr')],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Full corpus definition
// ---------------------------------------------------------------------------

export const DOCUMENT_CORPUS: readonly CorpusEntry[] = [
  {
    category: 'simple_digital_text',
    description: 'Simple single-line digital text exported from Word / Google Docs',
    exampleFile: 'simple_digital_text/word-export.pdf',
    expectedClass: 'writable_digital_text',
    expectedWritable: true,
    representativeTarget: makeSingleLineParagraph(
      'corpus:simple',
      'Invoice number: 2026-001',
    ),
  },
  {
    category: 'multi_line_paragraph',
    description: 'Long wrapped paragraph spanning multiple lines',
    exampleFile: 'multi_line_paragraph/long-paragraph.pdf',
    expectedClass: 'non_writable_digital_text',
    expectedWritable: false,
    representativeTarget: makeMultiLineParagraph('corpus:multi-line', [
      'This is the first line of a long paragraph that wraps',
      'to a second line in the PDF document.',
    ]),
  },
  {
    category: 'embedded_fonts',
    description: 'Document with subset-embedded fonts (ABCDEF+ prefix)',
    exampleFile: 'embedded_fonts/helvetica-subset.pdf',
    expectedClass: 'writable_digital_text',
    expectedWritable: true,
    representativeTarget: makeSingleLineParagraph(
      'corpus:embedded-font',
      'Embedded font single line',
    ),
  },
  {
    category: 'kerning_heavy',
    description: 'Typography document with tight kerning and multiple font weights',
    exampleFile: 'kerning_heavy/kerned-typography.pdf',
    expectedClass: 'non_writable_digital_text',
    expectedWritable: false,
    representativeTarget: makeMultiSpanLine('corpus:kerning', [
      'Tight', ' kerned', ' headline',
    ]),
  },
  {
    category: 'forms_document',
    description: 'PDF with AcroForm fields — text targets outside form fields',
    exampleFile: 'forms_document/acroform.pdf',
    expectedClass: 'writable_digital_text',
    expectedWritable: true,
    representativeTarget: makeSingleLineParagraph(
      'corpus:forms',
      'Form label text',
    ),
  },
  {
    category: 'mixed_content',
    description: 'Document with both digital text and embedded images',
    exampleFile: 'mixed_content/mixed-layout.pdf',
    expectedClass: 'writable_digital_text',
    expectedWritable: true,
    representativeTarget: makeSingleLineParagraph(
      'corpus:mixed',
      'Caption below image',
    ),
  },
  {
    category: 'ocr_only',
    description: 'Scanned document — all text is OCR overlay',
    exampleFile: 'ocr_only/scanned-invoice.pdf',
    expectedClass: 'ocr_read_only',
    expectedWritable: false,
    representativeTarget: makeOcrParagraph(
      'corpus:ocr-only',
      'Scanned line of text',
    ),
  },
  {
    category: 'mixed_ocr_digital',
    description: 'Document with both OCR overlay and embedded digital text',
    exampleFile: 'mixed_ocr_digital/hybrid-doc.pdf',
    expectedClass: 'ocr_read_only',
    expectedWritable: false,
    representativeTarget: makeOcrParagraph(
      'corpus:mixed-ocr',
      'OCR region in hybrid document',
    ),
  },
  {
    category: 'protected_text',
    description: 'Protected or encrypted document — editing not permitted',
    exampleFile: 'protected_text/protected.pdf',
    expectedClass: 'unknown_structure',
    expectedWritable: false,
    representativeTarget: {
      id: 'corpus:protected',
      pageIndex: 0,
      source: 'digital',
      rect: { x: 10, y: 700, width: 200, height: 14 },
      lines: [], // empty lines represent the protected/unresolvable structure
    },
  },
  {
    category: 'complex_layout',
    description: 'Multi-column complex layout with mixed spans and weights',
    exampleFile: 'complex_layout/multi-column.pdf',
    expectedClass: 'non_writable_digital_text',
    expectedWritable: false,
    representativeTarget: makeMultiSpanLine('corpus:complex', [
      'Column heading', ' body text continues',
    ]),
  },
];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/**
 * Look up a corpus entry by category.
 */
export function getCorpusEntry(category: CorpusCategory): CorpusEntry | undefined {
  return DOCUMENT_CORPUS.find(e => e.category === category);
}

/**
 * Returns all corpus entries expected to be writable.
 */
export function getWritableCorpusEntries(): readonly CorpusEntry[] {
  return DOCUMENT_CORPUS.filter(e => e.expectedWritable);
}

/**
 * Returns all corpus entries expected to be blocked (non-writable).
 */
export function getBlockedCorpusEntries(): readonly CorpusEntry[] {
  return DOCUMENT_CORPUS.filter(e => !e.expectedWritable);
}

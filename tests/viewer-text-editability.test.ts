// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Text Editability Model — Phase 3 Batch 1
 *
 * Verifies:
 * - getEditability() returns correct status for all 7 codes
 * - isEditable(), isSelectable(), isOcrReadOnly() predicates
 * - STATUS_LABELS Dutch strings are present
 * - Annotation tool suppression (any active tool → annotation-tool-active)
 * - Mode gating (only 'edit' mode allows editable status)
 * - extractText() helper
 * - Source readiness of textEditability.ts
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getEditability,
  isEditable,
  isSelectable,
  isOcrReadOnly,
  getEditabilityLabel,
  extractText,
} from '../src/viewer/text/textEditability';
import type { TextParagraphTarget } from '../src/viewer/text/textInteractionModel';
import type { AnnotationTool } from '../src/viewer/components/ModeToolbar';

const __dir = dirname(fileURLToPath(import.meta.url));
const editabilitySrc = readFileSync(
  join(__dir, '../src/viewer/text/textEditability.ts'),
  'utf8',
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeParagraph(overrides: Partial<TextParagraphTarget> = {}): TextParagraphTarget {
  return {
    id: 'p0:par0',
    pageIndex: 0,
    source: 'digital',
    rect: { x: 10, y: 700, width: 200, height: 14 },
    lines: [
      {
        id: 'p0:l0',
        pageIndex: 0,
        source: 'digital',
        rect: { x: 10, y: 700, width: 200, height: 14 },
        spans: [
          {
            id: 'p0:s0',
            pageIndex: 0,
            source: 'digital',
            rect: { x: 10, y: 700, width: 200, height: 14 },
            text: 'Hello world',
            fontSize: 12,
          },
        ],
      },
    ],
    ...overrides,
  };
}

function makeOcrParagraph(): TextParagraphTarget {
  return makeParagraph({
    source: 'ocr',
    lines: [
      {
        id: 'p0:l0',
        pageIndex: 0,
        source: 'ocr',
        rect: { x: 10, y: 700, width: 200, height: 14 },
        spans: [
          {
            id: 'p0:s0',
            pageIndex: 0,
            source: 'ocr',
            rect: { x: 10, y: 700, width: 200, height: 14 },
            text: 'OCR text',
            fontSize: 12,
          },
        ],
      },
    ],
  });
}

function makeEmptyParagraph(): TextParagraphTarget {
  return makeParagraph({
    lines: [
      {
        id: 'p0:l0',
        pageIndex: 0,
        source: 'digital',
        rect: { x: 10, y: 700, width: 200, height: 14 },
        spans: [
          {
            id: 'p0:s0',
            pageIndex: 0,
            source: 'digital',
            rect: { x: 10, y: 700, width: 200, height: 14 },
            text: '   ',
            fontSize: 12,
          },
        ],
      },
    ],
  });
}

function makeManySpanParagraph(spanCount: number): TextParagraphTarget {
  const spans = Array.from({ length: spanCount }, (_, i) => ({
    id: `p0:s${i}`,
    pageIndex: 0,
    source: 'digital' as const,
    rect: { x: i * 5, y: 700, width: 4, height: 12 },
    text: 'x',
    fontSize: 12,
  }));
  return makeParagraph({
    lines: [
      {
        id: 'p0:l0',
        pageIndex: 0,
        source: 'digital',
        rect: { x: 0, y: 700, width: 300, height: 12 },
        spans,
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Source readiness
// ---------------------------------------------------------------------------

describe('textEditability — source readiness', () => {
  it('exports TextEditabilityStatus type', () => {
    expect(editabilitySrc).toContain("'editable'");
    expect(editabilitySrc).toContain("'ocr-read-only'");
    expect(editabilitySrc).toContain("'protected-mode'");
    expect(editabilitySrc).toContain("'annotation-tool-active'");
    expect(editabilitySrc).toContain("'unsupported-structure'");
    expect(editabilitySrc).toContain("'empty-target'");
    expect(editabilitySrc).toContain("'unknown'");
  });

  it('exports TextEditabilityResult interface', () => {
    expect(editabilitySrc).toContain('export interface TextEditabilityResult');
    expect(editabilitySrc).toContain('status: TextEditabilityStatus');
    expect(editabilitySrc).toContain('reason: string');
    expect(editabilitySrc).toContain('label: string');
    expect(editabilitySrc).toContain('selectable: boolean');
  });

  it('exports getEditability function', () => {
    expect(editabilitySrc).toContain('export function getEditability');
  });

  it('exports isEditable, isSelectable, isOcrReadOnly predicates', () => {
    expect(editabilitySrc).toContain('export function isEditable');
    expect(editabilitySrc).toContain('export function isSelectable');
    expect(editabilitySrc).toContain('export function isOcrReadOnly');
  });

  it('exports getEditabilityLabel and extractText helpers', () => {
    expect(editabilitySrc).toContain('export function getEditabilityLabel');
    expect(editabilitySrc).toContain('export function extractText');
  });

  it('has STATUS_LABELS map with Dutch strings', () => {
    expect(editabilitySrc).toContain('STATUS_LABELS');
    expect(editabilitySrc).toContain('Tekst bewerken');
    expect(editabilitySrc).toContain('OCR');
    expect(editabilitySrc).toContain('bewerkingsmodus');
  });
});

// ---------------------------------------------------------------------------
// getEditability — editable path
// ---------------------------------------------------------------------------

describe('getEditability — editable', () => {
  it('returns editable for digital text in edit mode with no tool', () => {
    const result = getEditability(makeParagraph(), 'edit', null);
    expect(result.status).toBe('editable');
    expect(result.selectable).toBe(true);
  });

  it('reason equals status for editable', () => {
    const result = getEditability(makeParagraph(), 'edit', null);
    expect(result.reason).toBe('editable');
  });

  it('label is non-empty for editable', () => {
    const result = getEditability(makeParagraph(), 'edit', null);
    expect(result.label.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// getEditability — annotation-tool-active
// ---------------------------------------------------------------------------

describe('getEditability — annotation-tool-active', () => {
  const tools: AnnotationTool[] = ['highlight', 'underline', 'strikethrough', 'rectangle', 'freehand', 'text', 'stamp'];

  for (const tool of tools) {
    it(`suppresses edit when tool="${tool}" is active (edit mode)`, () => {
      const result = getEditability(makeParagraph(), 'edit', tool);
      expect(result.status).toBe('annotation-tool-active');
      expect(result.selectable).toBe(false);
    });

    it(`suppresses edit when tool="${tool}" is active (non-edit mode)`, () => {
      const result = getEditability(makeParagraph(), 'read', tool);
      expect(result.status).toBe('annotation-tool-active');
    });
  }
});

// ---------------------------------------------------------------------------
// getEditability — protected-mode
// ---------------------------------------------------------------------------

describe('getEditability — protected-mode', () => {
  const nonEditModes = ['read', 'review', 'protect', 'forms', 'organize', 'convert'] as const;

  for (const mode of nonEditModes) {
    it(`returns protected-mode for mode="${mode}"`, () => {
      const result = getEditability(makeParagraph(), mode, null);
      expect(result.status).toBe('protected-mode');
      expect(result.selectable).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// getEditability — empty-target
// ---------------------------------------------------------------------------

describe('getEditability — empty-target', () => {
  it('returns empty-target for whitespace-only paragraph', () => {
    const result = getEditability(makeEmptyParagraph(), 'edit', null);
    expect(result.status).toBe('empty-target');
    expect(result.selectable).toBe(false);
  });

  it('returns empty-target for paragraph with no spans', () => {
    const noSpans = makeParagraph({
      lines: [
        {
          id: 'p0:l0',
          pageIndex: 0,
          source: 'digital',
          rect: { x: 10, y: 700, width: 200, height: 14 },
          spans: [],
        },
      ],
    });
    const result = getEditability(noSpans, 'edit', null);
    expect(result.status).toBe('empty-target');
  });
});

// ---------------------------------------------------------------------------
// getEditability — ocr-read-only
// ---------------------------------------------------------------------------

describe('getEditability — ocr-read-only', () => {
  it('returns ocr-read-only for OCR paragraph in edit mode', () => {
    const result = getEditability(makeOcrParagraph(), 'edit', null);
    expect(result.status).toBe('ocr-read-only');
  });

  it('OCR target is selectable (selectable=true)', () => {
    const result = getEditability(makeOcrParagraph(), 'edit', null);
    expect(result.selectable).toBe(true);
  });

  it('OCR in non-edit mode returns protected-mode (not ocr-read-only)', () => {
    const result = getEditability(makeOcrParagraph(), 'read', null);
    expect(result.status).toBe('protected-mode');
  });
});

// ---------------------------------------------------------------------------
// getEditability — unsupported-structure
// ---------------------------------------------------------------------------

describe('getEditability — unsupported-structure', () => {
  it('returns unsupported-structure for >50 spans', () => {
    const result = getEditability(makeManySpanParagraph(51), 'edit', null);
    expect(result.status).toBe('unsupported-structure');
    expect(result.selectable).toBe(false);
  });

  it('does NOT return unsupported-structure for exactly 50 spans', () => {
    const result = getEditability(makeManySpanParagraph(50), 'edit', null);
    expect(result.status).toBe('editable');
  });

  it('does NOT return unsupported-structure for 1 span', () => {
    const result = getEditability(makeParagraph(), 'edit', null);
    expect(result.status).toBe('editable');
  });
});

// ---------------------------------------------------------------------------
// isEditable predicate
// ---------------------------------------------------------------------------

describe('isEditable', () => {
  it('returns true for digital text in edit mode', () => {
    expect(isEditable(makeParagraph(), 'edit', null)).toBe(true);
  });

  it('returns false in non-edit mode', () => {
    expect(isEditable(makeParagraph(), 'read', null)).toBe(false);
  });

  it('returns false when annotation tool is active', () => {
    expect(isEditable(makeParagraph(), 'edit', 'highlight')).toBe(false);
  });

  it('returns false for OCR text', () => {
    expect(isEditable(makeOcrParagraph(), 'edit', null)).toBe(false);
  });

  it('returns false for empty paragraph', () => {
    expect(isEditable(makeEmptyParagraph(), 'edit', null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isSelectable predicate
// ---------------------------------------------------------------------------

describe('isSelectable', () => {
  it('returns true for editable target', () => {
    expect(isSelectable(makeParagraph(), 'edit', null)).toBe(true);
  });

  it('returns true for OCR target (selectable but not writable)', () => {
    expect(isSelectable(makeOcrParagraph(), 'edit', null)).toBe(true);
  });

  it('returns false for protected-mode target', () => {
    expect(isSelectable(makeParagraph(), 'read', null)).toBe(false);
  });

  it('returns false when annotation tool suppresses interaction', () => {
    expect(isSelectable(makeParagraph(), 'edit', 'rectangle')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isOcrReadOnly predicate
// ---------------------------------------------------------------------------

describe('isOcrReadOnly', () => {
  it('returns true for OCR paragraph', () => {
    expect(isOcrReadOnly(makeOcrParagraph())).toBe(true);
  });

  it('returns false for digital paragraph', () => {
    expect(isOcrReadOnly(makeParagraph())).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getEditabilityLabel
// ---------------------------------------------------------------------------

describe('getEditabilityLabel', () => {
  it('returns Dutch label for editable', () => {
    const label = getEditabilityLabel('editable');
    expect(label).toContain('bewerken');
  });

  it('returns label for all 7 status codes', () => {
    const statuses = [
      'editable',
      'ocr-read-only',
      'protected-mode',
      'annotation-tool-active',
      'unsupported-structure',
      'empty-target',
      'unknown',
    ] as const;
    for (const status of statuses) {
      const label = getEditabilityLabel(status);
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('each status has a distinct label', () => {
    const statuses = [
      'editable',
      'ocr-read-only',
      'protected-mode',
      'annotation-tool-active',
      'unsupported-structure',
      'empty-target',
      'unknown',
    ] as const;
    const labels = statuses.map(getEditabilityLabel);
    const unique = new Set(labels);
    expect(unique.size).toBe(statuses.length);
  });
});

// ---------------------------------------------------------------------------
// extractText helper
// ---------------------------------------------------------------------------

describe('extractText', () => {
  it('returns the joined text from all spans', () => {
    const para = makeParagraph();
    expect(extractText(para)).toContain('Hello world');
  });

  it('returns empty string for paragraph with no spans', () => {
    const noSpans = makeParagraph({
      lines: [
        {
          id: 'p0:l0',
          pageIndex: 0,
          source: 'digital',
          rect: { x: 10, y: 700, width: 200, height: 14 },
          spans: [],
        },
      ],
    });
    expect(extractText(noSpans).trim()).toBe('');
  });

  it('returns whitespace-only string for whitespace-only spans', () => {
    expect(extractText(makeEmptyParagraph()).trim()).toBe('');
  });

  it('concatenates text from multiple lines', () => {
    const multiLine = makeParagraph({
      lines: [
        {
          id: 'p0:l0',
          pageIndex: 0,
          source: 'digital',
          rect: { x: 10, y: 714, width: 200, height: 14 },
          spans: [
            {
              id: 'p0:s0',
              pageIndex: 0,
              source: 'digital',
              rect: { x: 10, y: 714, width: 100, height: 14 },
              text: 'First',
              fontSize: 12,
            },
          ],
        },
        {
          id: 'p0:l1',
          pageIndex: 0,
          source: 'digital',
          rect: { x: 10, y: 700, width: 200, height: 14 },
          spans: [
            {
              id: 'p0:s1',
              pageIndex: 0,
              source: 'digital',
              rect: { x: 10, y: 700, width: 100, height: 14 },
              text: 'Second',
              fontSize: 12,
            },
          ],
        },
      ],
    });
    const text = extractText(multiLine);
    expect(text).toContain('First');
    expect(text).toContain('Second');
  });
});

// ---------------------------------------------------------------------------
// Result shape invariants
// ---------------------------------------------------------------------------

describe('getEditability — result shape', () => {
  it('reason always equals status', () => {
    const cases = [
      getEditability(makeParagraph(), 'edit', null),
      getEditability(makeParagraph(), 'read', null),
      getEditability(makeParagraph(), 'edit', 'highlight'),
      getEditability(makeOcrParagraph(), 'edit', null),
      getEditability(makeEmptyParagraph(), 'edit', null),
      getEditability(makeManySpanParagraph(60), 'edit', null),
    ];
    for (const r of cases) {
      expect(r.reason).toBe(r.status);
    }
  });

  it('editable targets always have selectable=true', () => {
    const r = getEditability(makeParagraph(), 'edit', null);
    expect(r.status).toBe('editable');
    expect(r.selectable).toBe(true);
  });

  it('label is never empty for any result', () => {
    const cases = [
      getEditability(makeParagraph(), 'edit', null),
      getEditability(makeParagraph(), 'read', null),
      getEditability(makeParagraph(), 'edit', 'highlight'),
      getEditability(makeOcrParagraph(), 'edit', null),
      getEditability(makeEmptyParagraph(), 'edit', null),
    ];
    for (const r of cases) {
      expect(r.label.length).toBeGreaterThan(0);
    }
  });
});

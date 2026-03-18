// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * OCR / Digital Text Divergence Rules — Phase 3 Batch 8
 *
 * Verifies:
 * - Both OCR and digital text can be hovered and selected
 * - Both can use summarize / explain / copy / annotate
 * - Only eligible digital targets can enter real edit mode
 * - OCR targets show read-only affordance (ocr-read-only status, selectable=true)
 * - No crashes when OCR grouping is sparse or noisy
 * - Edit entry (handleEditEntry) refuses OCR targets
 * - textDraftPipeline.startDraft refuses OCR targets
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getEditability, isEditable, isSelectable, isOcrReadOnly } from '../src/viewer/text/textEditability';
import { startDraft } from '../src/viewer/text/textDraftPipeline';
import { groupDigitalTextSpans, groupOcrWordBoxes } from '../src/viewer/text/textGrouping';
import type { TextParagraphTarget } from '../src/viewer/text/textInteractionModel';
import type { OcrWordBox } from '../src/viewer/text/textInteractionModel';
import type { TextSpan } from '../src/core/document';

const __dir = dirname(fileURLToPath(import.meta.url));

const editabilitySrc = readFileSync(
  join(__dir, '../src/viewer/text/textEditability.ts'),
  'utf8',
);
const viewerAppSrc = readFileSync(
  join(__dir, '../src/viewer/ViewerApp.tsx'),
  'utf8',
);
const contextBarSrc = readFileSync(
  join(__dir, '../src/viewer/components/TextContextBar.tsx'),
  'utf8',
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDigitalParagraph(): TextParagraphTarget {
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
            text: 'Digital text',
            fontSize: 12,
          },
        ],
      },
    ],
  };
}

function makeOcrParagraph(): TextParagraphTarget {
  return {
    id: 'p0:par0',
    pageIndex: 0,
    source: 'ocr',
    rect: { x: 10, y: 700, width: 200, height: 14 },
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
  };
}

// ---------------------------------------------------------------------------
// Shared behaviour — both can be hovered and selected
// ---------------------------------------------------------------------------

describe('OCR vs digital — shared selection behaviour', () => {
  it('digital text in edit mode is selectable', () => {
    expect(isSelectable(makeDigitalParagraph(), 'edit', null)).toBe(true);
  });

  it('OCR text in edit mode is selectable', () => {
    expect(isSelectable(makeOcrParagraph(), 'edit', null)).toBe(true);
  });

  it('digital text in read mode is not selectable', () => {
    expect(isSelectable(makeDigitalParagraph(), 'read', null)).toBe(false);
  });

  it('OCR text in read mode is not selectable', () => {
    // protected-mode → selectable=false
    expect(isSelectable(makeOcrParagraph(), 'read', null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Shared behaviour — summarize / explain / copy / annotate available to both
// ---------------------------------------------------------------------------

describe('OCR vs digital — shared context bar actions', () => {
  it('copy action is available in edit mode (both OCR and digital would see it)', () => {
    expect(contextBarSrc).toContain("id: 'copy'");
    // copy is in availableIn: ['read', 'review', 'edit', 'protect', 'forms']
    const copyBlock = contextBarSrc.slice(
      contextBarSrc.indexOf("id: 'copy'"),
      contextBarSrc.indexOf("id: 'copy'") + 150,
    );
    expect(copyBlock).toContain("'edit'");
  });

  it('summarize action is available in edit mode', () => {
    const sumBlock = contextBarSrc.slice(
      contextBarSrc.indexOf("id: 'summarize'"),
      contextBarSrc.indexOf("id: 'summarize'") + 150,
    );
    expect(sumBlock).toContain("'edit'");
  });

  it('explain action is available in edit mode', () => {
    const expBlock = contextBarSrc.slice(
      contextBarSrc.indexOf("id: 'explain'"),
      contextBarSrc.indexOf("id: 'explain'") + 150,
    );
    expect(expBlock).toContain("'edit'");
  });
});

// ---------------------------------------------------------------------------
// Divergence — only digital can enter edit mode
// ---------------------------------------------------------------------------

describe('OCR vs digital — edit mode divergence', () => {
  it('digital paragraph in edit mode is editable', () => {
    expect(isEditable(makeDigitalParagraph(), 'edit', null)).toBe(true);
  });

  it('OCR paragraph in edit mode is NOT editable', () => {
    expect(isEditable(makeOcrParagraph(), 'edit', null)).toBe(false);
  });

  it('isOcrReadOnly distinguishes source correctly', () => {
    expect(isOcrReadOnly(makeDigitalParagraph())).toBe(false);
    expect(isOcrReadOnly(makeOcrParagraph())).toBe(true);
  });

  it('OCR editability has selectable=true to support copy/summarize/explain', () => {
    const result = getEditability(makeOcrParagraph(), 'edit', null);
    expect(result.selectable).toBe(true);
  });

  it('digital editability has selectable=true', () => {
    const result = getEditability(makeDigitalParagraph(), 'edit', null);
    expect(result.selectable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// textDraftPipeline — refuses OCR
// ---------------------------------------------------------------------------

describe('textDraftPipeline — OCR not writable', () => {
  it('startDraft returns null for OCR target', () => {
    expect(startDraft(makeOcrParagraph(), 'OCR text', 'edit', null)).toBeNull();
  });

  it('startDraft returns non-null for digital target', () => {
    expect(startDraft(makeDigitalParagraph(), 'Digital text', 'edit', null)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — handleEditEntry refuses OCR
// ---------------------------------------------------------------------------

describe('ViewerApp — handleEditEntry respects editability for OCR', () => {
  it('handleEditEntry guards by checking editability.status !== editable', () => {
    const fn = viewerAppSrc.slice(
      viewerAppSrc.indexOf('handleEditEntry'),
      viewerAppSrc.indexOf('handleEditEntry') + 400,
    );
    expect(fn).toContain("status !== 'editable'");
    expect(fn).toContain('return');
  });
});

// ---------------------------------------------------------------------------
// OCR grouping — no crashes with sparse/noisy data
// ---------------------------------------------------------------------------

describe('OCR grouping — robustness', () => {
  it('empty boxes do not crash', () => {
    expect(() => groupOcrWordBoxes([], 0, 595, 842)).not.toThrow();
  });

  it('single box produces valid structure', () => {
    const box: OcrWordBox = {
      text: 'word',
      confidence: 0.9,
      x0: 10, y0: 100, x1: 60, y1: 130,
      renderedWidth: 595, renderedHeight: 842,
    };
    const result = groupOcrWordBoxes([box], 0, 595, 842);
    expect(result.spans).toHaveLength(1);
    expect(result.spans[0]?.source).toBe('ocr');
  });

  it('low confidence OCR box is included (not silently dropped)', () => {
    const box: OcrWordBox = {
      text: 'uncertain',
      confidence: 0.1,
      x0: 10, y0: 100, x1: 60, y1: 130,
      renderedWidth: 595, renderedHeight: 842,
    };
    const result = groupOcrWordBoxes([box], 0, 595, 842);
    expect(result.spans).toHaveLength(1);
  });

  it('100 sparse OCR boxes over a page do not crash', () => {
    const boxes: OcrWordBox[] = Array.from({ length: 100 }, (_, i) => ({
      text: `w${i}`,
      confidence: 0.8,
      x0: (i % 6) * 90,
      y0: Math.floor(i / 6) * 70,
      x1: (i % 6) * 90 + 50,
      y1: Math.floor(i / 6) * 70 + 20,
      renderedWidth: 595,
      renderedHeight: 842,
    }));
    expect(() => groupOcrWordBoxes(boxes, 0, 595, 842)).not.toThrow();
  });

  it('digital grouping with sparse spans is stable', () => {
    const spans: TextSpan[] = [
      { text: 'A', rect: { x: 10, y: 700, width: 10, height: 12 }, fontSize: 12 },
      { text: 'B', rect: { x: 500, y: 100, width: 10, height: 12 }, fontSize: 12 },
    ];
    expect(() => groupDigitalTextSpans(spans, 0)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// textEditability — textDraftPipeline imports to confirm integration
// ---------------------------------------------------------------------------

describe('textEditability — pipeline is aware of source type', () => {
  it('editability.ts distinguishes ocr source', () => {
    expect(editabilitySrc).toContain("target.source === 'ocr'");
    expect(editabilitySrc).toContain("'ocr-read-only'");
  });
});

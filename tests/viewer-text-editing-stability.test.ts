// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Text Editing Stability — Phase 3 Batch 10
 *
 * Verifies the new editing layer remains stable:
 * - No state leaks or infinite loops in draft pipeline
 * - Inline editor state is idempotent under repeated operations
 * - OCR and digital text coexist without crashes
 * - Editing state resets cleanly on cancel
 * - Editability is consistent under repeated calls (deterministic)
 * - Phase 2 interaction modules still function correctly alongside Phase 3
 * - textDraftPipeline does not mutate input state
 */

import { describe, it, expect } from 'vitest';
import {
  startDraft,
  updateDraft,
  cancelDraft,
  commitDraft,
  createIdleDraftState,
  isDraftActive,
  isDraftDirty,
} from '../src/viewer/text/textDraftPipeline';
import { getEditability, isEditable, extractText } from '../src/viewer/text/textEditability';
import { groupDigitalTextSpans, groupOcrWordBoxes } from '../src/viewer/text/textGrouping';
import { hitTestText } from '../src/viewer/text/textHoverHitTest';
import { getInteractionState } from '../src/viewer/interaction/interactionState';
import { getChromeAttrs } from '../src/viewer/interaction/selectionChrome';
import type { TextParagraphTarget } from '../src/viewer/text/textInteractionModel';
import type { OcrWordBox } from '../src/viewer/text/textInteractionModel';
import type { TextSpan } from '../src/core/document';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function span(text: string, x: number, y: number, w = 60, h = 12): TextSpan {
  return { text, rect: { x, y, width: w, height: h }, fontSize: 12 };
}

function makeParagraph(text = 'Hello world'): TextParagraphTarget {
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
            text,
            fontSize: 12,
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Draft pipeline — immutability
// ---------------------------------------------------------------------------

describe('stability — draft pipeline does not mutate input', () => {
  it('updateDraft returns new object, does not mutate original', () => {
    const state = startDraft(makeParagraph(), 'original', 'edit', null)!;
    const original = { ...state };
    const updated = updateDraft(state, 'modified');
    expect(state.draftText).toBe('original');
    expect(updated.draftText).toBe('modified');
    expect(state).toEqual(original);
  });

  it('cancelDraft returns new idle state, does not mutate input', () => {
    const state = startDraft(makeParagraph(), 'original', 'edit', null)!;
    const stateSnapshot = { ...state };
    const cancelled = cancelDraft(state);
    expect(cancelled.status).toBe('idle');
    expect(state.status).toBe('editing');
    expect(state).toEqual(stateSnapshot);
  });

  it('commitDraft returns new state, does not mutate input', () => {
    const state = startDraft(makeParagraph(), 'original', 'edit', null)!;
    const modified = updateDraft(state, 'changed');
    const modifiedSnapshot = { ...modified };
    const [newState] = commitDraft(modified, 'edit', null);
    expect(modified).toEqual(modifiedSnapshot);
    expect(newState).not.toBe(modified);
  });
});

// ---------------------------------------------------------------------------
// Draft pipeline — sequential operations
// ---------------------------------------------------------------------------

describe('stability — draft pipeline sequential operations', () => {
  it('start → update × 3 → cancel returns to idle', () => {
    let state = startDraft(makeParagraph(), 'original', 'edit', null)!;
    state = updateDraft(state, 'v1');
    state = updateDraft(state, 'v2');
    state = updateDraft(state, 'v3');
    expect(state.draftText).toBe('v3');
    const idle = cancelDraft(state);
    expect(idle.status).toBe('idle');
    expect(idle.target).toBeNull();
  });

  it('start → commit succeeds for changed text', () => {
    const state = startDraft(makeParagraph(), 'original', 'edit', null)!;
    const modified = updateDraft(state, 'new text');
    const [committed, result] = commitDraft(modified, 'edit', null);
    expect(result.success).toBe(true);
    expect(committed.status).toBe('committed');
  });

  it('start → commit with no change produces no-change success', () => {
    const state = startDraft(makeParagraph(), 'original', 'edit', null)!;
    const [idle, result] = commitDraft(state, 'edit', null);
    expect(result.success).toBe(true);
    expect(result.reason).toBe('no-change');
    expect(idle.status).toBe('idle');
  });

  it('isDraftActive reflects pipeline state correctly', () => {
    const idle = createIdleDraftState();
    expect(isDraftActive(idle)).toBe(false);
    const active = startDraft(makeParagraph(), 'text', 'edit', null)!;
    expect(isDraftActive(active)).toBe(true);
    expect(isDraftActive(cancelDraft(active))).toBe(false);
  });

  it('isDraftDirty is false until text changes', () => {
    const state = startDraft(makeParagraph(), 'original', 'edit', null)!;
    expect(isDraftDirty(state)).toBe(false);
    expect(isDraftDirty(updateDraft(state, 'changed'))).toBe(true);
    expect(isDraftDirty(updateDraft(state, 'original'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getEditability — deterministic / stable
// ---------------------------------------------------------------------------

describe('stability — getEditability is deterministic', () => {
  it('same inputs produce identical results', () => {
    const para = makeParagraph();
    const r1 = getEditability(para, 'edit', null);
    const r2 = getEditability(para, 'edit', null);
    expect(r1.status).toBe(r2.status);
    expect(r1.selectable).toBe(r2.selectable);
    expect(r1.label).toBe(r2.label);
  });

  it('mode change changes result predictably', () => {
    const para = makeParagraph();
    expect(getEditability(para, 'edit', null).status).toBe('editable');
    expect(getEditability(para, 'read', null).status).toBe('protected-mode');
  });

  it('calling isEditable 100 times returns same result', () => {
    const para = makeParagraph();
    const results = Array.from({ length: 100 }, () => isEditable(para, 'edit', null));
    expect(results.every(r => r === true)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// extractText — stable across calls
// ---------------------------------------------------------------------------

describe('stability — extractText is stable', () => {
  it('same paragraph produces same text on repeated calls', () => {
    const para = makeParagraph('Stable text');
    expect(extractText(para)).toBe(extractText(para));
  });

  it('multi-span paragraph text contains all spans', () => {
    const para: TextParagraphTarget = {
      id: 'p0:par0',
      pageIndex: 0,
      source: 'digital',
      rect: { x: 10, y: 700, width: 300, height: 14 },
      lines: [
        {
          id: 'p0:l0',
          pageIndex: 0,
          source: 'digital',
          rect: { x: 10, y: 700, width: 300, height: 14 },
          spans: [
            { id: 'p0:s0', pageIndex: 0, source: 'digital', rect: { x: 10, y: 700, width: 80, height: 14 }, text: 'Word1', fontSize: 12 },
            { id: 'p0:s1', pageIndex: 0, source: 'digital', rect: { x: 90, y: 700, width: 80, height: 14 }, text: 'Word2', fontSize: 12 },
            { id: 'p0:s2', pageIndex: 0, source: 'digital', rect: { x: 170, y: 700, width: 80, height: 14 }, text: 'Word3', fontSize: 12 },
          ],
        },
      ],
    };
    const text = extractText(para);
    expect(text).toContain('Word1');
    expect(text).toContain('Word2');
    expect(text).toContain('Word3');
  });
});

// ---------------------------------------------------------------------------
// Phase 2 infrastructure still functional
// ---------------------------------------------------------------------------

describe('stability — Phase 2 modules coexist with Phase 3', () => {
  it('groupDigitalTextSpans still works correctly', () => {
    const spans = [span('a', 10, 700), span('b', 80, 700), span('c', 10, 600)];
    const result = groupDigitalTextSpans(spans, 0);
    expect(result.spans).toHaveLength(3);
    expect(result.lines.length).toBeGreaterThan(0);
    expect(result.paragraphs.length).toBeGreaterThan(0);
  });

  it('groupOcrWordBoxes still works correctly', () => {
    const box: OcrWordBox = {
      text: 'test', confidence: 0.9,
      x0: 10, y0: 100, x1: 80, y1: 130,
      renderedWidth: 595, renderedHeight: 842,
    };
    const result = groupOcrWordBoxes([box], 0, 595, 842);
    expect(result.spans).toHaveLength(1);
    expect(result.spans[0]?.source).toBe('ocr');
  });

  it('hitTestText still works on Phase 2 structure', () => {
    const spans = [span('hit', 100, 400, 50, 12)];
    const structure = groupDigitalTextSpans(spans, 0);
    expect(() => hitTestText(125, 445, structure, 842, 1)).not.toThrow();
  });

  it('getInteractionState still computes Phase 1 states', () => {
    expect(getInteractionState({})).toBe('idle');
    expect(getInteractionState({ isHovered: true })).toBe('hover');
    expect(getInteractionState({ isSelected: true })).toBe('selected');
  });

  it('getChromeAttrs still returns chrome for text-block', () => {
    expect(getChromeAttrs('text-block', 'hover')).not.toBeNull();
    expect(getChromeAttrs('text-block', 'selected')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Edge cases — empty/degenerate inputs
// ---------------------------------------------------------------------------

describe('stability — edge cases in editing layer', () => {
  it('startDraft with empty text produces empty draft', () => {
    // Paragraph with whitespace-only span
    const para: TextParagraphTarget = {
      ...makeParagraph('   '),
    };
    // Empty target → not editable → startDraft returns null
    expect(startDraft(para, '   ', 'edit', null)).toBeNull();
  });

  it('commitDraft on already-committed state returns safe error', () => {
    const state = startDraft(makeParagraph(), 'text', 'edit', null)!;
    const modified = updateDraft(state, 'changed');
    const [committed] = commitDraft(modified, 'edit', null);
    // Commit again on committed state — should return safe error
    const [, result] = commitDraft(committed, 'edit', null);
    expect(result.success).toBe(false);
  });

  it('updateDraft on cancelled state returns same state (no-op)', () => {
    const state = startDraft(makeParagraph(), 'text', 'edit', null)!;
    const cancelled = cancelDraft(state);
    const afterUpdate = updateDraft(cancelled, 'new text');
    expect(afterUpdate).toBe(cancelled);
  });
});

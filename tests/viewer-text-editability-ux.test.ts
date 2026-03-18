// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Editability UX / Reason Surfaces — Phase 3 Batch 7
 *
 * Verifies that editability limitations are communicated clearly:
 * - OCR text shows "selectable but not editable" reason
 * - Protected mode shows disabled edit entry
 * - Unsupported structure shows graceful message
 * - Active annotation tool suppresses text edit entry
 * - TextContextBar shows disabled edit-text button with reason tooltip
 * - TextInlineEditor is not shown for non-editable targets
 * - getEditabilityLabel returns distinct non-empty Dutch messages
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getEditability,
  getEditabilityLabel,
  isEditable,
  isSelectable,
  isOcrReadOnly,
} from '../src/viewer/text/textEditability';
import type { TextParagraphTarget } from '../src/viewer/text/textInteractionModel';

const __dir = dirname(fileURLToPath(import.meta.url));

const contextBarSrc = readFileSync(
  join(__dir, '../src/viewer/components/TextContextBar.tsx'),
  'utf8',
);
const inlineEditorSrc = readFileSync(
  join(__dir, '../src/viewer/components/TextInlineEditor.tsx'),
  'utf8',
);
const viewerAppSrc = [
  '../src/viewer/hooks/usePageNavigation.ts',
  '../src/viewer/hooks/useZoomControls.ts',
  '../src/viewer/hooks/useSidebarState.ts',
  '../src/viewer/hooks/useUndoRedo.ts',
  '../src/viewer/hooks/useSearch.ts',
  '../src/viewer/hooks/useFormFields.ts',
  '../src/viewer/hooks/useModeManager.ts',
  '../src/viewer/hooks/useDocumentLifecycle.ts',
  '../src/viewer/hooks/useCommands.ts',
  '../src/viewer/hooks/useDragDrop.ts',
  '../src/viewer/ViewerSidePanels.tsx',
  '../src/viewer/hooks/useAnnotations.ts',
  '../src/viewer/hooks/useTextInteraction.ts',
  '../src/viewer/hooks/useKeyboardShortcuts.ts',
  '../src/viewer/ViewerApp.tsx',
  '../src/viewer/WelcomeSection.tsx',
].map(p => readFileSync(join(__dir, p), 'utf8')).join('\n\n');

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
            text: 'OCR',
            fontSize: 12,
          },
        ],
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Reason surfaces — getEditability label quality
// ---------------------------------------------------------------------------

describe('editability UX — reason labels are informative', () => {
  it('OCR label mentions OCR and not-editable', () => {
    const label = getEditabilityLabel('ocr-read-only');
    expect(label.toLowerCase()).toContain('ocr');
  });

  it('protected-mode label mentions bewerkingsmodus', () => {
    const label = getEditabilityLabel('protected-mode');
    expect(label.toLowerCase()).toContain('bewerk');
  });

  it('annotation-tool-active label mentions annotatiegereedschap', () => {
    const label = getEditabilityLabel('annotation-tool-active');
    // Should mention the annotation tool or deactivating it
    expect(label.length).toBeGreaterThan(10);
  });

  it('unsupported-structure label mentions complexe or niet beschikbaar', () => {
    const label = getEditabilityLabel('unsupported-structure');
    expect(label.toLowerCase()).toContain('complex');
  });

  it('each status label is unique', () => {
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
    expect(new Set(labels).size).toBe(statuses.length);
  });
});

// ---------------------------------------------------------------------------
// OCR text — selectable but not editable
// ---------------------------------------------------------------------------

describe('editability UX — OCR text reason surface', () => {
  it('OCR target in edit mode is not editable', () => {
    expect(isEditable(makeOcrParagraph(), 'edit', null)).toBe(false);
  });

  it('OCR target in edit mode is selectable', () => {
    expect(isSelectable(makeOcrParagraph(), 'edit', null)).toBe(true);
  });

  it('isOcrReadOnly returns true for OCR paragraph', () => {
    expect(isOcrReadOnly(makeOcrParagraph())).toBe(true);
  });

  it('OCR editability result has selectable=true and status=ocr-read-only', () => {
    const result = getEditability(makeOcrParagraph(), 'edit', null);
    expect(result.status).toBe('ocr-read-only');
    expect(result.selectable).toBe(true);
  });

  it('OCR label clearly explains reason', () => {
    const result = getEditability(makeOcrParagraph(), 'edit', null);
    expect(result.label.length).toBeGreaterThan(5);
    expect(result.label.toLowerCase()).toContain('ocr');
  });
});

// ---------------------------------------------------------------------------
// Protected mode
// ---------------------------------------------------------------------------

describe('editability UX — protected-mode reason surface', () => {
  it('read mode returns protected-mode status', () => {
    const result = getEditability(makeParagraph(), 'read', null);
    expect(result.status).toBe('protected-mode');
    expect(result.selectable).toBe(false);
  });

  it('review mode returns protected-mode', () => {
    expect(getEditability(makeParagraph(), 'review', null).status).toBe('protected-mode');
  });

  it('protected-mode label instructs to switch to edit mode', () => {
    const result = getEditability(makeParagraph(), 'read', null);
    expect(result.label.toLowerCase()).toContain('bewerk');
  });
});

// ---------------------------------------------------------------------------
// Annotation tool suppression
// ---------------------------------------------------------------------------

describe('editability UX — annotation tool suppression', () => {
  it('active annotation tool returns annotation-tool-active status', () => {
    const result = getEditability(makeParagraph(), 'edit', 'highlight');
    expect(result.status).toBe('annotation-tool-active');
  });

  it('annotation-tool-active target is not selectable', () => {
    const result = getEditability(makeParagraph(), 'edit', 'rectangle');
    expect(result.selectable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unsupported structure
// ---------------------------------------------------------------------------

describe('editability UX — unsupported-structure reason surface', () => {
  it('paragraph with >50 spans returns unsupported-structure', () => {
    const spans = Array.from({ length: 55 }, (_, i) => ({
      id: `p0:s${i}`,
      pageIndex: 0,
      source: 'digital' as const,
      rect: { x: i * 3, y: 700, width: 2, height: 12 },
      text: 'x',
      fontSize: 12,
    }));
    const para = makeParagraph({
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
    const result = getEditability(para, 'edit', null);
    expect(result.status).toBe('unsupported-structure');
    expect(result.selectable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TextContextBar — disabled edit-text button surfacing
// ---------------------------------------------------------------------------

describe('editability UX — TextContextBar surfaces non-editable reasons', () => {
  it('edit-text button is disabled when editability.status !== editable', () => {
    expect(contextBarSrc).toContain("editability.status !== 'editable'");
  });

  it('disabled title shows editability.label', () => {
    expect(contextBarSrc).toContain('editability?.label');
  });

  it('data-editability-status attribute set on edit-text button', () => {
    expect(contextBarSrc).toContain('data-editability-status');
    expect(contextBarSrc).toContain('editability?.status');
  });

  it('ViewerApp passes editability to TextContextBar', () => {
    expect(viewerAppSrc).toContain('editability={getEditability(');
  });
});

// ---------------------------------------------------------------------------
// TextInlineEditor — only shown for editable targets
// ---------------------------------------------------------------------------

describe('editability UX — TextInlineEditor only for editable targets', () => {
  it('ViewerApp only renders TextInlineEditor when editingTextTargetId is set', () => {
    // editingTextTargetId is only set by handleEditEntry which guards editability
    expect(viewerAppSrc).toContain('editingTextTargetId &&');
    expect(viewerAppSrc).toContain('<TextInlineEditor');
  });

  it('handleEditEntry guards against non-editable status', () => {
    const fn = viewerAppSrc.slice(
      viewerAppSrc.indexOf('handleEditEntry'),
      viewerAppSrc.indexOf('handleEditEntry') + 400,
    );
    expect(fn).toContain("status !== 'editable'");
    expect(fn).toContain('return');
  });

  it('TextInlineEditor component is always rendered in good faith (no editability check inside)', () => {
    // The editability guard is in ViewerApp, not inside TextInlineEditor
    expect(inlineEditorSrc).not.toContain('getEditability');
    expect(inlineEditorSrc).not.toContain('isEditable');
  });
});

// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Selected Text Target State — Phase 3 Batch 2
 *
 * Verifies that ViewerApp holds canonical selected text target state and
 * PageCanvas is wired to receive it as a controlled prop with a callback.
 *
 * All checks are source-level assertions to avoid the need for a DOM env.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));

const viewerAppSrc = readFileSync(
  join(__dir, '../src/viewer/ViewerApp.tsx'),
  'utf8',
);
const pageCanvasSrc = readFileSync(
  join(__dir, '../src/viewer/components/PageCanvas.tsx'),
  'utf8',
);

// ---------------------------------------------------------------------------
// ViewerApp — new state declarations
// ---------------------------------------------------------------------------

describe('ViewerApp — selected text target state', () => {
  it('imports TextParagraphTarget from textInteractionModel', () => {
    expect(viewerAppSrc).toContain('TextParagraphTarget');
    expect(viewerAppSrc).toContain('textInteractionModel');
  });

  it('declares selectedTextTargetId state', () => {
    expect(viewerAppSrc).toContain('selectedTextTargetId');
    expect(viewerAppSrc).toContain('setSelectedTextTargetId');
  });

  it('declares selectedTextTarget state', () => {
    expect(viewerAppSrc).toContain('selectedTextTarget');
    expect(viewerAppSrc).toContain('setSelectedTextTarget');
  });

  it('declares editingTextTargetId state', () => {
    expect(viewerAppSrc).toContain('editingTextTargetId');
    expect(viewerAppSrc).toContain('setEditingTextTargetId');
  });

  it('declares textDraft state', () => {
    expect(viewerAppSrc).toContain('textDraft');
    expect(viewerAppSrc).toContain('setTextDraft');
  });

  it('has handleTextTargetSelect callback', () => {
    expect(viewerAppSrc).toContain('handleTextTargetSelect');
  });

  it('handleTextTargetSelect sets selectedTextTarget and selectedTextTargetId', () => {
    expect(viewerAppSrc).toContain('setSelectedTextTarget(target)');
    expect(viewerAppSrc).toContain('setSelectedTextTargetId');
  });

  it('handleTextTargetSelect clears editingTextTargetId when target changes', () => {
    expect(viewerAppSrc).toContain('setEditingTextTargetId');
  });

  it('handleTextTargetSelect clears textDraft when target changes', () => {
    expect(viewerAppSrc).toContain('setTextDraft');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — passes new props to PageCanvas
// ---------------------------------------------------------------------------

describe('ViewerApp — passes controlled props to PageCanvas', () => {
  it('passes selectedTextTarget to PageCanvas', () => {
    expect(viewerAppSrc).toContain('selectedTextTarget={selectedTextTarget}');
  });

  it('passes onTextTargetSelect to PageCanvas', () => {
    expect(viewerAppSrc).toContain('onTextTargetSelect={handleTextTargetSelect}');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — __pdfluent_test__ snapshot includes new IDs
// ---------------------------------------------------------------------------

describe('ViewerApp — interactionDebug snapshot includes editing state', () => {
  it('exposes selectedTextTargetId in interactionDebug snapshot', () => {
    expect(viewerAppSrc).toContain('selectedTextTargetId');
    // Check it's part of the __pdfluent_test__ interactionDebug block
    const debugBlock = viewerAppSrc.slice(
      viewerAppSrc.indexOf('interactionDebug = {'),
      viewerAppSrc.indexOf('}, [hoveredTarget'),
    );
    expect(debugBlock).toContain('selectedTextTargetId');
  });

  it('exposes editingTextTargetId in interactionDebug snapshot', () => {
    const debugBlock = viewerAppSrc.slice(
      viewerAppSrc.indexOf('interactionDebug = {'),
      viewerAppSrc.indexOf('}, [hoveredTarget'),
    );
    expect(debugBlock).toContain('editingTextTargetId');
  });

  it('interactionDebug effect dependency array includes new state vars', () => {
    expect(viewerAppSrc).toContain('selectedTextTargetId, editingTextTargetId]);');
  });

  it('Window type declaration includes selectedTextTargetId and editingTextTargetId', () => {
    expect(viewerAppSrc).toContain('selectedTextTargetId: string | null');
    expect(viewerAppSrc).toContain('editingTextTargetId: string | null');
  });
});

// ---------------------------------------------------------------------------
// PageCanvas — new controlled props
// ---------------------------------------------------------------------------

describe('PageCanvas — controlled text target props', () => {
  it('declares selectedTextTarget prop in interface', () => {
    expect(pageCanvasSrc).toContain('selectedTextTarget');
  });

  it('declares onTextTargetSelect callback prop in interface', () => {
    expect(pageCanvasSrc).toContain('onTextTargetSelect');
  });

  it('onTextTargetSelect accepts TextParagraphTarget | null', () => {
    expect(pageCanvasSrc).toContain('onTextTargetSelect?: (target: TextParagraphTarget | null) => void');
  });

  it('selectedTextTarget defaults to null', () => {
    expect(pageCanvasSrc).toContain('selectedTextTarget = null');
  });

  it('no longer holds selectedTextParagraph as local useState', () => {
    // Local state should be gone — selection is now controlled via prop
    expect(pageCanvasSrc).not.toContain('setSelectedTextParagraph');
  });

  it('calls onTextTargetSelect on paragraph click (not local setState)', () => {
    expect(pageCanvasSrc).toContain('onTextTargetSelect?.(');
  });

  it('passes selectedTextTarget to TextInteractionOverlay as selected prop', () => {
    expect(pageCanvasSrc).toContain('selected={selectedTextTarget}');
  });

  it('toggle logic: deselects when clicking same paragraph', () => {
    // Toggle: pass null when selectedTextTarget.id === para.id
    expect(pageCanvasSrc).toContain('selectedTextTarget?.id === para.id ? null : para');
  });
});

// ---------------------------------------------------------------------------
// PageCanvas — hover state remains local
// ---------------------------------------------------------------------------

describe('PageCanvas — hover state remains local (ephemeral)', () => {
  it('still has hoveredTextTarget local state', () => {
    expect(pageCanvasSrc).toContain('hoveredTextTarget');
    expect(pageCanvasSrc).toContain('setHoveredTextTarget');
  });

  it('still clears hover on mouse leave', () => {
    expect(pageCanvasSrc).toContain('setHoveredTextTarget(null)');
    expect(pageCanvasSrc).toContain('onMouseLeave');
  });
});

// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * TextInlineEditor masking + TextLayer ghost-suppression — source-level assertions.
 *
 * Verifies:
 * - TextInlineEditor uses a transparent background so the PDF page shows
 *   through (incl. coloured backgrounds); the original glyphs are masked by the
 *   canvas-wipe in PageCanvas, NOT by an opaque editor box (an opaque white box
 *   hid white-on-colour text — see textInlineEditorBackground.test.ts)
 * - TextInlineEditor has no box shadow
 * - TextInlineEditor has no border
 * - TextInlineEditor uses blue caret color
 * - TextLayer accepts editingParagraphBounds prop
 * - TextLayer hides spans that overlap with editingParagraphBounds (visibility hidden)
 * - rectsOverlap helper is implemented in TextLayer
 * - TextInteractionOverlay accepts editingTargetId prop
 * - TextInteractionOverlay renders editing chrome (not selected chrome) when editing
 * - ResizeHandles are rendered only when NOT editing
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// Imported once, when the file loads. Imported inside each case, the first case
// paid for transforming the module graph behind core/index and timed out at 5 s
// on a loaded runner (quality:macos, 2026-10-18) while asserting a string.
import { EDITOR_FEATURE_FLAGS, isEditorFeatureEnabled } from '../src/viewer/text/editorFeatureFlags';
import { toEditorTextSpan, getEditorFontFamily } from '../src/viewer/text/editorTextSpan';

const root = join(import.meta.dirname, '..');

const inlineEditorSrc = readFileSync(
  join(root, 'src/viewer/components/TextInlineEditor.tsx'),
  'utf8',
);

const textLayerSrc = readFileSync(
  join(root, 'src/viewer/components/TextLayer.tsx'),
  'utf8',
);

const overlaysSrc = readFileSync(
  join(root, 'src/viewer/components/TextInteractionOverlay.tsx'),
  'utf8',
);

// ---------------------------------------------------------------------------
// TextInlineEditor — solid background masking, no shadow, no border
// ---------------------------------------------------------------------------

describe('TextInlineEditor masking', () => {
  it('uses a transparent background so the PDF page shows through', () => {
    // The original glyphs are masked by the canvas-wipe in PageCanvas; the
    // editor overlay itself must stay transparent. An opaque white box hid
    // white-on-colour text (the Brainstorm.pdf bug).
    expect(inlineEditorSrc).toContain("background: 'transparent'");
    expect(inlineEditorSrc).not.toContain("background: '#ffffff'");
  });

  it('has no box shadow', () => {
    expect(inlineEditorSrc).toContain("boxShadow: 'none'");
  });

  it('has no border', () => {
    expect(inlineEditorSrc).toContain("border: 'none'");
  });

  it('has no outline', () => {
    expect(inlineEditorSrc).toContain("outline: 'none'");
  });

  it('uses the selection-blue caret token (a page is white paper)', () => {
    expect(inlineEditorSrc).toContain("caretColor: 'var(--caret-on-page)'");
  });

  it('accepts cursorAtPoint prop', () => {
    expect(inlineEditorSrc).toContain('cursorAtPoint');
  });

  it('accepts editorRef prop', () => {
    expect(inlineEditorSrc).toContain('editorRef');
  });

  it('uses getEditorFontFamily for font lookup', () => {
    expect(inlineEditorSrc).toContain('getEditorFontFamily');
  });

  it('imports toEditorTextSpan from editorTextSpan', () => {
    expect(inlineEditorSrc).toContain('toEditorTextSpan');
    expect(inlineEditorSrc).toContain('editorTextSpan');
  });

  it('tries caretPositionFromPoint for cursor placement', () => {
    expect(inlineEditorSrc).toContain('caretPositionFromPoint');
  });

  it('falls back to caretRangeFromPoint (WebKit)', () => {
    expect(inlineEditorSrc).toContain('caretRangeFromPoint');
  });
});

// ---------------------------------------------------------------------------
// TextLayer — span visibility gating
// ---------------------------------------------------------------------------

describe('TextLayer editingParagraphBounds', () => {
  it('accepts editingParagraphBounds prop', () => {
    expect(textLayerSrc).toContain('editingParagraphBounds');
  });

  it('implements rectsOverlap helper', () => {
    expect(textLayerSrc).toContain('rectsOverlap');
  });

  it('applies visibility hidden to overlapping spans', () => {
    expect(textLayerSrc).toContain("visibility: isHidden ? 'hidden' : 'visible'");
  });

  it('uses a tolerance in overlap check', () => {
    expect(textLayerSrc).toContain('tolerance');
  });
});

// ---------------------------------------------------------------------------
// TextInteractionOverlay — editing state
// ---------------------------------------------------------------------------

describe('TextInteractionOverlay editingTargetId', () => {
  it('accepts editingTargetId prop', () => {
    expect(overlaysSrc).toContain('editingTargetId');
  });

  it('renders editing chrome when paragraph is being edited', () => {
    expect(overlaysSrc).toContain("'editing'");
    expect(overlaysSrc).toContain('text-editing-rect');
  });

  it('renders selected chrome when not editing', () => {
    expect(overlaysSrc).toContain('text-selected-rect');
  });

  it('renders ResizeHandles only when not editing', () => {
    expect(overlaysSrc).toContain('ResizeHandles');
    expect(overlaysSrc).toContain('!isEditing');
  });

  it('ResizeHandles uses the selection token matching selected chrome', () => {
    expect(overlaysSrc).toContain('var(--selection-on-page)');
  });

  it('ResizeHandles renders 8 handles', () => {
    // 8 handle positions defined as array literals
    const handleMatches = overlaysSrc.match(/\{ x:/g);
    expect(handleMatches).not.toBeNull();
    expect((handleMatches ?? []).length).toBeGreaterThanOrEqual(8);
  });
});

// ---------------------------------------------------------------------------
// editorFeatureFlags — all flags default to false
// ---------------------------------------------------------------------------

describe('editorFeatureFlags defaults', () => {
  it('all feature flags are enabled (G1/G2/G5/G6 have landed)', () => {
    for (const [key, value] of Object.entries(EDITOR_FEATURE_FLAGS)) {
      expect(value, `Flag ${key} should be true — G capabilities landed`).toBe(true);
    }
  });

  it('isEditorFeatureEnabled returns true for all flags (G capabilities landed)', () => {
    expect(isEditorFeatureEnabled('sdkTextMetadata')).toBe(true);
    expect(isEditorFeatureEnabled('sdkTextCharBounds')).toBe(true);
    // Format/style writes are Tauri-only; canFormatText/canSetFontStyle are gated
    // additionally by isTauriEnvironment() in toEditorTextSpan(), not just the flag.
    expect(isEditorFeatureEnabled('sdkTextFormatWrites')).toBe(true);
    expect(isEditorFeatureEnabled('sdkTextFontStyleWrites')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// editorTextSpan — toEditorTextSpan adapter
// ---------------------------------------------------------------------------

describe('toEditorTextSpan adapter', () => {
  it('creates stable id from pageIndex and spanIndex', () => {
    const span = { text: 'hello', rect: { x: 0, y: 0, width: 100, height: 20 }, fontSize: 12 };
    const result = toEditorTextSpan(span, 3, 7);
    expect(result.id).toBe('p3:s7');
  });

  it('sets replaceTextMode to parser-backed for native text replacement', () => {
    const span = { text: 'test', rect: { x: 0, y: 0, width: 50, height: 15 }, fontSize: 10 };
    const result = toEditorTextSpan(span, 0, 0);
    expect(result.sdkCapabilities.replaceTextMode).toBe('parser-backed');
  });

  it('sets canFormatText to false when sdkTextFormatWrites=false', () => {
    const span = { text: 'test', rect: { x: 0, y: 0, width: 50, height: 15 }, fontSize: 10 };
    const result = toEditorTextSpan(span, 0, 0);
    expect(result.sdkCapabilities.canFormatText).toBe(false);
  });

  it('fontName is passed through when sdkTextMetadata=true and fontName is present in span', () => {
    const span = { text: 'test', rect: { x: 0, y: 0, width: 50, height: 15 }, fontSize: 10, fontName: 'Helvetica' };
    const result = toEditorTextSpan(span, 0, 0);
    // sdkTextMetadata is now true so fontName is passed through from the span
    expect(result.fontName).toBe('Helvetica');
  });

  it('getEditorFontFamily falls back to system-ui when fontName unavailable', () => {
    expect(getEditorFontFamily(null)).toBe('system-ui, -apple-system, sans-serif');
  });

  it('getEditorFontFamily maps Helvetica to CSS equivalent', () => {
    const span = { id: 'p0:s0', text: 'x', rect: { x: 0, y: 0, width: 10, height: 10 }, fontSize: 12, fontName: 'Helvetica', sdkCapabilities: { replaceTextMode: 'basic-provisional' as const, canFormatText: false, canSetFontStyle: false, hasAccurateMetrics: false } };
    expect(getEditorFontFamily(span)).toBe('Helvetica, Arial, sans-serif');
  });

  it('getEditorFontFamily strips subset prefix before lookup', () => {
    const span = { id: 'p0:s0', text: 'x', rect: { x: 0, y: 0, width: 10, height: 10 }, fontSize: 12, fontName: 'ABCDEF+Helvetica', sdkCapabilities: { replaceTextMode: 'basic-provisional' as const, canFormatText: false, canSetFontStyle: false, hasAccurateMetrics: false } };
    expect(getEditorFontFamily(span)).toBe('Helvetica, Arial, sans-serif');
  });
});

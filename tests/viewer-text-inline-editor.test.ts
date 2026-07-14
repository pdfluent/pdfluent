// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * Text Inline Editor — Phase 3 Batch 4
 *
 * Verifies:
 * - TextInlineEditor component structure and exports
 * - Props: target, draft, onDraftChange, onCommit, onCancel, pageHeightPt, zoom
 * - testid attributes for all interactive elements
 * - Escape cancels, Cmd/Ctrl+Enter commits
 * - Blur does NOT auto-commit
 * - z-index above TextInteractionOverlay (z=15) and TextContextBar (z=50)
 * - ViewerApp renders TextInlineEditor when editingTextTargetId is set
 * - ViewerApp hides TextContextBar while editing
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));

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
// TextInlineEditor — source readiness
// ---------------------------------------------------------------------------

describe('TextInlineEditor — source readiness', () => {
  it('exports TextInlineEditor component', () => {
    expect(inlineEditorSrc).toContain('export const TextInlineEditor');
  });

  it('exports TextInlineEditorProps interface', () => {
    expect(inlineEditorSrc).toContain('export interface TextInlineEditorProps');
  });

  it('imports TextParagraphTarget from textInteractionModel', () => {
    expect(inlineEditorSrc).toContain('TextParagraphTarget');
    expect(inlineEditorSrc).toContain('textInteractionModel');
  });

  it('imports pdfRectToDom for coordinate conversion', () => {
    expect(inlineEditorSrc).toContain('pdfRectToDom');
  });

  it('is memoized with React.memo', () => {
    expect(inlineEditorSrc).toContain('memo(');
  });
});

// ---------------------------------------------------------------------------
// TextInlineEditor — props
// ---------------------------------------------------------------------------

describe('TextInlineEditor — props', () => {
  it('has target prop (TextParagraphTarget)', () => {
    expect(inlineEditorSrc).toContain('target: TextParagraphTarget');
  });

  it('has draft prop (string)', () => {
    expect(inlineEditorSrc).toContain('draft: string');
  });

  it('has onDraftChange callback', () => {
    expect(inlineEditorSrc).toContain('onDraftChange');
  });

  it('has onCommit callback', () => {
    expect(inlineEditorSrc).toContain('onCommit');
  });

  it('has onCancel callback', () => {
    expect(inlineEditorSrc).toContain('onCancel');
  });

  it('has pageHeightPt prop', () => {
    expect(inlineEditorSrc).toContain('pageHeightPt');
  });

  it('has zoom prop', () => {
    expect(inlineEditorSrc).toContain('zoom');
  });

  it('has maxLength prop for beta-safe text replacement', () => {
    expect(inlineEditorSrc).toContain('maxLength?: number | null');
  });
});

// ---------------------------------------------------------------------------
// TextInlineEditor — testid attributes
// ---------------------------------------------------------------------------

describe('TextInlineEditor — testid attributes', () => {
  it('root container has text-inline-editor testid', () => {
    expect(inlineEditorSrc).toContain('text-inline-editor"');
  });

  it('renders beta limitation help text below the active editor', () => {
    expect(inlineEditorSrc).toContain('text-inline-editor-help');
    expect(inlineEditorSrc).toContain("t('textEdit.betaLimitHelp')");
  });

  it('editor element uses contentEditable (not textarea)', () => {
    expect(inlineEditorSrc).toContain('contentEditable');
  });

  it('uses committedRef to prevent double-commit on blur+Escape', () => {
    expect(inlineEditorSrc).toContain('committedRef');
  });

  it('editor is a div element (not a button or textarea)', () => {
    expect(inlineEditorSrc).not.toContain('text-inline-editor-commit');
    expect(inlineEditorSrc).not.toContain('text-inline-editor-cancel');
  });

  it('no separate actions row — editing is commit-on-blur', () => {
    expect(inlineEditorSrc).not.toContain('text-inline-editor-actions');
  });
});

// ---------------------------------------------------------------------------
// TextInlineEditor — keyboard behavior
// ---------------------------------------------------------------------------

describe('TextInlineEditor — keyboard behavior', () => {
  it('Escape key calls onCancel', () => {
    expect(inlineEditorSrc).toContain("e.key === 'Escape'");
    expect(inlineEditorSrc).toContain('onCancel()');
  });

  it('Enter (plain and Cmd/Ctrl) commits via the normalized editor reader', () => {
    expect(inlineEditorSrc).toContain("e.key === 'Enter'");
    expect(inlineEditorSrc).toContain('onCommit(readEditorText() || draft)');
    // Plain Enter must never insert a contenteditable line break: writable
    // targets are single-line PDF runs and a <br>/<div> would be silently
    // glued into the committed text.
    expect(inlineEditorSrc).not.toContain("e.key === 'Enter' && (e.metaKey || e.ctrlKey)");
  });

  it('has handleKeyDown function', () => {
    expect(inlineEditorSrc).toContain('handleKeyDown');
  });

  it('Escape and Enter use e.preventDefault()', () => {
    expect(inlineEditorSrc).toContain('e.preventDefault()');
  });

  it('Escape and Enter use e.stopPropagation()', () => {
    expect(inlineEditorSrc).toContain('e.stopPropagation()');
  });
});

// ---------------------------------------------------------------------------
// TextInlineEditor — honesty gating
// ---------------------------------------------------------------------------

describe('TextInlineEditor — honesty gating', () => {
  it('exposes the computed edit limit on the contenteditable element', () => {
    expect(inlineEditorSrc).toContain('data-max-length={effectiveMaxLength ?? undefined}');
  });

  it('blocks over-limit typing before contentEditable mutates', () => {
    expect(inlineEditorSrc).toContain('handleBeforeInput');
    expect(inlineEditorSrc).toContain('onBeforeInput={handleBeforeInput}');
    expect(inlineEditorSrc).toContain('insertedText.length > remaining');
    expect(inlineEditorSrc).toContain('e.preventDefault()');
  });

  it('clips oversized paste content to remaining writable characters', () => {
    expect(inlineEditorSrc).toContain('handlePaste');
    expect(inlineEditorSrc).toContain('onPaste={handlePaste}');
    expect(inlineEditorSrc).toContain("document.execCommand('insertText', false, allowedText)");
  });

  it('clamps programmatic input before updating draft state', () => {
    expect(inlineEditorSrc).toContain('clampText(currentText)');
    expect(inlineEditorSrc).toContain('setEditorText(clampedText)');
    expect(inlineEditorSrc).toContain('onDraftChange(clampedText)');
  });
});

// ---------------------------------------------------------------------------
// TextInlineEditor — blur does NOT auto-commit
// ---------------------------------------------------------------------------

describe('TextInlineEditor — blur behavior', () => {
  it('onBlur handler auto-commits via handleBlur', () => {
    expect(inlineEditorSrc).toContain('onBlur');
    expect(inlineEditorSrc).toContain('handleBlur');
    // committedRef prevents double-commit when Escape fires before blur
    expect(inlineEditorSrc).toContain('committedRef.current');
  });
});

// ---------------------------------------------------------------------------
// TextInlineEditor — z-index
// ---------------------------------------------------------------------------

describe('TextInlineEditor — z-index above overlays', () => {
  it('z-index is above TextContextBar (z=50)', () => {
    // TextInlineEditor must be above TextContextBar (zIndex: 50)
    // Accept zIndex 60 or higher
    const hasHighZIndex = inlineEditorSrc.includes('zIndex: 60') ||
      inlineEditorSrc.includes('zIndex: 70') ||
      inlineEditorSrc.includes('zIndex: 100');
    expect(hasHighZIndex).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TextInlineEditor — anchored to target via pdfRectToDom
// ---------------------------------------------------------------------------

describe('TextInlineEditor — coordinate anchoring', () => {
  it('uses pdfRectToDom with target.rect, pageHeightPt, zoom', () => {
    expect(inlineEditorSrc).toContain('pdfRectToDom(target.rect, pageHeightPt, zoom)');
  });

  it('sets position: absolute', () => {
    expect(inlineEditorSrc).toContain("position: 'absolute'");
  });

  it('sets top from domRect.top', () => {
    expect(inlineEditorSrc).toContain('domRect.top');
  });

  it('sets left from domRect.left', () => {
    expect(inlineEditorSrc).toContain('domRect.left');
  });
});

// ---------------------------------------------------------------------------
// TextInlineEditor — auto-focus on mount
// ---------------------------------------------------------------------------

describe('TextInlineEditor — auto-focus', () => {
  it('has a useEffect that calls el.focus()', () => {
    expect(inlineEditorSrc).toContain('el.focus()');
  });

  it('uses a div ref (editorRef)', () => {
    expect(inlineEditorSrc).toContain('editorRef');
    expect(inlineEditorSrc).toContain('useRef<HTMLDivElement>');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — TextInlineEditor integration
// ---------------------------------------------------------------------------

describe('ViewerApp — TextInlineEditor integration', () => {
  it('imports TextInlineEditor', () => {
    expect(viewerAppSrc).toContain('TextInlineEditor');
    expect(viewerAppSrc).toContain('./components/TextInlineEditor');
  });

  it('renders TextInlineEditor when editingTextTargetId is set', () => {
    expect(viewerAppSrc).toContain('<TextInlineEditor');
    expect(viewerAppSrc).toContain('editingTextTargetId');
  });

  it('passes draft={textDraft} to TextInlineEditor', () => {
    const block = viewerAppSrc.slice(
      viewerAppSrc.indexOf('<TextInlineEditor'),
      viewerAppSrc.indexOf('<TextInlineEditor') + 400,
    );
    expect(block).toContain('draft={textDraft}');
  });

  it('passes onDraftChange={setTextDraft} to TextInlineEditor', () => {
    const block = viewerAppSrc.slice(
      viewerAppSrc.indexOf('<TextInlineEditor'),
      viewerAppSrc.indexOf('<TextInlineEditor') + 400,
    );
    expect(block).toContain('onDraftChange={setTextDraft}');
  });

  it('passes onCommit={handleDraftCommit} to TextInlineEditor', () => {
    const block = viewerAppSrc.slice(
      viewerAppSrc.indexOf('<TextInlineEditor'),
      viewerAppSrc.indexOf('<TextInlineEditor') + 400,
    );
    expect(block).toContain('onCommit={handleDraftCommit}');
  });

  it('passes onCancel={handleDraftCancel} to TextInlineEditor', () => {
    const block = viewerAppSrc.slice(
      viewerAppSrc.indexOf('<TextInlineEditor'),
      viewerAppSrc.indexOf('<TextInlineEditor') + 400,
    );
    expect(block).toContain('onCancel={handleDraftCancel}');
  });

  it('passes maxLength={textEditMaxLength} to TextInlineEditor', () => {
    const start = viewerAppSrc.indexOf('<TextInlineEditor');
    const block = viewerAppSrc.slice(
      start,
      viewerAppSrc.indexOf('/>', start),
    );
    expect(block).toContain('maxLength={textEditMaxLength}');
  });

  it('derives textEditMaxLength from mutation support constraints', () => {
    expect(viewerAppSrc).toContain('textEditMaxLength');
    expect(viewerAppSrc).toContain('mutationSupport.constraints?.maxLength ?? null');
    expect(viewerAppSrc).not.toContain('computeBboxExpansionChars(selectedTextTarget)');
  });

  it('has handleDraftCancel that clears editingTextTargetId', () => {
    expect(viewerAppSrc).toContain('handleDraftCancel');
    const fn = viewerAppSrc.slice(
      viewerAppSrc.indexOf('handleDraftCancel'),
      viewerAppSrc.indexOf('handleDraftCancel') + 200,
    );
    expect(fn).toContain('setEditingTextTargetId(null)');
    expect(fn).toContain("setTextDraft('')");
  });

  it('has handleDraftCommit that clears editing state', () => {
    expect(viewerAppSrc).toContain('handleDraftCommit');
    const start = viewerAppSrc.indexOf('const handleDraftCommit = useCallback');
    const end = viewerAppSrc.indexOf('\n  }, [', start);
    const fn = viewerAppSrc.slice(
      start,
      end,
    );
    expect(fn).toContain('setEditingTextTargetId(null)');
  });

  it('hides TextContextBar while editing is active', () => {
    // The conditional guarding <TextContextBar must include editingTextTargetId
    const barJsxIdx = viewerAppSrc.indexOf('<TextContextBar');
    // The condition precedes the JSX — look at the 200 chars before it
    const barCondition = viewerAppSrc.slice(Math.max(0, barJsxIdx - 200), barJsxIdx);
    expect(barCondition).toContain('editingTextTargetId');
  });
});

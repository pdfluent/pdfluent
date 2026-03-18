// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
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
});

// ---------------------------------------------------------------------------
// TextInlineEditor — testid attributes
// ---------------------------------------------------------------------------

describe('TextInlineEditor — testid attributes', () => {
  it('root container has text-inline-editor testid', () => {
    expect(inlineEditorSrc).toContain('text-inline-editor"');
  });

  it('textarea has text-inline-editor-textarea testid', () => {
    expect(inlineEditorSrc).toContain('text-inline-editor-textarea');
  });

  it('commit button has text-inline-editor-commit testid', () => {
    expect(inlineEditorSrc).toContain('text-inline-editor-commit');
  });

  it('cancel button has text-inline-editor-cancel testid', () => {
    expect(inlineEditorSrc).toContain('text-inline-editor-cancel');
  });

  it('actions row has text-inline-editor-actions testid', () => {
    expect(inlineEditorSrc).toContain('text-inline-editor-actions');
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

  it('Cmd/Ctrl+Enter calls onCommit', () => {
    expect(inlineEditorSrc).toContain("e.key === 'Enter'");
    expect(inlineEditorSrc).toContain('e.metaKey || e.ctrlKey');
    expect(inlineEditorSrc).toContain('onCommit(draft)');
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
// TextInlineEditor — blur does NOT auto-commit
// ---------------------------------------------------------------------------

describe('TextInlineEditor — blur behavior', () => {
  it('onBlur handler is a no-op (does not auto-commit)', () => {
    expect(inlineEditorSrc).toContain('onBlur');
    // The onBlur should NOT call onCommit
    const blurSection = inlineEditorSrc.slice(
      inlineEditorSrc.indexOf('onBlur'),
      inlineEditorSrc.indexOf('onBlur') + 60,
    );
    expect(blurSection).not.toContain('onCommit');
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

  it('uses a textarea ref', () => {
    expect(inlineEditorSrc).toContain('textareaRef');
    expect(inlineEditorSrc).toContain('useRef<HTMLTextAreaElement>');
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
    const fn = viewerAppSrc.slice(
      viewerAppSrc.indexOf('handleDraftCommit'),
      viewerAppSrc.indexOf('handleDraftCommit') + 300,
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

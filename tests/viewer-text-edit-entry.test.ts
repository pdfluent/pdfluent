// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Edit Entry Triggers — Phase 3 Batch 3
 *
 * Verifies:
 * - TextContextBar has an 'edit-text' action
 * - PageCanvas has double-click trigger (onTextTargetDoubleClick)
 * - ViewerApp has handleEditEntry wired to double-click and Enter key
 * - handleEditEntry respects editability (only enters edit mode for editable targets)
 * - TextContextBar passes editability to disable the edit-text button when not editable
 * - Source readiness checks for all involved files
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
const contextBarSrc = readFileSync(
  join(__dir, '../src/viewer/components/TextContextBar.tsx'),
  'utf8',
);

// ---------------------------------------------------------------------------
// TextContextBar — edit-text action
// ---------------------------------------------------------------------------

describe('TextContextBar — edit-text action', () => {
  it("exports 'edit-text' in TextContextActionId", () => {
    expect(contextBarSrc).toContain("'edit-text'");
  });

  it('TEXT_CONTEXT_ACTIONS includes edit-text entry', () => {
    expect(contextBarSrc).toContain("id: 'edit-text'");
  });

  it('edit-text is available only in edit mode', () => {
    // The edit-text action availableIn should contain 'edit'
    const editTextIdx = contextBarSrc.indexOf("id: 'edit-text'");
    const editTextBlock = contextBarSrc.slice(editTextIdx, editTextIdx + 200);
    expect(editTextBlock).toContain("'edit'");
  });

  it('edit-text action has a Dutch label', () => {
    const editTextIdx = contextBarSrc.indexOf("id: 'edit-text'");
    const editTextBlock = contextBarSrc.slice(editTextIdx, editTextIdx + 200);
    expect(editTextBlock).toContain('bewerken');
  });

  it('imports TextEditabilityResult', () => {
    expect(contextBarSrc).toContain('TextEditabilityResult');
    expect(contextBarSrc).toContain('textEditability');
  });

  it('editability prop is declared on TextContextBarProps', () => {
    expect(contextBarSrc).toContain('editability?');
    expect(contextBarSrc).toContain('TextEditabilityResult');
  });

  it('edit-text button is disabled when editability status is not editable', () => {
    expect(contextBarSrc).toContain("action.id === 'edit-text'");
    expect(contextBarSrc).toContain("editability.status !== 'editable'");
    expect(contextBarSrc).toContain('isDisabled');
  });

  it('disabled button has not-allowed cursor', () => {
    expect(contextBarSrc).toContain("'not-allowed'");
  });

  it('disabled button shows editability label as tooltip', () => {
    expect(contextBarSrc).toContain('editability?.label');
  });

  it('data-editability-status attribute is set on edit-text button', () => {
    expect(contextBarSrc).toContain('data-editability-status');
  });
});

// ---------------------------------------------------------------------------
// PageCanvas — double-click trigger
// ---------------------------------------------------------------------------

describe('PageCanvas — double-click edit entry trigger', () => {
  it('declares onTextTargetDoubleClick prop', () => {
    expect(pageCanvasSrc).toContain('onTextTargetDoubleClick');
  });

  it('onTextTargetDoubleClick accepts TextParagraphTarget', () => {
    expect(pageCanvasSrc).toContain('onTextTargetDoubleClick?: (target: TextParagraphTarget) => void');
  });

  it('has handlePageDoubleClick function', () => {
    expect(pageCanvasSrc).toContain('handlePageDoubleClick');
  });

  it('double-click handler fires onTextTargetDoubleClick with hovered paragraph', () => {
    expect(pageCanvasSrc).toContain('onTextTargetDoubleClick?.(hoveredTextTarget.paragraph)');
  });

  it('double-click guard requires textInteractionActive and no active tool', () => {
    const dblClickFn = pageCanvasSrc.slice(
      pageCanvasSrc.indexOf('handlePageDoubleClick'),
      pageCanvasSrc.indexOf('handlePageDoubleClick') + 300,
    );
    expect(dblClickFn).toContain('textInteractionActive');
    expect(dblClickFn).toContain('activeAnnotationTool');
  });

  it('page container has onDoubleClick handler', () => {
    expect(pageCanvasSrc).toContain('onDoubleClick={handlePageDoubleClick}');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — edit entry handler
// ---------------------------------------------------------------------------

describe('ViewerApp — handleEditEntry', () => {
  it('imports getEditability from textEditability', () => {
    expect(viewerAppSrc).toContain('getEditability');
    expect(viewerAppSrc).toContain('textEditability');
  });

  it('imports extractText from textEditability', () => {
    expect(viewerAppSrc).toContain('extractText');
  });

  it('imports TextContextBar and shouldShowContextBar', () => {
    expect(viewerAppSrc).toContain('TextContextBar');
    expect(viewerAppSrc).toContain('shouldShowContextBar');
  });

  it('imports TextContextActionId type', () => {
    expect(viewerAppSrc).toContain('TextContextActionId');
  });

  it('has handleEditEntry function', () => {
    expect(viewerAppSrc).toContain('handleEditEntry');
  });

  it('handleEditEntry calls getEditability and guards on status', () => {
    const entryFn = viewerAppSrc.slice(
      viewerAppSrc.indexOf('handleEditEntry'),
      viewerAppSrc.indexOf('handleEditEntry') + 500,
    );
    expect(entryFn).toContain('getEditability');
    expect(entryFn).toContain("status !== 'editable'");
  });

  it('handleEditEntry sets editingTextTargetId when editable', () => {
    const entryFn = viewerAppSrc.slice(
      viewerAppSrc.indexOf('handleEditEntry'),
      viewerAppSrc.indexOf('handleEditEntry') + 500,
    );
    expect(entryFn).toContain('setEditingTextTargetId');
  });

  it('handleEditEntry sets textDraft from extractText', () => {
    const entryFn = viewerAppSrc.slice(
      viewerAppSrc.indexOf('handleEditEntry'),
      viewerAppSrc.indexOf('handleEditEntry') + 500,
    );
    expect(entryFn).toContain('setTextDraft');
    expect(entryFn).toContain('extractText');
  });

  it('passes onTextTargetDoubleClick to PageCanvas', () => {
    expect(viewerAppSrc).toContain('onTextTargetDoubleClick={handleEditEntry}');
  });

  it('has handleTextContextAction routing edit-text to handleEditEntry', () => {
    expect(viewerAppSrc).toContain('handleTextContextAction');
    const routeFn = viewerAppSrc.slice(
      viewerAppSrc.indexOf('handleTextContextAction'),
      viewerAppSrc.indexOf('handleTextContextAction') + 400,
    );
    expect(routeFn).toContain("'edit-text'");
    expect(routeFn).toContain('handleEditEntry');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — Enter key handler
// ---------------------------------------------------------------------------

describe('ViewerApp — Enter key edit entry trigger', () => {
  it('has a keydown handler for text edit entry', () => {
    expect(viewerAppSrc).toContain('handleTextEditKey');
  });

  it('Enter key handler checks selectedTextTarget is non-null', () => {
    const fn = viewerAppSrc.slice(
      viewerAppSrc.indexOf('handleTextEditKey'),
      viewerAppSrc.indexOf('handleTextEditKey') + 400,
    );
    expect(fn).toContain('selectedTextTarget');
  });

  it('Enter key handler guards against already-editing state', () => {
    const fn = viewerAppSrc.slice(
      viewerAppSrc.indexOf('handleTextEditKey'),
      viewerAppSrc.indexOf('handleTextEditKey') + 400,
    );
    expect(fn).toContain('editingTextTargetId');
  });

  it('Enter key handler guards against input/textarea focus', () => {
    const fn = viewerAppSrc.slice(
      viewerAppSrc.indexOf('handleTextEditKey'),
      viewerAppSrc.indexOf('handleTextEditKey') + 500,
    );
    expect(fn).toContain('INPUT');
    expect(fn).toContain('TEXTAREA');
  });

  it('Enter key handler calls handleEditEntry', () => {
    const fn = viewerAppSrc.slice(
      viewerAppSrc.indexOf('handleTextEditKey'),
      viewerAppSrc.indexOf('handleTextEditKey') + 500,
    );
    expect(fn).toContain('handleEditEntry');
  });

  it('Enter key handler is attached to window keydown event', () => {
    expect(viewerAppSrc).toContain("addEventListener('keydown', handleTextEditKey)");
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — TextContextBar render
// ---------------------------------------------------------------------------

describe('ViewerApp — TextContextBar rendering', () => {
  it('renders TextContextBar when shouldShowContextBar is true', () => {
    expect(viewerAppSrc).toContain('shouldShowContextBar(mode, selectedTextTarget)');
    expect(viewerAppSrc).toContain('<TextContextBar');
  });

  it('passes editability to TextContextBar', () => {
    const barBlock = viewerAppSrc.slice(
      viewerAppSrc.indexOf('<TextContextBar'),
      viewerAppSrc.indexOf('<TextContextBar') + 500,
    );
    expect(barBlock).toContain('editability={getEditability(');
  });

  it('passes onAction={handleTextContextAction} to TextContextBar', () => {
    const barBlock = viewerAppSrc.slice(
      viewerAppSrc.indexOf('<TextContextBar'),
      viewerAppSrc.indexOf('<TextContextBar') + 500,
    );
    expect(barBlock).toContain('onAction={handleTextContextAction}');
  });
});

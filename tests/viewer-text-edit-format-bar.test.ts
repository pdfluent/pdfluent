// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * TextEditFormatBar — source-level assertions.
 *
 * Verifies:
 * - TextEditFormatBar is exported from its module
 * - B/I/U buttons are present in the component source (data-testid markers)
 * - Font size display has data-sdk-gated attribute
 * - Save and Cancel buttons are present
 * - ModeToolbar accepts textEditFormatBar prop and renders TextEditFormatBar
 * - TextContextBar is NOT shown when mode === 'edit' (ViewerApp source check)
 * - The format bar replaces ModeToolbar content when active
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');

const formatBarSrc = readFileSync(
  join(root, 'src/viewer/components/TextEditFormatBar.tsx'),
  'utf8',
);

const modeToolbarSrc = readFileSync(
  join(root, 'src/viewer/components/ModeToolbar.tsx'),
  'utf8',
);

const viewerAppSrc = readFileSync(
  join(root, 'src/viewer/ViewerApp.tsx'),
  'utf8',
);

// ---------------------------------------------------------------------------
// TextEditFormatBar — component structure
// ---------------------------------------------------------------------------

describe('TextEditFormatBar source', () => {
  it('exports TextEditFormatBar', () => {
    expect(formatBarSrc).toContain('export');
    expect(formatBarSrc).toContain('TextEditFormatBar');
  });

  it('has Bold button with data-testid', () => {
    expect(formatBarSrc).toContain('data-testid="format-bold-btn"');
  });

  it('has Italic button with data-testid', () => {
    expect(formatBarSrc).toContain('data-testid="format-italic-btn"');
  });

  it('has Underline button with data-testid', () => {
    expect(formatBarSrc).toContain('data-testid="format-underline-btn"');
  });

  it('has font size display with data-sdk-gated attribute', () => {
    expect(formatBarSrc).toContain('data-sdk-gated');
    expect(formatBarSrc).toContain('format-font-size-display');
  });

  it('has Save button with data-testid', () => {
    expect(formatBarSrc).toContain('data-testid="format-save-btn"');
  });

  it('has Cancel button with data-testid', () => {
    expect(formatBarSrc).toContain('data-testid="format-cancel-btn"');
  });

  it('Save button calls onCommit', () => {
    expect(formatBarSrc).toContain('onCommit');
  });

  it('Cancel button calls onCancel', () => {
    expect(formatBarSrc).toContain('onCancel');
  });

  it('has data-testid for the bar container', () => {
    expect(formatBarSrc).toContain('data-testid="text-edit-format-bar"');
  });

  it('imports Bold/Italic/Underline/Save/X icons from lucide-react', () => {
    expect(formatBarSrc).toContain('BoldIcon');
    expect(formatBarSrc).toContain('ItalicIcon');
    expect(formatBarSrc).toContain('UnderlineIcon');
    expect(formatBarSrc).toContain('SaveIcon');
    expect(formatBarSrc).toContain('XIcon');
  });

  it('accepts canFormatText and canSetFontStyle props', () => {
    expect(formatBarSrc).toContain('canFormatText');
    expect(formatBarSrc).toContain('canSetFontStyle');
  });

  it('shows not-saved marker when SDK unavailable', () => {
    // v2: literal "(not saved)" replaced by t('textEdit.notSavedMarker')
    expect(formatBarSrc).toMatch(/not saved|textEdit\.notSavedMarker/);
  });
});

// ---------------------------------------------------------------------------
// ModeToolbar — textEditFormatBar prop integration
// ---------------------------------------------------------------------------

describe('ModeToolbar textEditFormatBar prop', () => {
  it('imports TextEditFormatBar', () => {
    expect(modeToolbarSrc).toContain('TextEditFormatBar');
  });

  it('defines textEditFormatBar in ModeToolbarProps', () => {
    expect(modeToolbarSrc).toContain('textEditFormatBar');
  });

  it('renders TextEditFormatBar when prop is set', () => {
    // The early-return block spreads props to TextEditFormatBar
    expect(modeToolbarSrc).toContain('<TextEditFormatBar');
  });

  it('wraps the format bar in the same toolbar container div', () => {
    expect(modeToolbarSrc).toContain('glass-surface-subtle');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — TextContextBar not shown in edit mode
// ---------------------------------------------------------------------------

describe('ViewerApp edit mode context bar suppression', () => {
  it('does not show TextContextBar when mode is edit', () => {
    // ViewerApp must have a condition that excludes mode === 'edit'
    expect(viewerAppSrc).toContain("mode !== 'edit'");
  });

  it('renders TextEditFloatingPill directly in the V3 page layer', () => {
    expect(viewerAppSrc).toContain('<TextEditFloatingPill');
  });

  it('shows format bar only when editingTextTargetId is set and mode is edit', () => {
    expect(viewerAppSrc).toContain("editingTextTargetId && mode === 'edit'");
  });

  it('passes editorDivRef to TextInlineEditor', () => {
    expect(viewerAppSrc).toContain('editorDivRef');
    expect(viewerAppSrc).toContain('editorRef={editorDivRef}');
  });

  it('passes cursorAtPoint to TextInlineEditor', () => {
    expect(viewerAppSrc).toContain('cursorAtPoint={lastDoubleClickAt}');
  });

  it('clears lastDoubleClickAt on commit', () => {
    expect(viewerAppSrc).toContain('setLastDoubleClickAt(null)');
  });
});

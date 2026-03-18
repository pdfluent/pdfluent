// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const dialogSource = readFileSync(
  new URL('../src/viewer/components/UnsavedChangesDialog.tsx', import.meta.url),
  'utf8'
);

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// UnsavedChangesDialog — component structure
// ---------------------------------------------------------------------------

describe('UnsavedChangesDialog — structure', () => {
  it('renders nothing when isOpen is false', () => {
    expect(dialogSource).toContain('if (!isOpen) return null');
  });

  it('renders data-testid="unsaved-changes-dialog"', () => {
    expect(dialogSource).toContain('data-testid="unsaved-changes-dialog"');
  });

  it('uses role="dialog" with aria-modal="true"', () => {
    expect(dialogSource).toContain('role="dialog"');
    expect(dialogSource).toContain('aria-modal="true"');
  });

  it('has an aria-labelledby pointing to the title element', () => {
    expect(dialogSource).toContain('aria-labelledby="unsaved-dialog-title"');
    expect(dialogSource).toContain('id="unsaved-dialog-title"');
  });

  it('has a backdrop with aria-hidden', () => {
    expect(dialogSource).toContain('aria-hidden="true"');
  });

  it('backdrop onClick calls onCancel', () => {
    const backdropIdx   = dialogSource.indexOf('aria-hidden="true"');
    const divStart      = dialogSource.lastIndexOf('<div', backdropIdx);
    const divEnd        = dialogSource.indexOf('/>', backdropIdx) + 2;
    const backdropBlock = dialogSource.slice(divStart, divEnd);
    expect(backdropBlock).toContain('onClick={onCancel}');
  });
});

// ---------------------------------------------------------------------------
// UnsavedChangesDialog — buttons
// ---------------------------------------------------------------------------

describe('UnsavedChangesDialog — buttons', () => {
  it('renders unsaved-cancel-btn', () => {
    expect(dialogSource).toContain('data-testid="unsaved-cancel-btn"');
  });

  it('renders unsaved-discard-btn', () => {
    expect(dialogSource).toContain('data-testid="unsaved-discard-btn"');
  });

  it('renders unsaved-save-btn', () => {
    expect(dialogSource).toContain('data-testid="unsaved-save-btn"');
  });

  it('Cancel button calls onCancel', () => {
    const idx   = dialogSource.indexOf('unsaved-cancel-btn');
    const start = dialogSource.lastIndexOf('<button', idx);
    const end   = dialogSource.indexOf('</button>', idx);
    const btn   = dialogSource.slice(start, end);
    expect(btn).toContain('onClick={onCancel}');
  });

  it('Discard button calls onDiscard', () => {
    const idx   = dialogSource.indexOf('unsaved-discard-btn');
    const start = dialogSource.lastIndexOf('<button', idx);
    const end   = dialogSource.indexOf('</button>', idx);
    const btn   = dialogSource.slice(start, end);
    expect(btn).toContain('onClick={onDiscard}');
  });

  it('Save button calls onSave', () => {
    const idx   = dialogSource.indexOf('unsaved-save-btn');
    const start = dialogSource.lastIndexOf('<button', idx);
    const end   = dialogSource.indexOf('</button>', idx);
    const btn   = dialogSource.slice(start, end);
    expect(btn).toContain('onClick={onSave}');
  });

  it('Save button is disabled when canSave is false', () => {
    const idx   = dialogSource.indexOf('unsaved-save-btn');
    const start = dialogSource.lastIndexOf('<button', idx);
    const end   = dialogSource.indexOf('</button>', idx);
    const btn   = dialogSource.slice(start, end);
    expect(btn).toContain('disabled={!canSave}');
  });
});

// ---------------------------------------------------------------------------
// UnsavedChangesDialog — close behavior
// ---------------------------------------------------------------------------

describe('UnsavedChangesDialog — close behavior', () => {
  it('closes on Escape key (calls onCancel via stable ref)', () => {
    expect(dialogSource).toContain("e.key === 'Escape'");
    expect(dialogSource).toContain('onCancelRef.current()');
  });

  it('uses stable-ref pattern for onCancel', () => {
    expect(dialogSource).toContain('onCancelRef');
    expect(dialogSource).toContain('useEffect(() => { onCancelRef.current = onCancel; })');
  });

  it('Escape listener registered only when isOpen', () => {
    expect(dialogSource).toContain('if (!isOpen) return');
    expect(dialogSource).toContain("window.addEventListener('keydown', handleKey)");
    expect(dialogSource).toContain("window.removeEventListener('keydown', handleKey)");
  });

  it('Escape effect depends on [isOpen]', () => {
    expect(dialogSource).toContain('}, [isOpen])');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — dialog state and helpers
// ---------------------------------------------------------------------------

describe('ViewerApp — unsaved-changes: state', () => {
  it('declares unsavedDialogOpen state', () => {
    expect(viewerAppSource).toContain('unsavedDialogOpen');
    expect(viewerAppSource).toContain('setUnsavedDialogOpen');
  });

  it('declares pendingActionRef', () => {
    expect(viewerAppSource).toContain('pendingActionRef');
    expect(viewerAppSource).toContain('useRef<(() => void) | null>(null)');
  });

  it('imports UnsavedChangesDialog', () => {
    expect(viewerAppSource).toContain("import { UnsavedChangesDialog }");
    expect(viewerAppSource).toContain("'./components/UnsavedChangesDialog'");
  });

  it('mounts UnsavedChangesDialog in JSX', () => {
    expect(viewerAppSource).toContain('<UnsavedChangesDialog');
    expect(viewerAppSource).toContain('isOpen={unsavedDialogOpen}');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — handleUnsavedSave
// ---------------------------------------------------------------------------

describe('ViewerApp — unsaved-changes: handleUnsavedSave', () => {
  it('handleUnsavedSave is defined with useCallback', () => {
    expect(viewerAppSource).toContain('handleUnsavedSave');
    expect(viewerAppSource).toContain('useCallback');
  });

  it('invokes save_pdf with currentFilePath', () => {
    const start = viewerAppSource.indexOf('handleUnsavedSave');
    const end   = viewerAppSource.indexOf('}, [currentFilePath', start) + 30;
    const body  = viewerAppSource.slice(start, end);
    expect(body).toContain("'save_pdf'");
    expect(body).toContain('path: currentFilePath');
  });

  it('calls clearDirty after successful save', () => {
    const start = viewerAppSource.indexOf('handleUnsavedSave');
    const end   = viewerAppSource.indexOf('}, [currentFilePath', start) + 30;
    const body  = viewerAppSource.slice(start, end);
    expect(body).toContain('clearDirty()');
  });

  it('closes the dialog and fires pending action on save', () => {
    const start = viewerAppSource.indexOf('handleUnsavedSave');
    const end   = viewerAppSource.indexOf('}, [currentFilePath', start) + 30;
    const body  = viewerAppSource.slice(start, end);
    expect(body).toContain('setUnsavedDialogOpen(false)');
    expect(body).toContain('pendingActionRef.current?.()');
    expect(body).toContain('pendingActionRef.current = null');
  });

  it('canSave prop is false when currentFilePath is null', () => {
    expect(viewerAppSource).toContain('canSave={currentFilePath !== null}');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — handleUnsavedDiscard
// ---------------------------------------------------------------------------

describe('ViewerApp — unsaved-changes: handleUnsavedDiscard', () => {
  it('closes dialog and fires pending action', () => {
    const start = viewerAppSource.indexOf('handleUnsavedDiscard');
    const end   = viewerAppSource.indexOf('}, []);', start) + 6;
    const body  = viewerAppSource.slice(start, end);
    expect(body).toContain('setUnsavedDialogOpen(false)');
    expect(body).toContain('pendingActionRef.current?.()');
    expect(body).toContain('pendingActionRef.current = null');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — handleUnsavedCancel
// ---------------------------------------------------------------------------

describe('ViewerApp — unsaved-changes: handleUnsavedCancel', () => {
  it('closes dialog and clears pending action without running it', () => {
    const start = viewerAppSource.indexOf('handleUnsavedCancel');
    const end   = viewerAppSource.indexOf('}, []);', start) + 6;
    const body  = viewerAppSource.slice(start, end);
    expect(body).toContain('setUnsavedDialogOpen(false)');
    expect(body).toContain('pendingActionRef.current = null');
  });

  it('does NOT fire pendingActionRef on cancel', () => {
    const start = viewerAppSource.indexOf('handleUnsavedCancel');
    const end   = viewerAppSource.indexOf('}, []);', start) + 6;
    const body  = viewerAppSource.slice(start, end);
    expect(body).not.toContain('pendingActionRef.current?.()');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — call site replacements (no more window.confirm)
// ---------------------------------------------------------------------------

describe('ViewerApp — unsaved-changes: window.confirm removed', () => {
  it('window.confirm is no longer used anywhere in ViewerApp', () => {
    expect(viewerAppSource).not.toContain('window.confirm(');
  });
});

describe('ViewerApp — unsaved-changes: handleLoadDocument call site', () => {
  it('handleLoadDocument opens the dialog when isDirty', () => {
    const start = viewerAppSource.indexOf('handleLoadDocument = useCallback');
    const end   = viewerAppSource.indexOf('}, [isDirty, loadDocument])', start) + 30;
    const body  = viewerAppSource.slice(start, end);
    expect(body).toContain('setUnsavedDialogOpen(true)');
    expect(body).toContain('pendingActionRef.current =');
  });

  it('handleLoadDocument stores the load as the pending action', () => {
    const start = viewerAppSource.indexOf('handleLoadDocument = useCallback');
    const end   = viewerAppSource.indexOf('}, [isDirty, loadDocument])', start) + 30;
    const body  = viewerAppSource.slice(start, end);
    expect(body).toContain('void loadDocument(source)');
  });
});

describe('ViewerApp — unsaved-changes: onCloseDocument call site', () => {
  it('onCloseDocument opens the dialog when isDirty', () => {
    const start = viewerAppSource.indexOf('onCloseDocument');
    const end   = viewerAppSource.indexOf('})', start) + 2;
    const body  = viewerAppSource.slice(start, end);
    expect(body).toContain('setUnsavedDialogOpen(true)');
    expect(body).toContain('pendingActionRef.current =');
  });
});

describe('ViewerApp — unsaved-changes: close-document command call site', () => {
  it("'close-document' command opens the dialog when isDirty", () => {
    const start = viewerAppSource.indexOf("id: 'close-document'");
    const end   = viewerAppSource.indexOf('} },', start) + 4;
    const body  = viewerAppSource.slice(start, end);
    expect(body).toContain('setUnsavedDialogOpen(true)');
    expect(body).toContain('pendingActionRef.current =');
  });
});

// ---------------------------------------------------------------------------
// No regressions
// ---------------------------------------------------------------------------

describe('ViewerApp — unsaved-changes: no regressions', () => {
  it('isDirty is still checked before showing the dialog', () => {
    expect(viewerAppSource).toContain('if (isDirty)');
  });

  it('GoToPageDialog still mounted', () => {
    expect(viewerAppSource).toContain('<GoToPageDialog');
  });

  it('ZoomPresetsPopover still mounted', () => {
    expect(viewerAppSource).toContain('<ZoomPresetsPopover');
  });

  it('handleLoadDocument still sets currentFilePath', () => {
    expect(viewerAppSource).toContain('setCurrentFilePath(typeof source === \'string\' ? source : null)');
  });
});

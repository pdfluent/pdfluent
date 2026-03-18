// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const viewerAppSource = [
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
].map(p => readFileSync(new URL(p, import.meta.url), 'utf8')).join('\n\n');

// ---------------------------------------------------------------------------
// Locate the three guard sites for scoped assertions
// ---------------------------------------------------------------------------

// 1. handleLoadDocument — open-new-file guard
const loadDocStart = viewerAppSource.indexOf('handleLoadDocument = useCallback');
const loadDocEnd   = viewerAppSource.indexOf('}, [isDirty, loadDocument])', loadDocStart) + 26;
const loadDocBody  = viewerAppSource.slice(loadDocStart, loadDocEnd);

// 2. beforeunload effect
const beforeUnloadStart = viewerAppSource.indexOf('handleBeforeUnload');
const beforeUnloadEnd   = viewerAppSource.indexOf('}, [isDirty]);', beforeUnloadStart) + 14;
const beforeUnloadBody  = viewerAppSource.slice(beforeUnloadStart, beforeUnloadEnd);

// 3. onCloseDocument inline handler
const closeDocStart = viewerAppSource.indexOf('onCloseDocument={() => {');
const closeDocEnd   = viewerAppSource.indexOf('}}', closeDocStart) + 2;
const closeDocBody  = viewerAppSource.slice(closeDocStart, closeDocEnd);

// ---------------------------------------------------------------------------
// Open-new-file guard (handleLoadDocument)
// ---------------------------------------------------------------------------

describe('ViewerApp — unsaved-changes guard: open new file', () => {
  it('checks isDirty before loading', () => {
    expect(loadDocBody).toContain('if (isDirty)');
  });

  it('opens the unsaved-changes dialog', () => {
    expect(loadDocBody).toContain('setUnsavedDialogOpen(true)');
    expect(loadDocBody).toContain('pendingActionRef.current =');
  });

  it('returns early to await the dialog choice', () => {
    expect(loadDocBody).toContain('return;');
  });

  it('still sets currentFilePath and calls loadDocument after confirm', () => {
    expect(loadDocBody).toContain('setCurrentFilePath(');
    expect(loadDocBody).toContain('await loadDocument(source)');
  });

  it('isDirty is in the useCallback dependency array', () => {
    expect(loadDocBody).toContain('[isDirty, loadDocument]');
  });
});

// ---------------------------------------------------------------------------
// beforeunload guard (window/tab/OS close)
// ---------------------------------------------------------------------------

describe('ViewerApp — unsaved-changes guard: beforeunload', () => {
  it('registers a beforeunload listener', () => {
    expect(viewerAppSource).toContain("window.addEventListener('beforeunload', handleBeforeUnload)");
  });

  it('removes the beforeunload listener on cleanup', () => {
    expect(viewerAppSource).toContain("window.removeEventListener('beforeunload', handleBeforeUnload)");
  });

  it('bails early when not dirty', () => {
    expect(beforeUnloadBody).toContain('if (!isDirty) return');
  });

  it('calls e.preventDefault()', () => {
    expect(beforeUnloadBody).toContain('e.preventDefault()');
  });

  it('sets e.returnValue for legacy browser support', () => {
    expect(beforeUnloadBody).toContain("e.returnValue = ''");
  });

  it('useEffect depends on isDirty', () => {
    expect(viewerAppSource).toContain('}, [isDirty]);');
  });
});

// ---------------------------------------------------------------------------
// Close-document guard (onCloseDocument)
// ---------------------------------------------------------------------------

describe('ViewerApp — unsaved-changes guard: close document', () => {
  it('checks isDirty before closing', () => {
    expect(closeDocBody).toContain('if (isDirty)');
  });

  it('opens the unsaved-changes dialog', () => {
    expect(closeDocBody).toContain('setUnsavedDialogOpen(true)');
    expect(closeDocBody).toContain('pendingActionRef.current =');
  });

  it('stores close action as pending action', () => {
    expect(closeDocBody).toContain('pendingActionRef.current =');
  });

  it('calls closeDocument() after confirmation', () => {
    expect(closeDocBody).toContain('closeDocument()');
  });

  it('clears currentFilePath after confirmation', () => {
    expect(closeDocBody).toContain('setCurrentFilePath(null)');
  });
});

// ---------------------------------------------------------------------------
// No regressions
// ---------------------------------------------------------------------------

describe('ViewerApp — unsaved-changes guard: no regressions', () => {
  it('isDirty is destructured from useDocument', () => {
    expect(viewerAppSource).toContain('isDirty,');
  });

  it('clearDirty is still present for save flow', () => {
    expect(viewerAppSource).toContain('clearDirty');
  });

  it('fullscreen shortcut still present', () => {
    expect(viewerAppSource).toContain('handleFullscreenKey');
  });

  it('export shortcut still present', () => {
    expect(viewerAppSource).toContain('handleExportKey');
  });

  it('arrow page nav still present', () => {
    expect(viewerAppSource).toContain('handlePageNav');
  });
});

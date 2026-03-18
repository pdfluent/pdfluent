// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const topBarSource = readFileSync(
  new URL('../src/viewer/components/TopBar.tsx', import.meta.url),
  'utf8'
);

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

const useDocumentSource = readFileSync(
  new URL('../src/viewer/hooks/useDocument.ts', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// TopBar props
// ---------------------------------------------------------------------------

describe('TopBar — save flow props', () => {
  it('declares currentFilePath prop', () => {
    expect(topBarSource).toContain('currentFilePath: string | null');
  });

  it('declares onSaveComplete prop', () => {
    expect(topBarSource).toContain('onSaveComplete: () => void');
  });

  it('imports useTaskQueueContext', () => {
    expect(topBarSource).toContain('useTaskQueueContext');
  });

  it('imports SaveIcon', () => {
    expect(topBarSource).toContain('SaveIcon');
  });
});

// ---------------------------------------------------------------------------
// Save handler logic
// ---------------------------------------------------------------------------

describe('TopBar — handleSave', () => {
  it('defines handleSave as async function', () => {
    expect(topBarSource).toContain('async function handleSave');
  });

  it('guards against non-Tauri environments', () => {
    expect(topBarSource).toContain('isTauri');
  });

  it('guards against no dirty state', () => {
    expect(topBarSource).toContain('isDirty');
  });

  it('guards against zero page count', () => {
    expect(topBarSource).toContain('pageCount === 0');
  });

  it('invokes save_pdf for in-place save', () => {
    expect(topBarSource).toContain("'save_pdf'");
    expect(topBarSource).toContain('path: currentFilePath');
  });

  it('opens save dialog when no currentFilePath', () => {
    expect(topBarSource).toContain('@tauri-apps/plugin-dialog');
    expect(topBarSource).toContain("name: 'PDF'");
    expect(topBarSource).toContain("extensions: ['pdf']");
  });

  it('calls onSaveComplete after successful save', () => {
    expect(topBarSource).toContain('onSaveComplete()');
  });
});

// ---------------------------------------------------------------------------
// Task queue integration
// ---------------------------------------------------------------------------

describe('TopBar — task queue integration', () => {
  it('uses push and update from useTaskQueueContext', () => {
    expect(topBarSource).toContain('push,');
    expect(topBarSource).toContain('update }');
  });

  it('pushes a running task for in-place save', () => {
    expect(topBarSource).toContain('Opslaan…');
    expect(topBarSource).toContain("status: 'running'");
  });

  it('pushes a running task for save-as', () => {
    expect(topBarSource).toContain('Opslaan als…');
  });

  it('updates task to done on success', () => {
    expect(topBarSource).toContain('Opgeslagen');
    expect(topBarSource).toContain("status: 'done'");
  });

  it('updates task to error on failure', () => {
    expect(topBarSource).toContain('Opslaan mislukt');
    expect(topBarSource).toContain("status: 'error'");
  });

  it('uses Date.now() for unique task id', () => {
    expect(topBarSource).toContain('save-${Date.now()}');
  });
});

// ---------------------------------------------------------------------------
// Keyboard shortcut
// ---------------------------------------------------------------------------

describe('TopBar — keyboard shortcut', () => {
  it('registers a keydown listener', () => {
    expect(topBarSource).toContain("window.addEventListener('keydown'");
    expect(topBarSource).toContain("window.removeEventListener('keydown'");
  });

  it('handles Cmd/Ctrl+S', () => {
    expect(topBarSource).toContain("e.key === 's'");
    expect(topBarSource).toContain('e.metaKey || e.ctrlKey');
    expect(topBarSource).toContain('e.preventDefault()');
  });

  it('registers the listener once (empty deps array)', () => {
    // useEffect for keydown should use [] deps
    expect(topBarSource).toContain('}, [])');
  });

  it('uses handleSaveRef to avoid stale closures', () => {
    expect(topBarSource).toContain('handleSaveRef');
    expect(topBarSource).toContain('handleSaveRef.current');
  });
});

// ---------------------------------------------------------------------------
// Save button
// ---------------------------------------------------------------------------

describe('TopBar — save button', () => {
  it('renders a save button', () => {
    expect(topBarSource).toContain('<SaveIcon');
  });

  it('computes canSave from isDirty and pageCount', () => {
    expect(topBarSource).toContain('canSave');
    expect(topBarSource).toContain('isDirty && pageCount > 0');
  });

  it('disables the save button when not canSave', () => {
    expect(topBarSource).toContain('disabled={!canSave}');
  });

  it('shows Opslaan (⌘S) title when saveable', () => {
    expect(topBarSource).toContain('Opslaan (⌘S)');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — wiring
// ---------------------------------------------------------------------------

describe('ViewerApp — save flow wiring', () => {
  it('tracks currentFilePath state', () => {
    expect(viewerAppSource).toContain('currentFilePath');
    expect(viewerAppSource).toContain('setCurrentFilePath');
  });

  it('sets currentFilePath from string source', () => {
    expect(viewerAppSource).toContain("typeof source === 'string' ? source : null");
  });

  it('passes currentFilePath to TopBar', () => {
    expect(viewerAppSource).toContain('currentFilePath={currentFilePath}');
  });

  it('passes onSaveComplete={clearDirty} to TopBar', () => {
    expect(viewerAppSource).toContain('onSaveComplete={clearDirty}');
  });

  it('destructures clearDirty from useDocument', () => {
    expect(viewerAppSource).toContain('clearDirty');
  });
});

// ---------------------------------------------------------------------------
// useDocument — clearDirty
// ---------------------------------------------------------------------------

describe('useDocument — clearDirty', () => {
  it('exports clearDirty in the result interface', () => {
    expect(useDocumentSource).toContain('clearDirty:');
    expect(useDocumentSource).toContain('() => void');
  });

  it('clearDirty sets isDirty to false', () => {
    expect(useDocumentSource).toContain('setIsDirty(false)');
  });

  it('clearDirty is a stable useCallback', () => {
    expect(useDocumentSource).toContain('clearDirty = useCallback');
  });
});

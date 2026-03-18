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

// Locate the export shortcut effect for scoped assertions
const effectStart = viewerAppSource.indexOf('Export dialog keyboard shortcut');
const effectEnd = viewerAppSource.indexOf('// Global keyboard shortcut: ⌘K', effectStart);
const effectBody = viewerAppSource.slice(effectStart, effectEnd);

// ---------------------------------------------------------------------------
// Key mapping
// ---------------------------------------------------------------------------

describe('ViewerApp — ⌘E shortcut: key mapping', () => {
  it("handles the 'e' key", () => {
    expect(effectBody).toContain("e.key !== 'e'");
  });

  it('requires metaKey or ctrlKey', () => {
    expect(effectBody).toContain('e.metaKey || e.ctrlKey');
  });

  it('returns early when no modifier is held', () => {
    expect(effectBody).toContain('if (!(e.metaKey || e.ctrlKey)) return');
  });

  it('returns early when key is not e', () => {
    expect(effectBody).toContain("if (e.key !== 'e') return");
  });
});

// ---------------------------------------------------------------------------
// pageCount guard
// ---------------------------------------------------------------------------

describe('ViewerApp — ⌘E shortcut: no-document guard', () => {
  it('bails when pageCount is 0', () => {
    expect(effectBody).toContain('if (pageCount === 0) return');
  });
});

// ---------------------------------------------------------------------------
// preventDefault and action
// ---------------------------------------------------------------------------

describe('ViewerApp — ⌘E shortcut: action', () => {
  it('calls e.preventDefault()', () => {
    expect(effectBody).toContain('e.preventDefault()');
  });

  it('calls setExportOpen(true)', () => {
    expect(effectBody).toContain('setExportOpen(true)');
  });
});

// ---------------------------------------------------------------------------
// Listener lifecycle
// ---------------------------------------------------------------------------

describe('ViewerApp — ⌘E shortcut: listener lifecycle', () => {
  it('registers a keydown listener', () => {
    expect(effectBody).toContain("window.addEventListener('keydown', handleExportKey)");
  });

  it('removes the listener on cleanup', () => {
    expect(effectBody).toContain("window.removeEventListener('keydown', handleExportKey)");
  });

  it('useEffect depends on pageCount', () => {
    expect(effectBody).toContain('}, [pageCount])');
  });
});

// ---------------------------------------------------------------------------
// No regressions
// ---------------------------------------------------------------------------

describe('ViewerApp — ⌘E shortcut: no regressions', () => {
  it('⌘K command palette handler still present', () => {
    expect(viewerAppSource).toContain('handleKey');
    expect(viewerAppSource).toContain('setCommandPaletteOpen');
  });

  it('⌘G go-to-page handler still present', () => {
    expect(viewerAppSource).toContain('handleGoToPage');
  });

  it('zoom shortcuts still present', () => {
    expect(viewerAppSource).toContain('handleZoomKey');
  });

  it('mode switching shortcuts still present', () => {
    expect(viewerAppSource).toContain('handleModeKey');
  });

  it('⌘S save handler in TopBar still present', () => {
    const topBarSource = readFileSync(
      new URL('../src/viewer/components/TopBar.tsx', import.meta.url),
      'utf8'
    );
    expect(topBarSource).toContain("e.key === 's'");
  });
});

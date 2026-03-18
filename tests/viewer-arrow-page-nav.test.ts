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

// Locate the page-nav effect for scoped assertions
const effectStart = viewerAppSource.indexOf('Page navigation keyboard shortcuts');
const effectEnd = viewerAppSource.indexOf('// Mode switching keyboard shortcuts', effectStart);
const effectBody = viewerAppSource.slice(effectStart, effectEnd);

// ---------------------------------------------------------------------------
// Key mappings
// ---------------------------------------------------------------------------

describe('ViewerApp — arrow page nav: key mappings', () => {
  it('handles ArrowRight → next page', () => {
    expect(effectBody).toContain("case 'ArrowRight'");
    expect(effectBody).toContain('Math.min(pageCount - 1, i + 1)');
  });

  it('handles ArrowLeft → previous page', () => {
    expect(effectBody).toContain("case 'ArrowLeft'");
    expect(effectBody).toContain('Math.max(0, i - 1)');
  });

  it('handles ArrowDown → next page (same branch as ArrowRight)', () => {
    expect(effectBody).toContain("case 'ArrowDown'");
  });

  it('handles ArrowUp → previous page (same branch as ArrowLeft)', () => {
    expect(effectBody).toContain("case 'ArrowUp'");
  });

  it('handles PageDown → next page', () => {
    expect(effectBody).toContain("case 'PageDown'");
  });

  it('handles PageUp → previous page', () => {
    expect(effectBody).toContain("case 'PageUp'");
  });

  it('handles Home → first page', () => {
    expect(effectBody).toContain("case 'Home'");
    expect(effectBody).toContain('setPageIndex(0)');
  });

  it('handles End → last page', () => {
    expect(effectBody).toContain("case 'End'");
    expect(effectBody).toContain('setPageIndex(pageCount - 1)');
  });
});

// ---------------------------------------------------------------------------
// Document-open guard
// ---------------------------------------------------------------------------

describe('ViewerApp — arrow page nav: document-open guard', () => {
  it('bails when pageCount is 0', () => {
    expect(effectBody).toContain('if (pageCount === 0) return');
  });

  it('guard comes before key handling', () => {
    const guardIdx = effectBody.indexOf('if (pageCount === 0) return');
    const switchIdx = effectBody.indexOf('switch (e.key)');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(switchIdx).toBeGreaterThan(guardIdx);
  });
});

// ---------------------------------------------------------------------------
// Focused-input guard
// ---------------------------------------------------------------------------

describe('ViewerApp — arrow page nav: focused-input guard', () => {
  it('reads tagName from event target', () => {
    expect(effectBody).toContain('tagName');
  });

  it('ignores keys when INPUT is focused', () => {
    expect(effectBody).toContain("tag === 'INPUT'");
  });

  it('ignores keys when TEXTAREA is focused', () => {
    expect(effectBody).toContain("tag === 'TEXTAREA'");
  });

  it('ignores keys when SELECT is focused', () => {
    expect(effectBody).toContain("tag === 'SELECT'");
  });

  it('input guard comes before the switch', () => {
    const tagIdx = effectBody.indexOf('tagName');
    const switchIdx = effectBody.indexOf('switch (e.key)');
    expect(tagIdx).toBeGreaterThan(-1);
    expect(switchIdx).toBeGreaterThan(tagIdx);
  });
});

// ---------------------------------------------------------------------------
// preventDefault
// ---------------------------------------------------------------------------

describe('ViewerApp — arrow page nav: preventDefault', () => {
  it('calls e.preventDefault() for navigation keys', () => {
    expect(effectBody).toContain('e.preventDefault()');
  });

  it('preventDefault is inside the switch (not before the guard)', () => {
    const switchIdx = effectBody.indexOf('switch (e.key)');
    const preventIdx = effectBody.indexOf('e.preventDefault()', switchIdx);
    expect(switchIdx).toBeGreaterThan(-1);
    expect(preventIdx).toBeGreaterThan(switchIdx);
  });
});

// ---------------------------------------------------------------------------
// Listener lifecycle
// ---------------------------------------------------------------------------

describe('ViewerApp — arrow page nav: listener lifecycle', () => {
  it('registers a keydown listener', () => {
    expect(effectBody).toContain("window.addEventListener('keydown', handlePageNav)");
  });

  it('removes the listener on cleanup', () => {
    expect(effectBody).toContain("window.removeEventListener('keydown', handlePageNav)");
  });

  it('useEffect depends on pageCount', () => {
    expect(effectBody).toContain('}, [pageCount])');
  });
});

// ---------------------------------------------------------------------------
// No regressions
// ---------------------------------------------------------------------------

describe('ViewerApp — arrow page nav: no regressions', () => {
  it('fullscreen shortcut still present', () => {
    expect(viewerAppSource).toContain('handleFullscreenKey');
  });

  it('export shortcut still present', () => {
    expect(viewerAppSource).toContain('handleExportKey');
  });

  it('zoom shortcut still present', () => {
    expect(viewerAppSource).toContain('handleZoomKey');
  });

  it('go-to-page shortcut still present', () => {
    expect(viewerAppSource).toContain('handleGoToPage');
  });
});

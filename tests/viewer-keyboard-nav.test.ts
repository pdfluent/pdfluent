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
// Key mappings
// ---------------------------------------------------------------------------

describe('ViewerApp — keyboard page navigation mappings', () => {
  it('maps ArrowRight to next page', () => {
    expect(viewerAppSource).toContain("case 'ArrowRight'");
    expect(viewerAppSource).toContain('Math.min(pageCount - 1, i + 1)');
  });

  it('maps ArrowDown to next page', () => {
    expect(viewerAppSource).toContain("case 'ArrowDown'");
  });

  it('maps PageDown to next page', () => {
    expect(viewerAppSource).toContain("case 'PageDown'");
  });

  it('maps ArrowLeft to previous page', () => {
    expect(viewerAppSource).toContain("case 'ArrowLeft'");
    expect(viewerAppSource).toContain('Math.max(0, i - 1)');
  });

  it('maps ArrowUp to previous page', () => {
    expect(viewerAppSource).toContain("case 'ArrowUp'");
  });

  it('maps PageUp to previous page', () => {
    expect(viewerAppSource).toContain("case 'PageUp'");
  });

  it('maps Home to first page', () => {
    expect(viewerAppSource).toContain("case 'Home'");
    expect(viewerAppSource).toContain('setPageIndex(0)');
  });

  it('maps End to last page', () => {
    expect(viewerAppSource).toContain("case 'End'");
    expect(viewerAppSource).toContain('setPageIndex(pageCount - 1)');
  });
});

// ---------------------------------------------------------------------------
// Next / prev clamp behaviour
// ---------------------------------------------------------------------------

describe('ViewerApp — keyboard nav clamping', () => {
  it('clamps next page at pageCount - 1 (cannot go past last page)', () => {
    expect(viewerAppSource).toContain('Math.min(pageCount - 1, i + 1)');
  });

  it('clamps prev page at 0 (cannot go before first page)', () => {
    expect(viewerAppSource).toContain('Math.max(0, i - 1)');
  });

  it('Home always sets index to 0', () => {
    const homeBlock = viewerAppSource.indexOf("case 'Home'");
    const setZeroAfterHome = viewerAppSource.indexOf('setPageIndex(0)', homeBlock);
    expect(setZeroAfterHome).toBeGreaterThan(homeBlock);
  });

  it('End always sets index to pageCount - 1', () => {
    const endBlock = viewerAppSource.indexOf("case 'End'");
    const setLastAfterEnd = viewerAppSource.indexOf('setPageIndex(pageCount - 1)', endBlock);
    expect(setLastAfterEnd).toBeGreaterThan(endBlock);
  });
});

// ---------------------------------------------------------------------------
// Guard: pageCount === 0
// ---------------------------------------------------------------------------

describe('ViewerApp — keyboard nav guard: no document', () => {
  it('returns early when pageCount is 0', () => {
    expect(viewerAppSource).toContain('if (pageCount === 0) return');
  });

  it('guard is inside handlePageNav (not the command palette handler)', () => {
    // handlePageNav is the second keydown handler — find it after the ⌘K block
    const cmdKBlock = viewerAppSource.indexOf("e.key === 'k'");
    const pageNavGuard = viewerAppSource.indexOf('if (pageCount === 0) return', cmdKBlock);
    expect(pageNavGuard).toBeGreaterThan(cmdKBlock);
  });
});

// ---------------------------------------------------------------------------
// Guard: focus inside form elements
// ---------------------------------------------------------------------------

describe('ViewerApp — keyboard nav guard: input focus', () => {
  it('reads tagName from the event target', () => {
    expect(viewerAppSource).toContain('e.target');
    expect(viewerAppSource).toContain('tagName');
  });

  it('ignores keys when focus is in an INPUT element', () => {
    expect(viewerAppSource).toContain("tag === 'INPUT'");
  });

  it('ignores keys when focus is in a TEXTAREA element', () => {
    expect(viewerAppSource).toContain("tag === 'TEXTAREA'");
  });

  it('ignores keys when focus is in a SELECT element', () => {
    expect(viewerAppSource).toContain("tag === 'SELECT'");
  });
});

// ---------------------------------------------------------------------------
// No conflict with existing shortcuts
// ---------------------------------------------------------------------------

describe('ViewerApp — keyboard nav does not conflict with existing shortcuts', () => {
  it('page nav handler does not check metaKey or ctrlKey', () => {
    // The ⌘K / ⌘S handlers check (e.metaKey || e.ctrlKey). The page nav
    // handler must NOT react to those combos — confirm it has no metaKey check.
    const cmdKBlock = viewerAppSource.indexOf("e.key === 'k'");
    const pageNavStart = viewerAppSource.indexOf('handlePageNav', cmdKBlock);
    const pageNavEnd = viewerAppSource.indexOf('}, [pageCount])', pageNavStart);
    const pageNavBody = viewerAppSource.slice(pageNavStart, pageNavEnd);
    expect(pageNavBody).not.toContain('metaKey');
    expect(pageNavBody).not.toContain('ctrlKey');
  });

  it('page nav useEffect depends on pageCount', () => {
    expect(viewerAppSource).toContain('}, [pageCount])');
  });

  it('page nav listener is registered and cleaned up', () => {
    expect(viewerAppSource).toContain("window.addEventListener('keydown', handlePageNav)");
    expect(viewerAppSource).toContain("window.removeEventListener('keydown', handlePageNav)");
  });

  it('calls preventDefault for all navigation keys', () => {
    // Each case group calls e.preventDefault() — verify it appears in the nav handler
    const pageNavStart = viewerAppSource.indexOf('handlePageNav');
    const pageNavEnd = viewerAppSource.indexOf('}, [pageCount])', pageNavStart);
    const pageNavBody = viewerAppSource.slice(pageNavStart, pageNavEnd);
    const preventCount = (pageNavBody.match(/e\.preventDefault\(\)/g) ?? []).length;
    // One call per case group: next (ArrowRight/Down/PageDown), prev (ArrowLeft/Up/PageUp), Home, End = 4
    expect(preventCount).toBeGreaterThanOrEqual(4);
  });
});

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

const topBarSource = readFileSync(
  new URL('../src/viewer/components/TopBar.tsx', import.meta.url),
  'utf8'
);

// Locate the go-to-page section for scoped assertions
const sectionStart = viewerAppSource.indexOf('Go-to-page keyboard shortcut');
const sectionEnd = viewerAppSource.indexOf('// ---------------------------------------------------------------------------\n  // Drag-and-drop', sectionStart);
const sectionBody = viewerAppSource.slice(sectionStart, sectionEnd);

// ---------------------------------------------------------------------------
// Shortcut mapping
// ---------------------------------------------------------------------------

describe('ViewerApp — go-to-page shortcut: key mapping', () => {
  it('handles the g key', () => {
    expect(sectionBody).toContain("e.key !== 'g'");
  });

  it('requires metaKey or ctrlKey', () => {
    expect(sectionBody).toContain('e.metaKey || e.ctrlKey');
  });

  it('returns early when no modifier is held', () => {
    expect(sectionBody).toContain('if (!(e.metaKey || e.ctrlKey)) return');
  });

  it('returns early when key is not g', () => {
    expect(sectionBody).toContain("if (e.key !== 'g') return");
  });
});

// ---------------------------------------------------------------------------
// pageCount guard
// ---------------------------------------------------------------------------

describe('ViewerApp — go-to-page shortcut: no-document guard', () => {
  it('bails when pageCount is 0', () => {
    expect(sectionBody).toContain('if (pageCount === 0) return');
  });
});

// ---------------------------------------------------------------------------
// preventDefault
// ---------------------------------------------------------------------------

describe('ViewerApp — go-to-page shortcut: preventDefault', () => {
  it('calls e.preventDefault()', () => {
    expect(sectionBody).toContain('e.preventDefault()');
  });
});

// ---------------------------------------------------------------------------
// Dialog wiring (⌘G now opens the go-to-page dialog)
// ---------------------------------------------------------------------------

describe('ViewerApp — go-to-page shortcut: dialog wiring', () => {
  it('creates pageInputRef with useRef (still passed to TopBar)', () => {
    expect(sectionBody).toContain('pageInputRef = useRef<HTMLInputElement | null>(null)');
  });

  it('opens the go-to-page dialog on ⌘G', () => {
    expect(sectionBody).toContain('setGoToPageOpen(true)');
  });

  it('passes pageInputRef to TopBar', () => {
    // Check the TopBar JSX in the full source
    const topBarJsx = viewerAppSource.indexOf('pageInputRef={pageInputRef}');
    expect(topBarJsx).toBeGreaterThan(-1);
  });
});

// ---------------------------------------------------------------------------
// Listener lifecycle
// ---------------------------------------------------------------------------

describe('ViewerApp — go-to-page shortcut: listener lifecycle', () => {
  it('registers a keydown listener', () => {
    expect(sectionBody).toContain("window.addEventListener('keydown', handleGoToPage)");
  });

  it('removes the listener on cleanup', () => {
    expect(sectionBody).toContain("window.removeEventListener('keydown', handleGoToPage)");
  });

  it('useEffect depends on pageCount', () => {
    expect(sectionBody).toContain('}, [pageCount])');
  });
});

// ---------------------------------------------------------------------------
// TopBar — prop interface
// ---------------------------------------------------------------------------

describe('TopBar — pageInputRef prop', () => {
  it('imports RefObject from react', () => {
    const importBlock = topBarSource.slice(0, topBarSource.indexOf('interface TopBarProps'));
    expect(importBlock).toContain('RefObject');
  });

  it('declares pageInputRef in TopBarProps', () => {
    expect(topBarSource).toContain('pageInputRef?:');
  });

  it('types pageInputRef as RefObject<HTMLInputElement | null>', () => {
    expect(topBarSource).toContain('RefObject<HTMLInputElement | null>');
  });

  it('destructures pageInputRef in function signature', () => {
    const destructureStart = topBarSource.indexOf('export function TopBar(');
    const destructureEnd = topBarSource.indexOf('}: TopBarProps)', destructureStart);
    const block = topBarSource.slice(destructureStart, destructureEnd);
    expect(block).toContain('pageInputRef');
  });

  it('assigns ref={pageInputRef} to the page number input', () => {
    expect(topBarSource).toContain('ref={pageInputRef}');
  });

  it('the ref is on an input of type number', () => {
    // ref and type="number" must appear close together
    const refIdx = topBarSource.indexOf('ref={pageInputRef}');
    const typeIdx = topBarSource.indexOf('type="number"', refIdx);
    // within ~200 chars of each other
    expect(typeIdx - refIdx).toBeLessThan(200);
    expect(typeIdx).toBeGreaterThan(refIdx);
  });
});

// ---------------------------------------------------------------------------
// No regressions
// ---------------------------------------------------------------------------

describe('ViewerApp — go-to-page: no regressions with existing shortcuts', () => {
  it('⌘K command palette handler is still present', () => {
    expect(viewerAppSource).toContain("e.key === 'k'");
    expect(viewerAppSource).toContain('setCommandPaletteOpen');
  });

  it('zoom in/out handler is still present', () => {
    expect(viewerAppSource).toContain('handleZoomKey');
    expect(viewerAppSource).toContain("e.key === '='");
  });

  it('mode switching handler is still present', () => {
    expect(viewerAppSource).toContain('handleModeKey');
  });

  it('⌘S save handler in TopBar is still present', () => {
    expect(topBarSource).toContain("e.key === 's'");
    expect(topBarSource).toContain('handleSaveRef');
  });
});

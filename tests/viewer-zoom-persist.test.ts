// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
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
  '../src/viewer/v3/EditorV3Shell.tsx',
  '../src/viewer/WelcomeSection.tsx',
].map(p => readFileSync(new URL(p, import.meta.url), 'utf8')).join('\n\n');

// ---------------------------------------------------------------------------
// localStorage key
// ---------------------------------------------------------------------------

describe('ViewerApp — zoom persistence: localStorage key', () => {
  it("uses the key 'pdfluent.viewer.zoom'", () => {
    expect(viewerAppSource).toContain("'pdfluent.viewer.zoom'");
  });

  it('uses the key consistently for both read and write', () => {
    const occurrences = (viewerAppSource.match(/'pdfluent\.viewer\.zoom'/g) ?? []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Lazy useState initializer — restore on mount
// ---------------------------------------------------------------------------

// Locate the stored-zoom reader and the lazy initializer that uses it
const readerStart = viewerAppSource.indexOf('export function readLastUsedZoom');
const readerEnd = viewerAppSource.indexOf('\n}\n', readerStart) + 3;
const initBlock = viewerAppSource.slice(readerStart, readerEnd);
const initializer = viewerAppSource.slice(
  viewerAppSource.indexOf('const [zoom, setZoomState] = useState('),
  viewerAppSource.indexOf('const [manualFor'),
);

describe('ViewerApp — zoom persistence: lazy initializer', () => {
  it('uses a lazy useState initializer (function form)', () => {
    expect(initializer).toContain('useState(() =>');
  });

  it('reads from localStorage', () => {
    expect(initBlock).toContain('localStorage.getItem');
    expect(initBlock).toContain("'pdfluent.viewer.zoom'");
  });

  it('parses the stored value with parseFloat', () => {
    expect(initBlock).toContain('parseFloat(');
  });

  it('validates the stored value is within the zoom range before using it', () => {
    expect(initBlock).toContain('>= MIN_ZOOM');
    expect(initBlock).toContain('<= MAX_ZOOM');
  });

  it('falls back to 1 when the value is invalid or missing (a fit replaces it on open)', () => {
    expect(initializer).toContain('?? 1');
  });

  it('wraps localStorage access in try/catch', () => {
    expect(initBlock).toContain('try {');
    expect(initBlock).toContain('} catch {');
  });
});

// ---------------------------------------------------------------------------
// Persist effect — only the zoom the reader chose becomes "Last used"
// ---------------------------------------------------------------------------

const persistStart = viewerAppSource.indexOf('Persist the zoom the reader chose');
const persistEnd = viewerAppSource.indexOf('}, [zoom, zoomManual])');
const persistBlock = viewerAppSource.slice(persistStart, persistEnd + '}, [zoom, zoomManual])'.length);

describe('ViewerApp — zoom persistence: write effect', () => {
  it('writes zoom to localStorage when zoom changes', () => {
    expect(persistBlock).toContain('localStorage.setItem');
    expect(persistBlock).toContain("'pdfluent.viewer.zoom'");
  });

  it('stores zoom as a string', () => {
    expect(persistBlock).toContain('String(zoom)');
  });

  it('does not store an automatic fit', () => {
    expect(persistBlock).toContain('if (!zoomManual) return;');
  });

  it('useEffect depends on [zoom, zoomManual]', () => {
    expect(persistBlock).toContain('}, [zoom, zoomManual])');
  });

  it('wraps write in try/catch', () => {
    expect(persistBlock).toContain('try {');
    expect(persistBlock).toContain('} catch {');
  });
});

// ---------------------------------------------------------------------------
// Document-open behavior: zoom no longer resets to 1.0
// ---------------------------------------------------------------------------

describe('ViewerApp — zoom persistence: no reset on document open', () => {
  it('does not call setZoom(1.0) in the document-load effect', () => {
    // Locate the document-load effect body
    const effectStart = viewerAppSource.indexOf('Reset to page 0 and populate derived document data');
    const effectEnd = viewerAppSource.indexOf('}, [pdfDoc?.id])', effectStart);
    const effectBody = viewerAppSource.slice(effectStart, effectEnd);
    expect(effectBody).not.toContain('setZoom(1.0)');
  });

  it('still sets pageIndex on document open (via restoredPage, defaulting to 0)', () => {
    const effectStart = viewerAppSource.indexOf('Reset to page 0 and populate derived document data');
    const effectEnd = viewerAppSource.indexOf('}, [pdfDoc?.id])', effectStart);
    const effectBody = viewerAppSource.slice(effectStart, effectEnd);
    // restoredPage defaults to 0 and is used as setPageIndex argument
    expect(effectBody).toContain('restoredPage = 0');
    expect(effectBody).toContain('setPageIndex(restoredPage)');
  });
});

// ---------------------------------------------------------------------------
// No regressions with zoom interactions
// ---------------------------------------------------------------------------

describe('ViewerApp — zoom persistence: no regressions', () => {
  it('keyboard zoom shortcuts still present', () => {
    expect(viewerAppSource).toContain('handleZoomKey');
  });

  it('scroll-to-zoom still present', () => {
    expect(viewerAppSource).toContain('handleWheel');
    expect(viewerAppSource).toContain('{ passive: false }');
  });

  it('zoom reset button still present', () => {
    expect(viewerAppSource).toContain('zoom-reset-btn');
  });

  it('zoom-reset-btn now opens the presets popover', () => {
    // The percentage button toggles the zoom presets popover
    const testidIdx = viewerAppSource.indexOf('zoom-reset-btn');
    const btnStart = viewerAppSource.lastIndexOf('<button', testidIdx);
    const btnEnd = viewerAppSource.indexOf('</button>', testidIdx);
    const resetBtn = viewerAppSource.slice(btnStart, btnEnd);
    expect(resetBtn).toContain('setZoomPresetsOpen(o => !o)');
  });
});

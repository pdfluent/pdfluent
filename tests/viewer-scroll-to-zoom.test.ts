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

// Locate the scroll-to-zoom section for scoped assertions
const sectionStart = viewerAppSource.indexOf('Scroll-to-zoom');
const sectionEnd = viewerAppSource.indexOf('// ---------------------------------------------------------------------------\n  // Drag-and-drop', sectionStart);
const sectionBody = viewerAppSource.slice(sectionStart, sectionEnd);

// ---------------------------------------------------------------------------
// canvasContainerRef
// ---------------------------------------------------------------------------

describe('ViewerApp — scroll-to-zoom: canvas ref', () => {
  it('creates canvasContainerRef with useRef', () => {
    expect(sectionBody).toContain('canvasContainerRef = useRef<HTMLDivElement | null>(null)');
  });

  it('attaches canvasContainerRef to the canvas container div', () => {
    expect(viewerAppSource).toContain('ref={canvasContainerRef}');
  });

  it('ref is on the document canvas container', () => {
    const refIdx = viewerAppSource.indexOf('ref={canvasContainerRef}');
    const classIdx = viewerAppSource.indexOf('overflow-auto bg-muted/30', refIdx);
    expect(classIdx - refIdx).toBeLessThan(80);
  });
});

// ---------------------------------------------------------------------------
// Non-passive wheel listener
// ---------------------------------------------------------------------------

describe('ViewerApp — scroll-to-zoom: non-passive listener', () => {
  it('adds a wheel event listener to the container', () => {
    expect(sectionBody).toContain("container.addEventListener('wheel', handleWheel");
  });

  it('registers the listener as non-passive', () => {
    expect(sectionBody).toContain('{ passive: false }');
  });

  it('removes the listener on cleanup', () => {
    expect(sectionBody).toContain("container.removeEventListener('wheel', handleWheel)");
  });

  it('useEffect has empty dependency array (stable setZoom and ref)', () => {
    expect(sectionBody).toContain('}, [])');
  });
});

// ---------------------------------------------------------------------------
// Modifier key guard
// ---------------------------------------------------------------------------

describe('ViewerApp — scroll-to-zoom: modifier key guard', () => {
  it('requires ctrlKey or metaKey', () => {
    expect(sectionBody).toContain('e.ctrlKey || e.metaKey');
  });

  it('returns early when no modifier is held', () => {
    expect(sectionBody).toContain('if (!(e.ctrlKey || e.metaKey)) return');
  });
});

// ---------------------------------------------------------------------------
// Zoom direction and bounds
// ---------------------------------------------------------------------------

describe('ViewerApp — scroll-to-zoom: zoom direction', () => {
  it('zooms out when deltaY > 0 (scroll down)', () => {
    expect(sectionBody).toContain('e.deltaY > 0');
  });

  it('applies a negative step when scrolling down (zoom out)', () => {
    expect(sectionBody).toContain('-0.1');
  });

  it('applies a positive step when scrolling up (zoom in)', () => {
    expect(sectionBody).toContain('0.1');
  });

  it('clamps at maximum zoom of 4', () => {
    expect(sectionBody).toContain('Math.min(4,');
  });

  it('clamps at minimum zoom of 0.25', () => {
    expect(sectionBody).toContain('Math.max(0.25,');
  });
});

// ---------------------------------------------------------------------------
// preventDefault — suppress browser zoom
// ---------------------------------------------------------------------------

describe('ViewerApp — scroll-to-zoom: preventDefault', () => {
  it('calls e.preventDefault() to suppress browser pinch-zoom', () => {
    expect(sectionBody).toContain('e.preventDefault()');
  });
});

// ---------------------------------------------------------------------------
// Normal scroll unaffected
// ---------------------------------------------------------------------------

describe('ViewerApp — scroll-to-zoom: normal scroll unaffected', () => {
  it('only intercepts when modifier key is held (guard is first in handler)', () => {
    const handlerStart = sectionBody.indexOf('function handleWheel');
    const guardIdx = sectionBody.indexOf('if (!(e.ctrlKey || e.metaKey)) return', handlerStart);
    const preventIdx = sectionBody.indexOf('e.preventDefault()', handlerStart);
    // Guard must come before preventDefault
    expect(guardIdx).toBeGreaterThan(handlerStart);
    expect(guardIdx).toBeLessThan(preventIdx);
  });
});

// ---------------------------------------------------------------------------
// No regressions
// ---------------------------------------------------------------------------

describe('ViewerApp — scroll-to-zoom: no regressions', () => {
  it('keyboard zoom shortcuts still present', () => {
    expect(viewerAppSource).toContain('handleZoomKey');
    expect(viewerAppSource).toContain("e.key === '='");
  });

  it('zoom reset button still present', () => {
    expect(viewerAppSource).toContain('zoom-reset-btn');
  });

  it('ModeToolbar zoom display still receives zoom prop', () => {
    expect(viewerAppSource).toContain('zoom={zoom}');
  });
});

// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const pageCanvasSource = readFileSync(
  new URL('../src/viewer/components/PageCanvas.tsx', import.meta.url),
  'utf8'
);

const annotOverlaySource = readFileSync(
  new URL('../src/viewer/components/AnnotationOverlay.tsx', import.meta.url),
  'utf8'
);

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

const rustLibSource = readFileSync(
  new URL('../src-tauri/src/lib.rs', import.meta.url),
  'utf8'
);

const rustEngineSource = readFileSync(
  new URL('../src-tauri/src/pdf_engine.rs', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// PageCanvas — rectangle draw state
// ---------------------------------------------------------------------------

describe('PageCanvas — rectangle drag state', () => {
  it('declares dragStart state', () => {
    expect(pageCanvasSource).toContain('dragStart');
    expect(pageCanvasSource).toContain('setDragStart');
  });

  it('declares dragCurrent state', () => {
    expect(pageCanvasSource).toContain('dragCurrent');
    expect(pageCanvasSource).toContain('setDragCurrent');
  });

  it('declares onRectDraw prop', () => {
    const ifaceStart = pageCanvasSource.indexOf('interface PageCanvasProps');
    const ifaceEnd = pageCanvasSource.indexOf('\n}', ifaceStart) + 2;
    const iface = pageCanvasSource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('onRectDraw?:');
  });
});

// ---------------------------------------------------------------------------
// PageCanvas — mouse event handlers for rectangle tool
// ---------------------------------------------------------------------------

describe('PageCanvas — mouse handlers for rectangle drawing', () => {
  it('has handlePageMouseDown function', () => {
    expect(pageCanvasSource).toContain('handlePageMouseDown');
  });

  it('handlePageMouseDown only acts when tool is rectangle', () => {
    const fnStart = pageCanvasSource.indexOf('function handlePageMouseDown');
    const fnEnd = pageCanvasSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = pageCanvasSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("activeAnnotationTool !== 'rectangle'");
  });

  it('handlePageMouseDown sets dragStart and dragCurrent', () => {
    const fnStart = pageCanvasSource.indexOf('function handlePageMouseDown');
    const fnEnd = pageCanvasSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = pageCanvasSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('setDragStart(');
    expect(fnBody).toContain('setDragCurrent(');
  });

  it('handlePageMouseMove updates dragCurrent', () => {
    expect(pageCanvasSource).toContain('function handlePageMouseMove');
    const fnStart = pageCanvasSource.indexOf('function handlePageMouseMove');
    const fnEnd = pageCanvasSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = pageCanvasSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('setDragCurrent(');
  });

  it('handlePageMouseUp calls onRectDraw with the computed rect', () => {
    expect(pageCanvasSource).toContain('function handlePageMouseUp');
    const fnStart = pageCanvasSource.indexOf('function handlePageMouseUp');
    const fnEnd = pageCanvasSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = pageCanvasSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('onRectDraw?.(rect)');
  });

  it('handlePageMouseUp rejects rects smaller than 5pt', () => {
    const fnStart = pageCanvasSource.indexOf('function handlePageMouseUp');
    const fnEnd = pageCanvasSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = pageCanvasSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('rect.width > 5');
    expect(fnBody).toContain('rect.height > 5');
  });

  it('handlePageMouseUp clears drag state', () => {
    const fnStart = pageCanvasSource.indexOf('function handlePageMouseUp');
    const fnEnd = pageCanvasSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = pageCanvasSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('setDragStart(null)');
    expect(fnBody).toContain('setDragCurrent(null)');
  });

  it('makePdfRect converts two DOM corner points to a normalized PDF rect', () => {
    expect(pageCanvasSource).toContain('function makePdfRect');
    const fnStart = pageCanvasSource.indexOf('function makePdfRect');
    const fnEnd = pageCanvasSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = pageCanvasSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('pageHeightPt -');
  });

  it('attaches mouse handlers to the page-view container', () => {
    expect(pageCanvasSource).toContain('onMouseDown={handlePageMouseDown}');
    expect(pageCanvasSource).toContain('onMouseMove={handlePageMouseMove}');
    expect(pageCanvasSource).toContain('onMouseUp={handlePageMouseUp}');
  });
});

// ---------------------------------------------------------------------------
// PageCanvas — draftRect preview
// ---------------------------------------------------------------------------

describe('PageCanvas — draftRect preview passed to AnnotationOverlay', () => {
  it('computes draftRect from dragStart and dragCurrent', () => {
    expect(pageCanvasSource).toContain('draftRect');
    expect(pageCanvasSource).toContain('dragStart && dragCurrent');
  });

  it('passes draftRect to AnnotationOverlay', () => {
    const overlayStart = pageCanvasSource.indexOf('<AnnotationOverlay');
    const overlayEnd = pageCanvasSource.indexOf('/>', overlayStart) + 2;
    const overlayEl = pageCanvasSource.slice(overlayStart, overlayEnd);
    expect(overlayEl).toContain('draftRect={draftRect}');
  });
});

// ---------------------------------------------------------------------------
// AnnotationOverlay — draftRect rendered as dashed preview
// ---------------------------------------------------------------------------

describe('AnnotationOverlay — draftRect rendered as dashed preview', () => {
  it('declares draftRect optional prop', () => {
    const ifaceStart = annotOverlaySource.indexOf('interface AnnotationOverlayProps');
    const ifaceEnd = annotOverlaySource.indexOf('\n}', ifaceStart) + 2;
    const iface = annotOverlaySource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('draftRect?:');
  });

  it('renders draftRect with annotation-draft-rect testid', () => {
    expect(annotOverlaySource).toContain('data-testid="annotation-draft-rect"');
  });

  it('uses dashed strokeDasharray for the preview rect', () => {
    const draftStart = annotOverlaySource.indexOf('data-testid="annotation-draft-rect"');
    const draftEnd = annotOverlaySource.indexOf('/>', draftStart) + 2;
    const draftEl = annotOverlaySource.slice(draftStart - 50, draftEnd);
    expect(draftEl).toContain('strokeDasharray');
  });

  it('applies PDF→DOM y-flip to draftRect', () => {
    const draftStart = annotOverlaySource.indexOf('data-testid="annotation-draft-rect"');
    const surrounding = annotOverlaySource.slice(Math.max(0, draftStart - 200), draftStart + 200);
    expect(surrounding).toContain('pageHeightPt -');
    expect(surrounding).toContain('draftRect');
  });
});

// ---------------------------------------------------------------------------
// AnnotationOverlay — rectangle type rendering
// ---------------------------------------------------------------------------

describe('AnnotationOverlay — rectangle/square type renders as outlined rect', () => {
  it("checks for t === 'square' or t === 'rectangle' annotation type", () => {
    expect(annotOverlaySource).toContain("t === 'square'");
    expect(annotOverlaySource).toContain("t === 'rectangle'");
  });

  it('renders rectangle as <rect> with fill and stroke', () => {
    const rectTypeStart = annotOverlaySource.indexOf("t === 'square' || t === 'rectangle'");
    const blockEnd = annotOverlaySource.indexOf("if (t === 'highlight')", rectTypeStart);
    const block = annotOverlaySource.slice(rectTypeStart, blockEnd);
    expect(block).toContain('fill={mark.color}');
    expect(block).toContain('stroke={mark.color}');
    expect(block).toContain('fillOpacity=');
  });

  it('rectangle marker has data-testid annotation-marker', () => {
    const rectTypeStart = annotOverlaySource.indexOf("t === 'square' || t === 'rectangle'");
    const blockEnd = annotOverlaySource.indexOf("if (t === 'highlight')", rectTypeStart);
    const block = annotOverlaySource.slice(rectTypeStart, blockEnd);
    expect(block).toContain('data-testid="annotation-marker"');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — handleRectDraw callback
// ---------------------------------------------------------------------------

describe('ViewerApp — handleRectDraw callback', () => {
  it('is defined as a useCallback', () => {
    expect(viewerAppSource).toContain('const handleRectDraw = useCallback(');
  });

  it('guards against missing pdfDoc or isTauri', () => {
    const fnStart = viewerAppSource.indexOf('const handleRectDraw = useCallback(');
    const fnEnd = viewerAppSource.indexOf('[pdfDoc, pageIndex, refetchComments', fnStart) + 80;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('!pdfDoc');
    expect(fnBody).toContain('!isTauri');
  });

  it('guards against document load in progress', () => {
    const fnStart = viewerAppSource.indexOf('const handleRectDraw = useCallback(');
    const fnEnd = viewerAppSource.indexOf('[pdfDoc, pageIndex, refetchComments', fnStart) + 80;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('docLoadingRef.current');
  });

  it('invokes add_shape_annotation with shapeType rectangle', () => {
    const fnStart = viewerAppSource.indexOf('const handleRectDraw = useCallback(');
    const fnEnd = viewerAppSource.indexOf('[pdfDoc, pageIndex, refetchComments', fnStart) + 80;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("invoke('add_shape_annotation'");
    expect(fnBody).toContain("shapeType: 'rectangle'");
  });

  it('passes pageIndex, rect, and color to add_shape_annotation', () => {
    const fnStart = viewerAppSource.indexOf('const handleRectDraw = useCallback(');
    const fnEnd = viewerAppSource.indexOf('[pdfDoc, pageIndex, refetchComments', fnStart) + 80;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('pageIndex');
    expect(fnBody).toContain('rect: backendRect');
    expect(fnBody).toContain('color');
  });

  it('resets activeAnnotationTool to null after draw', () => {
    const fnStart = viewerAppSource.indexOf('const handleRectDraw = useCallback(');
    const fnEnd = viewerAppSource.indexOf('[pdfDoc, pageIndex, refetchComments', fnStart) + 80;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('setActiveAnnotationTool(null)');
  });

  it('passes handleRectDraw to PageCanvas as onRectDraw', () => {
    expect(viewerAppSource).toContain('onRectDraw={handleRectDraw}');
  });
});

// ---------------------------------------------------------------------------
// Rust — add_shape_annotation backend
// ---------------------------------------------------------------------------

describe('Rust — add_shape_annotation backend', () => {
  it('is defined in pdf_engine.rs', () => {
    expect(rustEngineSource).toContain('pub fn add_shape_annotation(');
  });

  it('accepts page_index, rect, shape_type, and color', () => {
    const fnStart = rustEngineSource.indexOf('pub fn add_shape_annotation(');
    const fnEnd = rustEngineSource.indexOf('\n    }', fnStart) + 6;
    const fnBody = rustEngineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('page_index');
    expect(fnBody).toContain('shape_type');
    expect(fnBody).toContain('color');
  });

  it('add_shape_annotation Tauri command is registered in lib.rs', () => {
    expect(rustLibSource).toContain('add_shape_annotation,');
  });
});

// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const textLayerSource = readFileSync(
  new URL('../src/viewer/components/TextLayer.tsx', import.meta.url),
  'utf8'
);

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

const rustLibSource = readFileSync(
  new URL('../src-tauri/src/lib.rs', import.meta.url),
  'utf8'
);

const rustEngineSource = readFileSync(
  new URL('../src-tauri/src/pdf_engine.rs', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// TextLayer — onTextSelection prop
// ---------------------------------------------------------------------------

describe('TextLayer — onTextSelection prop', () => {
  it('declares onTextSelection optional prop', () => {
    expect(textLayerSource).toContain('onTextSelection?:');
  });

  it('onTextSelection receives PDF-coordinate rects', () => {
    const ifaceStart = textLayerSource.indexOf('interface TextLayerProps');
    const ifaceEnd = textLayerSource.indexOf('\n}', ifaceStart) + 2;
    const iface = textLayerSource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('x: number');
    expect(iface).toContain('y: number');
    expect(iface).toContain('width: number');
    expect(iface).toContain('height: number');
  });

  it('attaches onMouseUp handler to the container', () => {
    expect(textLayerSource).toContain('onMouseUp={handleMouseUp}');
  });
});

// ---------------------------------------------------------------------------
// TextLayer — handleMouseUp text selection → PDF rects
// ---------------------------------------------------------------------------

describe('TextLayer — handleMouseUp text-to-PDF coordinate conversion', () => {
  it('returns early when onTextSelection is not provided', () => {
    expect(textLayerSource).toContain('if (!onTextSelection) return');
  });

  it('returns early when selection is collapsed', () => {
    expect(textLayerSource).toContain('sel.isCollapsed');
  });

  it('uses range.getClientRects() for multi-rect selection', () => {
    expect(textLayerSource).toContain('range.getClientRects()');
  });

  it('measures container bounds to compute relative coords', () => {
    expect(textLayerSource).toContain('containerBounds');
    expect(textLayerSource).toContain('getBoundingClientRect()');
  });

  it('applies PDF y-flip: y = pageHeightPt - (relY / zoom) - h', () => {
    expect(textLayerSource).toContain('pageHeightPt - (relY / zoom) - h');
  });

  it('divides by zoom to convert DOM pixels to PDF points', () => {
    expect(textLayerSource).toContain('/ zoom');
  });

  it('filters out degenerate rects (width/height ≤ 1)', () => {
    expect(textLayerSource).toContain('r.width > 1');
    expect(textLayerSource).toContain('r.height > 1');
  });

  it('calls onTextSelection with the computed PDF rects', () => {
    expect(textLayerSource).toContain('onTextSelection(pdfRects)');
  });

  it('clears the DOM selection after reporting rects', () => {
    expect(textLayerSource).toContain('sel.removeAllRanges()');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — handleTextSelection wiring
// ---------------------------------------------------------------------------

describe('ViewerApp — handleTextSelection callback', () => {
  it('is defined as a useCallback', () => {
    expect(viewerAppSource).toContain('const handleTextSelection = useCallback(');
  });

  it('guards against missing pdfDoc, isTauri, or inactive tool', () => {
    const fnStart = viewerAppSource.indexOf('const handleTextSelection = useCallback(');
    const fnEnd = viewerAppSource.indexOf('[pdfDoc, pageIndex, activeAnnotationTool', fnStart) + 80;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('!pdfDoc');
    expect(fnBody).toContain('!isTauri');
    expect(fnBody).toContain('!activeAnnotationTool');
  });

  it('guards against document load in progress', () => {
    const fnStart = viewerAppSource.indexOf('const handleTextSelection = useCallback(');
    const fnEnd = viewerAppSource.indexOf('[pdfDoc, pageIndex, activeAnnotationTool', fnStart) + 80;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('docLoadingRef.current');
  });

  it('filters out zero-size rects before sending to backend', () => {
    const fnStart = viewerAppSource.indexOf('const handleTextSelection = useCallback(');
    const fnEnd = viewerAppSource.indexOf('[pdfDoc, pageIndex, activeAnnotationTool', fnStart) + 80;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('r.width > 0');
    expect(fnBody).toContain('r.height > 0');
  });

  it('invokes add_highlight_annotation when tool is highlight', () => {
    const fnStart = viewerAppSource.indexOf('const handleTextSelection = useCallback(');
    const fnEnd = viewerAppSource.indexOf('[pdfDoc, pageIndex, activeAnnotationTool', fnStart) + 80;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("invoke('add_highlight_annotation'");
  });

  it('passes pageIndex, rects, and color to add_highlight_annotation', () => {
    const fnStart = viewerAppSource.indexOf('const handleTextSelection = useCallback(');
    const fnEnd = viewerAppSource.indexOf('[pdfDoc, pageIndex, activeAnnotationTool', fnStart) + 80;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('pageIndex');
    expect(fnBody).toContain('rects: backendRects');
    expect(fnBody).toContain('color');
  });

  it('converts rects to [x, y, x+w, y+h] backend format', () => {
    const fnStart = viewerAppSource.indexOf('const handleTextSelection = useCallback(');
    const fnEnd = viewerAppSource.indexOf('[pdfDoc, pageIndex, activeAnnotationTool', fnStart) + 80;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('r.x + r.width');
    expect(fnBody).toContain('r.y + r.height');
  });

  it('calls refetchComments after creating the annotation', () => {
    const fnStart = viewerAppSource.indexOf('const handleTextSelection = useCallback(');
    const fnEnd = viewerAppSource.indexOf('[pdfDoc, pageIndex, activeAnnotationTool', fnStart) + 80;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('refetchComments()');
  });

  it('calls markDirty after creating the annotation', () => {
    const fnStart = viewerAppSource.indexOf('const handleTextSelection = useCallback(');
    const fnEnd = viewerAppSource.indexOf('[pdfDoc, pageIndex, activeAnnotationTool', fnStart) + 80;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('markDirty()');
  });

  it('resets activeAnnotationTool to null after creating the annotation', () => {
    const fnStart = viewerAppSource.indexOf('const handleTextSelection = useCallback(');
    const fnEnd = viewerAppSource.indexOf('[pdfDoc, pageIndex, activeAnnotationTool', fnStart) + 80;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('setActiveAnnotationTool(null)');
  });

  it('passes handleTextSelection to PageCanvas as onTextSelection', () => {
    expect(viewerAppSource).toContain('onTextSelection={handleTextSelection}');
  });
});

// ---------------------------------------------------------------------------
// Rust — add_highlight_annotation backend
// ---------------------------------------------------------------------------

describe('Rust — add_highlight_annotation backend', () => {
  it('is defined in pdf_engine.rs', () => {
    expect(rustEngineSource).toContain('pub fn add_highlight_annotation(');
  });

  it('accepts page_index, rects slice, and color', () => {
    const fnStart = rustEngineSource.indexOf('pub fn add_highlight_annotation(');
    const fnEnd = rustEngineSource.indexOf('\n    }', fnStart) + 6;
    const fnBody = rustEngineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('page_index');
    expect(fnBody).toContain('rects');
    expect(fnBody).toContain('color');
  });

  it('uses AnnotationBuilder::highlight', () => {
    expect(rustEngineSource).toContain('AnnotationBuilder::highlight(');
  });

  it('generates QuadPoints from rects', () => {
    expect(rustEngineSource).toContain('quad_points');
  });

  it('calls sync_after_mutation', () => {
    const fnStart = rustEngineSource.indexOf('pub fn add_highlight_annotation(');
    const fnEnd = rustEngineSource.indexOf('\n    }', fnStart) + 6;
    const fnBody = rustEngineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('sync_after_mutation()');
  });

  it('add_highlight_annotation Tauri command is registered in lib.rs', () => {
    expect(rustLibSource).toContain('add_highlight_annotation,');
  });

  it('Tauri command delegates to OpenDocument method', () => {
    const fnStart = rustLibSource.indexOf('fn add_highlight_annotation(');
    const fnEnd = rustLibSource.indexOf('\n}', fnStart) + 2;
    const fnBody = rustLibSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('doc.add_highlight_annotation(');
  });
});

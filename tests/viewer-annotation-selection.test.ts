// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

const rightPanelSource = readFileSync(
  new URL('../src/viewer/components/RightContextPanel.tsx', import.meta.url),
  'utf8'
);

const annotOverlaySource = readFileSync(
  new URL('../src/viewer/components/AnnotationOverlay.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// ViewerApp — selectedAnnotationId state
// ---------------------------------------------------------------------------

describe('ViewerApp — selectedAnnotationId state', () => {
  it('declares selectedAnnotationId state', () => {
    expect(viewerAppSource).toContain('const [selectedAnnotationId, setSelectedAnnotationId]');
  });

  it('initialises selectedAnnotationId to null', () => {
    const stateDecl = viewerAppSource.indexOf('const [selectedAnnotationId, setSelectedAnnotationId]');
    const lineEnd = viewerAppSource.indexOf('\n', stateDecl);
    const line = viewerAppSource.slice(stateDecl, lineEnd);
    expect(line).toContain('null');
  });

  it('passes selectedAnnotationId to PageCanvas', () => {
    expect(viewerAppSource).toContain('selectedAnnotationId={selectedAnnotationId}');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — handleAnnotationClick selects markup annotations
// ---------------------------------------------------------------------------

describe('ViewerApp — handleAnnotationClick handles markup annotations', () => {
  it('looks up clicked annotation in allAnnotations', () => {
    const fnStart = viewerAppSource.indexOf('const handleAnnotationClick = useCallback(');
    const fnEnd = viewerAppSource.indexOf('[allAnnotations, comments, mode])', fnStart) + 35;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('allAnnotations.find(a => a.id === annotationId)');
  });

  it('sets selectedAnnotationId for non-text annotation types', () => {
    const fnStart = viewerAppSource.indexOf('const handleAnnotationClick = useCallback(');
    const fnEnd = viewerAppSource.indexOf('[allAnnotations, comments, mode])', fnStart) + 35;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('setSelectedAnnotationId(');
  });

  it('toggles selection off if same annotation clicked again', () => {
    const fnStart = viewerAppSource.indexOf('const handleAnnotationClick = useCallback(');
    const fnEnd = viewerAppSource.indexOf('[allAnnotations, comments, mode])', fnStart) + 35;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('prev === annotationId ? null : annotationId');
  });

  it("routes text annotations to comment sidebar (ann.type === 'text')", () => {
    const fnStart = viewerAppSource.indexOf('const handleAnnotationClick = useCallback(');
    const fnEnd = viewerAppSource.indexOf('[allAnnotations, comments, mode])', fnStart) + 35;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("ann.type === 'text'");
  });

  it('always switches mode to review on annotation click', () => {
    const fnStart = viewerAppSource.indexOf('const handleAnnotationClick = useCallback(');
    const fnEnd = viewerAppSource.indexOf('[allAnnotations, comments, mode])', fnStart) + 35;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("setMode('review')");
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — selectedAnnotation useMemo
// ---------------------------------------------------------------------------

describe('ViewerApp — selectedAnnotation useMemo', () => {
  it('derives selectedAnnotation from allAnnotations by selectedAnnotationId', () => {
    expect(viewerAppSource).toContain('const selectedAnnotation = useMemo(');
    const memoStart = viewerAppSource.indexOf('const selectedAnnotation = useMemo(');
    const memoEnd = viewerAppSource.indexOf('[selectedAnnotationId, allAnnotations]', memoStart) + 40;
    const memoBody = viewerAppSource.slice(memoStart, memoEnd);
    expect(memoBody).toContain('allAnnotations.find(a => a.id === selectedAnnotationId)');
  });

  it('returns null when selectedAnnotationId is null', () => {
    const memoStart = viewerAppSource.indexOf('const selectedAnnotation = useMemo(');
    const memoEnd = viewerAppSource.indexOf('[selectedAnnotationId, allAnnotations]', memoStart) + 40;
    const memoBody = viewerAppSource.slice(memoStart, memoEnd);
    expect(memoBody).toContain('if (!selectedAnnotationId) return null');
  });

  it('passes selectedAnnotation to RightContextPanel', () => {
    expect(viewerAppSource).toContain('selectedAnnotation={selectedAnnotation}');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — handleDeleteSelectedAnnotation
// ---------------------------------------------------------------------------

describe('ViewerApp — handleDeleteSelectedAnnotation', () => {
  it('is defined as a useCallback', () => {
    expect(viewerAppSource).toContain('const handleDeleteSelectedAnnotation = useCallback(');
  });

  it('calls engine.annotation.deleteAnnotation', () => {
    const fnStart = viewerAppSource.indexOf('const handleDeleteSelectedAnnotation = useCallback(');
    const fnEnd = viewerAppSource.indexOf('[pdfDoc, engine, refetchComments])', fnStart) + 35;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('deleteAnnotation(pdfDoc, annotationId)');
  });

  it('resets selectedAnnotationId to null on success', () => {
    const fnStart = viewerAppSource.indexOf('const handleDeleteSelectedAnnotation = useCallback(');
    const fnEnd = viewerAppSource.indexOf('[pdfDoc, engine, refetchComments])', fnStart) + 35;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('setSelectedAnnotationId(null)');
  });

  it('calls refetchComments after deleting', () => {
    const fnStart = viewerAppSource.indexOf('const handleDeleteSelectedAnnotation = useCallback(');
    const fnEnd = viewerAppSource.indexOf('[pdfDoc, engine, refetchComments])', fnStart) + 35;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('refetchComments()');
  });

  it('passes handleDeleteSelectedAnnotation to RightContextPanel', () => {
    expect(viewerAppSource).toContain('onDeleteSelectedAnnotation={handleDeleteSelectedAnnotation}');
  });
});

// ---------------------------------------------------------------------------
// RightContextPanel — selected annotation panel
// ---------------------------------------------------------------------------

describe('RightContextPanel — selectedAnnotation props', () => {
  it('declares selectedAnnotation optional prop', () => {
    const ifaceStart = rightPanelSource.indexOf('interface RightContextPanelProps');
    const ifaceEnd = rightPanelSource.indexOf('\n}', ifaceStart) + 2;
    const iface = rightPanelSource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('selectedAnnotation?:');
  });

  it('declares onDeleteSelectedAnnotation optional prop', () => {
    const ifaceStart = rightPanelSource.indexOf('interface RightContextPanelProps');
    const ifaceEnd = rightPanelSource.indexOf('\n}', ifaceStart) + 2;
    const iface = rightPanelSource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('onDeleteSelectedAnnotation?:');
  });

  it('renders selected-annotation-panel when selectedAnnotation is truthy', () => {
    expect(rightPanelSource).toContain('data-testid="selected-annotation-panel"');
    const panelStart = rightPanelSource.indexOf('data-testid="selected-annotation-panel"');
    // Look back far enough to catch the {selectedAnnotation && ( guard above the CollapsibleSection
    const guardSlice = rightPanelSource.slice(Math.max(0, panelStart - 300), panelStart);
    expect(guardSlice).toContain('selectedAnnotation');
  });

  it('renders delete-selected-annotation-btn', () => {
    expect(rightPanelSource).toContain('data-testid="delete-selected-annotation-btn"');
  });

  it('delete button calls onDeleteSelectedAnnotation with selectedAnnotation.id', () => {
    const btnIdx = rightPanelSource.indexOf('data-testid="delete-selected-annotation-btn"');
    const surrounding = rightPanelSource.slice(btnIdx - 20, btnIdx + 300);
    expect(surrounding).toContain('onDeleteSelectedAnnotation?.(selectedAnnotation.id)');
  });

  it('shows annotation type and page number', () => {
    const panelIdx = rightPanelSource.indexOf('data-testid="selected-annotation-panel"');
    // Window must be wide enough to reach past the color picker onChange block
    const panelBlock = rightPanelSource.slice(panelIdx, panelIdx + 1100);
    expect(panelBlock).toContain('selectedAnnotation.type');
    expect(panelBlock).toContain('selectedAnnotation.pageIndex');
  });

  it('shows annotation color swatch', () => {
    const panelIdx = rightPanelSource.indexOf('data-testid="selected-annotation-panel"');
    const panelBlock = rightPanelSource.slice(panelIdx, panelIdx + 400);
    expect(panelBlock).toContain('selectedAnnotation.color');
  });
});

// ---------------------------------------------------------------------------
// AnnotationOverlay — selectedAnnotationId visual distinction
// ---------------------------------------------------------------------------

describe('AnnotationOverlay — selectedAnnotationId renders with visual distinction', () => {
  it('declares selectedAnnotationId optional prop', () => {
    const ifaceStart = annotOverlaySource.indexOf('interface AnnotationOverlayProps');
    const ifaceEnd = annotOverlaySource.indexOf('\n}', ifaceStart) + 2;
    const iface = annotOverlaySource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('selectedAnnotationId?:');
  });

  it('computes isSelected per annotation marker', () => {
    expect(annotOverlaySource).toContain('isSelected = mark.id === selectedAnnotationId');
  });

  it('selected annotation uses different stroke or opacity', () => {
    // The selected state affects strokeWidth or strokeOpacity in the marker elements
    const markers = annotOverlaySource.indexOf('clickableAnnotations.map(');
    const markersEnd = annotOverlaySource.indexOf('Active annotation highlight', markers);
    const markersBlock = annotOverlaySource.slice(markers, markersEnd);
    expect(markersBlock).toContain('isSelected');
    // Selected markers use a thicker stroke or higher opacity
    expect(markersBlock).toMatch(/isSelected.*\d+[.,]\d+|isSelected.*strokeWidth/);
  });
});

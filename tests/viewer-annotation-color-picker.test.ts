// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const rightPanelSource = readFileSync(
  new URL('../src/viewer/components/RightContextPanel.tsx', import.meta.url),
  'utf8'
);

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// RightContextPanel — colorToHex helper
// ---------------------------------------------------------------------------

describe('RightContextPanel — colorToHex helper', () => {
  it('defines colorToHex function', () => {
    expect(rightPanelSource).toContain('function colorToHex(');
  });

  it('handles hex colors that already start with #', () => {
    const fnStart = rightPanelSource.indexOf('function colorToHex(');
    const fnEnd = rightPanelSource.indexOf('\n}', fnStart) + 2;
    const fnBody = rightPanelSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("startsWith('#')");
  });

  it('parses rgb() CSS color strings', () => {
    const fnStart = rightPanelSource.indexOf('function colorToHex(');
    const fnEnd = rightPanelSource.indexOf('\n}', fnStart) + 2;
    const fnBody = rightPanelSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('rgb\\(');
  });

  it('falls back to #000000 for unrecognized colors', () => {
    const fnStart = rightPanelSource.indexOf('function colorToHex(');
    const fnEnd = rightPanelSource.indexOf('\n}', fnStart) + 2;
    const fnBody = rightPanelSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('#000000');
  });
});

// ---------------------------------------------------------------------------
// RightContextPanel — onUpdateAnnotationColor prop
// ---------------------------------------------------------------------------

describe('RightContextPanel — onUpdateAnnotationColor prop', () => {
  it('declares onUpdateAnnotationColor optional prop in interface', () => {
    const ifaceStart = rightPanelSource.indexOf('interface RightContextPanelProps');
    const ifaceEnd = rightPanelSource.indexOf('\n}', ifaceStart) + 2;
    const iface = rightPanelSource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('onUpdateAnnotationColor?:');
  });

  it('onUpdateAnnotationColor takes annotationId string and color tuple', () => {
    const ifaceStart = rightPanelSource.indexOf('interface RightContextPanelProps');
    const ifaceEnd = rightPanelSource.indexOf('\n}', ifaceStart) + 2;
    const iface = rightPanelSource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('[number, number, number]');
  });

  it('destructures onUpdateAnnotationColor in component function', () => {
    expect(rightPanelSource).toContain('onUpdateAnnotationColor');
  });
});

// ---------------------------------------------------------------------------
// RightContextPanel — annotation-color-picker input element
// ---------------------------------------------------------------------------

describe('RightContextPanel — annotation-color-picker input', () => {
  it('renders annotation-color-picker input', () => {
    expect(rightPanelSource).toContain('data-testid="annotation-color-picker"');
  });

  it('color picker is of type color', () => {
    const pickerIdx = rightPanelSource.indexOf('data-testid="annotation-color-picker"');
    const surrounding = rightPanelSource.slice(pickerIdx, pickerIdx + 500);
    expect(surrounding).toContain('type="color"');
  });

  it('color picker value uses colorToHex(selectedAnnotation.color)', () => {
    const pickerIdx = rightPanelSource.indexOf('data-testid="annotation-color-picker"');
    const surrounding = rightPanelSource.slice(pickerIdx, pickerIdx + 200);
    expect(surrounding).toContain('colorToHex(selectedAnnotation.color)');
  });

  it('onChange handler converts hex to [r, g, b] fractions (divides by 255)', () => {
    const pickerIdx = rightPanelSource.indexOf('data-testid="annotation-color-picker"');
    const surrounding = rightPanelSource.slice(pickerIdx, pickerIdx + 600);
    expect(surrounding).toContain('/ 255');
  });

  it('onChange calls onUpdateAnnotationColor with selectedAnnotation.id and color tuple', () => {
    const pickerIdx = rightPanelSource.indexOf('data-testid="annotation-color-picker"');
    const surrounding = rightPanelSource.slice(pickerIdx, pickerIdx + 600);
    expect(surrounding).toContain('onUpdateAnnotationColor?.(selectedAnnotation.id');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — handleUpdateAnnotationColor
// ---------------------------------------------------------------------------

describe('ViewerApp — handleUpdateAnnotationColor', () => {
  it('is defined as a useCallback', () => {
    expect(viewerAppSource).toContain('const handleUpdateAnnotationColor = useCallback(');
  });

  it('invokes update_annotation_color backend command', () => {
    const fnStart = viewerAppSource.indexOf('const handleUpdateAnnotationColor = useCallback(');
    const fnEnd = viewerAppSource.indexOf('[pdfDoc, refetchComments, markDirty]', fnStart) + 40;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("invoke('update_annotation_color'");
  });

  it('passes annotationId and color to backend', () => {
    const fnStart = viewerAppSource.indexOf('const handleUpdateAnnotationColor = useCallback(');
    const fnEnd = viewerAppSource.indexOf('[pdfDoc, refetchComments, markDirty]', fnStart) + 40;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('annotationId');
    expect(fnBody).toContain('color');
  });

  it('calls refetchComments after updating color', () => {
    const fnStart = viewerAppSource.indexOf('const handleUpdateAnnotationColor = useCallback(');
    const fnEnd = viewerAppSource.indexOf('[pdfDoc, refetchComments, markDirty]', fnStart) + 40;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('refetchComments()');
  });

  it('calls markDirty after updating color', () => {
    const fnStart = viewerAppSource.indexOf('const handleUpdateAnnotationColor = useCallback(');
    const fnEnd = viewerAppSource.indexOf('[pdfDoc, refetchComments, markDirty]', fnStart) + 40;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('markDirty()');
  });

  it('passes handleUpdateAnnotationColor to RightContextPanel', () => {
    expect(viewerAppSource).toContain('onUpdateAnnotationColor={handleUpdateAnnotationColor}');
  });
});

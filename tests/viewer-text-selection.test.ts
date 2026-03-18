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

const pageCanvasSource = readFileSync(
  new URL('../src/viewer/components/PageCanvas.tsx', import.meta.url),
  'utf8'
);

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

const documentModelSource = readFileSync(
  new URL('../src/core/document/model.ts', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// TextLayer component
// ---------------------------------------------------------------------------

describe('TextLayer — structure', () => {
  it('has data-testid="text-layer" on root div', () => {
    expect(textLayerSource).toContain('data-testid="text-layer"');
  });

  it('has data-testid="text-span" on each span', () => {
    expect(textLayerSource).toContain('data-testid="text-span"');
  });

  it('root div has position: absolute', () => {
    expect(textLayerSource).toContain("position: 'absolute'");
  });

  it('root div has userSelect: text', () => {
    expect(textLayerSource).toContain("userSelect: 'text'");
  });

  it('root div has pointerEvents: auto', () => {
    expect(textLayerSource).toContain("pointerEvents: 'auto'");
  });

  it('spans have color: transparent', () => {
    expect(textLayerSource).toContain("color: 'transparent'");
  });

  it('spans have cursor: text', () => {
    expect(textLayerSource).toContain("cursor: 'text'");
  });
});

// ---------------------------------------------------------------------------
// TextLayer coordinate transform
// ---------------------------------------------------------------------------

describe('TextLayer — coordinate transform', () => {
  it('computes domX = span.rect.x * zoom', () => {
    expect(textLayerSource).toContain('span.rect.x * zoom');
  });

  it('computes domY using pageHeightPt to flip Y axis', () => {
    expect(textLayerSource).toContain('pageHeightPt - span.rect.y - span.rect.height');
  });

  it('computes domWidth = span.rect.width * zoom', () => {
    expect(textLayerSource).toContain('span.rect.width * zoom');
  });

  it('applies zoom to fontSize', () => {
    expect(textLayerSource).toContain('span.fontSize * zoom');
  });
});

// ---------------------------------------------------------------------------
// TextLayer props
// ---------------------------------------------------------------------------

describe('TextLayer — props', () => {
  it('accepts textSpans prop', () => {
    expect(textLayerSource).toContain('textSpans');
  });

  it('accepts pageWidthPt prop', () => {
    expect(textLayerSource).toContain('pageWidthPt');
  });

  it('accepts pageHeightPt prop', () => {
    expect(textLayerSource).toContain('pageHeightPt');
  });

  it('accepts zoom prop', () => {
    expect(textLayerSource).toContain('zoom');
  });
});

// ---------------------------------------------------------------------------
// PageCanvas — wrapping
// ---------------------------------------------------------------------------

describe('PageCanvas — relative container', () => {
  it('has data-testid="page-view" on the relative wrapper', () => {
    expect(pageCanvasSource).toContain('data-testid="page-view"');
  });

  it('page-view wrapper has position: relative', () => {
    expect(pageCanvasSource).toContain("position: 'relative'");
  });

  it('imports TextLayer', () => {
    expect(pageCanvasSource).toContain('TextLayer');
  });

  it('renders TextLayer inside the page-view wrapper', () => {
    const wrapperIdx = pageCanvasSource.indexOf('page-view');
    const textLayerIdx = pageCanvasSource.indexOf('<TextLayer', wrapperIdx);
    expect(textLayerIdx).toBeGreaterThan(wrapperIdx);
  });

  it('accepts textSpans prop', () => {
    expect(pageCanvasSource).toContain('textSpans');
  });

  it('accepts pageWidthPt prop', () => {
    expect(pageCanvasSource).toContain('pageWidthPt');
  });

  it('accepts pageHeightPt prop', () => {
    expect(pageCanvasSource).toContain('pageHeightPt');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — copy handler and page change
// ---------------------------------------------------------------------------

describe('ViewerApp — text selection wiring', () => {
  it('has handleCopy keydown handler', () => {
    expect(viewerAppSource).toContain('handleCopy');
  });

  it('copy handler checks for metaKey or ctrlKey with key c', () => {
    expect(viewerAppSource).toContain("e.key !== 'c'");
  });

  it('copy handler uses navigator.clipboard.writeText', () => {
    expect(viewerAppSource).toContain('navigator.clipboard.writeText');
  });

  it('page change clears text selection', () => {
    expect(viewerAppSource).toContain("window.getSelection()?.removeAllRanges()");
  });

  it('passes textSpans to PageCanvas', () => {
    expect(viewerAppSource).toContain('textSpans={textSpans}');
  });

  it('passes pageWidthPt to PageCanvas', () => {
    expect(viewerAppSource).toContain('pageWidthPt=');
  });

  it('passes pageHeightPt to PageCanvas', () => {
    expect(viewerAppSource).toContain('pageHeightPt=');
  });

  it('declares textSpans state', () => {
    expect(viewerAppSource).toContain('textSpans');
    expect(viewerAppSource).toContain('setTextSpans');
  });
});

// ---------------------------------------------------------------------------
// TextSpan type in document model
// ---------------------------------------------------------------------------

describe('TextSpan type', () => {
  it('TextSpan interface exists in document model', () => {
    expect(documentModelSource).toContain('TextSpan');
  });

  it('TextSpan has text field', () => {
    const spanIdx = documentModelSource.indexOf('interface TextSpan');
    const textIdx = documentModelSource.indexOf('text:', spanIdx);
    expect(textIdx).toBeGreaterThan(spanIdx);
  });

  it('TextSpan has rect field', () => {
    const spanIdx = documentModelSource.indexOf('interface TextSpan');
    const rectIdx = documentModelSource.indexOf('rect:', spanIdx);
    expect(rectIdx).toBeGreaterThan(spanIdx);
  });

  it('TextSpan has fontSize field', () => {
    const spanIdx = documentModelSource.indexOf('interface TextSpan');
    const fontSizeIdx = documentModelSource.indexOf('fontSize:', spanIdx);
    expect(fontSizeIdx).toBeGreaterThan(spanIdx);
  });
});

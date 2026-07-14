// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const tauriQuerySource = readFileSync(
  new URL('../src/platform/engine/tauri/TauriQueryEngine.ts', import.meta.url),
  'utf8'
);

const queryInterfaceSource = readFileSync(
  new URL('../src/core/engine/QueryEngine.ts', import.meta.url),
  'utf8'
);

const mockQuerySource = readFileSync(
  new URL('../src/core/engine/mock/MockQueryEngine.ts', import.meta.url),
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

// ---------------------------------------------------------------------------
// QueryEngine interface — extractPageTextSpans declaration
// ---------------------------------------------------------------------------

describe('QueryEngine interface — extractPageTextSpans', () => {
  it('imports TextSpan type from document model', () => {
    expect(queryInterfaceSource).toContain("import type { PdfDocument, TextSpan }");
  });

  it('declares extractPageTextSpans with document and pageIndex parameters', () => {
    expect(queryInterfaceSource).toContain('extractPageTextSpans(');
    expect(queryInterfaceSource).toContain('pageIndex: number');
  });

  it('returns AsyncEngineResult<TextSpan[]>', () => {
    const fnStart = queryInterfaceSource.indexOf('extractPageTextSpans(');
    const fnEnd = queryInterfaceSource.indexOf(';', fnStart) + 1;
    const sig = queryInterfaceSource.slice(fnStart, fnEnd);
    expect(sig).toContain('AsyncEngineResult<TextSpan[]>');
  });
});

// ---------------------------------------------------------------------------
// TauriQueryEngine — extractPageTextSpans implementation
// ---------------------------------------------------------------------------

describe('TauriQueryEngine — extractPageTextSpans', () => {
  it('imports TextSpan type from document model', () => {
    expect(tauriQuerySource).toContain("import type { PdfDocument, TextSpan }");
  });

  it('imports TextSpanInfo from tauri-api (SDK canonical wire type)', () => {
    expect(tauriQuerySource).toContain("import type { TextSpanInfo } from '../../../lib/tauri-api'");
    expect(tauriQuerySource).not.toContain('interface TauriTextSpan');
  });

  it('declares extractPageTextSpans method', () => {
    expect(tauriQuerySource).toContain('async extractPageTextSpans(');
  });

  it('calls invoke get_page_text_spans with pageIndex', () => {
    expect(tauriQuerySource).toContain("invoke<TextSpanInfo[]>('get_page_text_spans'");
    expect(tauriQuerySource).toContain('pageIndex');
  });

  it('maps TauriTextSpan to TextSpan rect shape', () => {
    const fnStart = tauriQuerySource.indexOf('async extractPageTextSpans(');
    const fnEnd = tauriQuerySource.indexOf('\n  }', fnStart) + 4;
    const fnBody = tauriQuerySource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('rect: { x: s.x, y: s.y, width: s.width, height: s.height }');
    expect(fnBody).toContain('fontSize: s.font_size');
    expect(fnBody).toContain('text: s.text');
  });

  it('returns success: true with mapped spans array', () => {
    const fnStart = tauriQuerySource.indexOf('async extractPageTextSpans(');
    const fnEnd = tauriQuerySource.indexOf('\n  }', fnStart) + 4;
    const fnBody = tauriQuerySource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('success: true');
    expect(fnBody).toContain('spans.map');
  });

  it('returns internal-error on invoke failure', () => {
    const fnStart = tauriQuerySource.indexOf('async extractPageTextSpans(');
    const fnEnd = tauriQuerySource.indexOf('\n  }', fnStart) + 4;
    const fnBody = tauriQuerySource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("code: 'internal-error'");
  });
});

// ---------------------------------------------------------------------------
// MockQueryEngine — extractPageTextSpans stub
// ---------------------------------------------------------------------------

describe('MockQueryEngine — extractPageTextSpans stub', () => {
  it('imports TextSpan from document model', () => {
    expect(mockQuerySource).toContain("import type { PdfDocument, TextSpan }");
  });

  it('has extractPageTextSpans method', () => {
    expect(mockQuerySource).toContain('extractPageTextSpans()');
  });

  it('returns empty array on success (no-op mock)', () => {
    const fnStart = mockQuerySource.indexOf('extractPageTextSpans()');
    const fnEnd = mockQuerySource.indexOf('\n  }', fnStart) + 4;
    const fnBody = mockQuerySource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('success: true');
    expect(fnBody).toContain('value: []');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — text span fetch wiring
// ---------------------------------------------------------------------------

describe('ViewerApp — text span fetch effect', () => {
  it('calls extractPageTextSpans on engine.query', () => {
    expect(viewerAppSource).toContain('engine.query.extractPageTextSpans(pdfDoc, pageIndex)');
  });

  it('sets textSpans from result.value on success', () => {
    const effectStart = viewerAppSource.indexOf('engine.query.extractPageTextSpans(pdfDoc, pageIndex)');
    const effectEnd = viewerAppSource.indexOf(');', effectStart) + 2;
    const effectBlock = viewerAppSource.slice(effectStart - 200, effectEnd + 100);
    expect(effectBlock).toContain('result.success');
    expect(effectBlock).toContain('setTextSpans(result.value)');
  });

  it('clears textSpans immediately on page change before async result', () => {
    const effectStart = viewerAppSource.indexOf('Fetch positioned text spans');
    // v2: the dependency array gained `documentVersion` (forces refetch
    // after page-mutation commands). Match the closing brace with any
    // dependency suffix.
    const closingMatch = viewerAppSource.slice(effectStart).search(/\}, \[pageIndex, pdfDoc\?\.id[^\]]*\]\)/);
    const effectEnd = effectStart + closingMatch + 60;
    const effectBlock = viewerAppSource.slice(effectStart, effectEnd);
    expect(effectBlock).toContain('setTextSpans([])');
    expect(effectBlock).toContain('extractPageTextSpans');
  });

  it('clears selection on page change', () => {
    const effectStart = viewerAppSource.indexOf('Fetch positioned text spans');
    // v2: the dependency array gained `documentVersion` (forces refetch
    // after page-mutation commands). Match the closing brace with any
    // dependency suffix.
    const closingMatch = viewerAppSource.slice(effectStart).search(/\}, \[pageIndex, pdfDoc\?\.id[^\]]*\]\)/);
    const effectEnd = effectStart + closingMatch + 60;
    const effectBlock = viewerAppSource.slice(effectStart, effectEnd);
    expect(effectBlock).toContain("window.getSelection()?.removeAllRanges()");
  });

  it('has cancellation guard to prevent stale setState', () => {
    const effectStart = viewerAppSource.indexOf('Fetch positioned text spans');
    // v2: the dependency array gained `documentVersion` (forces refetch
    // after page-mutation commands). Match the closing brace with any
    // dependency suffix.
    const closingMatch = viewerAppSource.slice(effectStart).search(/\}, \[pageIndex, pdfDoc\?\.id[^\]]*\]\)/);
    const effectEnd = effectStart + closingMatch + 60;
    const effectBlock = viewerAppSource.slice(effectStart, effectEnd);
    expect(effectBlock).toContain('cancelled = true');
    expect(effectBlock).toContain('!cancelled');
  });

  it('depends on both pageIndex and pdfDoc.id to refetch on doc change', () => {
    // v2: dependency array also includes documentVersion so page
    // mutations trigger a re-fetch. Accept either old or new form.
    expect(viewerAppSource).toMatch(/\[pageIndex, pdfDoc\?\.id(?:, documentVersion)?\]/);
  });

  it('guards on pdfDoc and engine before invoking', () => {
    const effectStart = viewerAppSource.indexOf('Fetch positioned text spans');
    // v2: the dependency array gained `documentVersion` (forces refetch
    // after page-mutation commands). Match the closing brace with any
    // dependency suffix.
    const closingMatch = viewerAppSource.slice(effectStart).search(/\}, \[pageIndex, pdfDoc\?\.id[^\]]*\]\)/);
    const effectEnd = effectStart + closingMatch + 60;
    const effectBlock = viewerAppSource.slice(effectStart, effectEnd);
    expect(effectBlock).toContain('if (!pdfDoc || !engine) return');
  });
});

// ---------------------------------------------------------------------------
// Payload shape contract — TextSpan coordinate spec
// ---------------------------------------------------------------------------

describe('TextSpan coordinate contract', () => {
  it('TextLayer applies PDF-to-DOM y-flip: domY = (pageHeightPt - y - height) * zoom', () => {
    const textLayerSource = readFileSync(
      new URL('../src/viewer/components/TextLayer.tsx', import.meta.url),
      'utf8'
    );
    // y origin flip: PDF y-up → DOM y-down
    expect(textLayerSource).toContain('pageHeightPt - span.rect.y - span.rect.height');
    expect(textLayerSource).toContain('* zoom');
  });

  it('AnnotationOverlay uses same coordinate transform for consistency', () => {
    const overlaySource = readFileSync(
      new URL('../src/viewer/components/AnnotationOverlay.tsx', import.meta.url),
      'utf8'
    );
    expect(overlaySource).toContain('pageHeightPt - h.y - h.height');
  });
});

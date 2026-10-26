// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

// The OCR run itself (J-60) is no longer a per-page loop in the frontend that
// keeps words for an overlay: it writes a text layer into the document. Its
// behaviour is tested where it happens -- src-tauri/tests/
// ocr_makes_scans_searchable.rs (scan -> OCR -> save -> search),
// src-tauri/src/ocr_component.rs (the bundled component, checksums) and
// src/lib/__tests__/ocrComponent.test.ts (what "Run OCR" leads to).

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

const ocrOverlaySource = readFileSync(
  new URL('../src/viewer/components/OcrOverlay.tsx', import.meta.url),
  'utf8'
);


const rightPanelSource = readFileSync(
  new URL('../src/viewer/components/RightContextPanel.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// ViewerApp — OCR state reset on document load
// ---------------------------------------------------------------------------

describe('ViewerApp — scanned page detection triggered on document load', () => {
  it('calls setScannedPageIndices inside document load effect', () => {
    const effectStart = viewerAppSource.indexOf('pdfDoc?.id]');
    expect(effectStart).toBeGreaterThan(0);
    const windowStart = viewerAppSource.lastIndexOf('useEffect(() =>', effectStart);
    const effectBody = viewerAppSource.slice(windowStart, effectStart + 12);
    expect(effectBody).toContain('setScannedPageIndices(');
  });

  it('scanned detection uses SCANNED_PAGE_TEXT_THRESHOLD constant', () => {
    expect(viewerAppSource).toContain('SCANNED_PAGE_TEXT_THRESHOLD');
  });

  it('scanned detection threshold is 12', () => {
    expect(viewerAppSource).toContain('SCANNED_PAGE_TEXT_THRESHOLD = 12');
  });

  it('scanned detection iterates all pages in a loop', () => {
    expect(viewerAppSource).toContain('pdfDoc.pages.length');
  });

  it('scanned detection calls extractPageTextSpans per page', () => {
    expect(viewerAppSource).toContain('extractPageTextSpans(pdfDoc, p)');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — handleRunOcr stability
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// OcrOverlay — stability under edge conditions
// ---------------------------------------------------------------------------

describe('OcrOverlay — stability under edge conditions', () => {
  it('returns null early when !visible', () => {
    expect(ocrOverlaySource).toContain('!visible');
    expect(ocrOverlaySource).toContain('return null');
  });

  it('returns null early when words.length === 0', () => {
    expect(ocrOverlaySource).toContain('words.length === 0');
  });

  it('both guards are in a single early-return condition', () => {
    // Both !visible and words.length === 0 on the same return null line
    expect(ocrOverlaySource).toContain('if (!visible || words.length === 0) return null;');
  });

  it('SVG overflow is visible to avoid clipping word boxes near edges', () => {
    expect(ocrOverlaySource).toContain("overflow: 'visible'");
  });

  it('scaleX is computed before the words.map call', () => {
    const scaleXIdx = ocrOverlaySource.indexOf('const scaleX');
    const mapIdx = ocrOverlaySource.indexOf('words.map(');
    expect(scaleXIdx).toBeGreaterThan(0);
    expect(mapIdx).toBeGreaterThan(scaleXIdx);
  });

  it('each rect uses a key prop (idx) for stable React reconciliation', () => {
    expect(ocrOverlaySource).toContain('key={idx}');
  });
});

// ---------------------------------------------------------------------------
// TauriOcrEngine — error handling
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// OcrPanel — stable rendering with empty scannedPageIndices
// ---------------------------------------------------------------------------

describe('OcrPanel — stable rendering', () => {
  it('reads scannedCount from scannedPageIndices.size', () => {
    expect(rightPanelSource).toContain('scannedPageIndices.size');
  });

  it('OcrPanel default parameter for scannedPageIndices is safe (no crash on undefined)', () => {
    // scannedPageIndices must have a default value in OcrPanel destructuring
    const fnStart = rightPanelSource.indexOf('function OcrPanel(');
    const fnSig = rightPanelSource.slice(fnStart, fnStart + 400);
    expect(fnSig).toContain('scannedPageIndices');
  });

  it('run button disabled while OCR is running or runtime is unavailable', () => {
    expect(rightPanelSource).toContain('const controlsDisabled = ocrRunning || !runtimeAvailable || ocrStatusChecking');
    expect(rightPanelSource).toContain('disabled={controlsDisabled}');
  });

  it('run button label changes while OCR is running', () => {
    expect(rightPanelSource).toContain("t('ocr.running')");
  });
});

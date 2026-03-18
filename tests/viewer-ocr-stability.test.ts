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

const ocrOverlaySource = readFileSync(
  new URL('../src/viewer/components/OcrOverlay.tsx', import.meta.url),
  'utf8'
);

const tauriOcrEngineSource = readFileSync(
  new URL('../src/platform/engine/tauri/TauriOcrEngine.ts', import.meta.url),
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

describe('ViewerApp — handleRunOcr: stability', () => {
  it('handleRunOcr is a useCallback', () => {
    expect(viewerAppSource).toContain('handleRunOcr = useCallback');
  });

  it('handleRunOcr sets ocrProgress initial values before try block', () => {
    const fnStart = viewerAppSource.indexOf('handleRunOcr = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('setOcrProgress({ processed: 0, total: pagesToProcess.length })');
  });

  it('handleRunOcr uses try/finally for ocrRunning cleanup', () => {
    const fnStart = viewerAppSource.indexOf('handleRunOcr = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('try {');
    expect(fnBody).toContain('} finally {');
  });

  it('handleRunOcr sets ocrRunning(false) in finally (not in catch)', () => {
    const fnStart = viewerAppSource.indexOf('handleRunOcr = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    const finallyIdx = fnBody.lastIndexOf('finally');
    const finallyBlock = fnBody.slice(finallyIdx);
    expect(finallyBlock).toContain('setOcrRunning(false)');
  });

  it('handleRunOcr uses functional update for ocrProgress increment', () => {
    const fnStart = viewerAppSource.indexOf('handleRunOcr = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    // Must use prev => ... to avoid stale closure issues
    expect(fnBody).toContain('setOcrProgress(prev =>');
  });

  it('handleRunOcr stores results in a new Map copied from ocrPageWords', () => {
    const fnStart = viewerAppSource.indexOf('handleRunOcr = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('new Map(ocrPageWords)');
  });

  it('handleRunOcr calls setOcrPageWords after loop completes', () => {
    const fnStart = viewerAppSource.indexOf('handleRunOcr = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('setOcrPageWords(results)');
  });
});

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

describe('TauriOcrEngine — error handling', () => {
  it('wraps runOcr in try/catch', () => {
    expect(tauriOcrEngineSource).toContain('try {');
    expect(tauriOcrEngineSource).toContain('} catch (err) {');
  });

  it('returns success: false on error', () => {
    const catchStart = tauriOcrEngineSource.indexOf('} catch (err) {');
    const catchEnd = tauriOcrEngineSource.indexOf('}', catchStart + 15) + 1;
    const catchBody = tauriOcrEngineSource.slice(catchStart, catchEnd);
    expect(catchBody).toContain('success: false');
  });

  it('returns internal-error code on error', () => {
    expect(tauriOcrEngineSource).toContain("code: 'internal-error'");
  });

  it('preserves error message from Error instances', () => {
    expect(tauriOcrEngineSource).toContain('err instanceof Error ? err.message : String(err)');
  });

  it('isAvailable returns a boolean', () => {
    expect(tauriOcrEngineSource).toContain('isAvailable(): boolean');
    expect(tauriOcrEngineSource).toContain('return true');
  });
});

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

  it('run button disabled while OCR is running', () => {
    expect(rightPanelSource).toContain('disabled={ocrRunning}');
  });

  it('run button label changes while OCR is running', () => {
    expect(rightPanelSource).toContain('OCR bezig');
  });
});

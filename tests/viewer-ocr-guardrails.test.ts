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

const ocrRustSource = readFileSync(
  new URL('../src-tauri/src/ocr.rs', import.meta.url),
  'utf8'
);

const rightPanelSource = readFileSync(
  new URL('../src/viewer/components/RightContextPanel.tsx', import.meta.url),
  'utf8'
);

const mockOcrEngineSource = readFileSync(
  new URL('../src/core/engine/mock/MockOcrEngine.ts', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// handleRunOcr — input guards
// ---------------------------------------------------------------------------

describe('handleRunOcr — input guards', () => {
  it('guards against null pdfDoc', () => {
    const fnStart = viewerAppSource.indexOf('handleRunOcr = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('!pdfDoc');
  });

  it('guards against non-Tauri environment', () => {
    const fnStart = viewerAppSource.indexOf('handleRunOcr = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('!isTauri');
  });

  it('guards against concurrent run via ocrRunning flag', () => {
    const fnStart = viewerAppSource.indexOf('handleRunOcr = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('ocrRunning');
  });

  it('all three guards in one early-return statement', () => {
    const fnStart = viewerAppSource.indexOf('handleRunOcr = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('if (!pdfDoc || !isTauri || ocrRunning) return;');
  });

  it('guards against empty page list (returns early when pagesToProcess is empty)', () => {
    const fnStart = viewerAppSource.indexOf('handleRunOcr = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('pagesToProcess.length === 0');
  });
});

// ---------------------------------------------------------------------------
// OcrOverlay — rendering guardrails
// ---------------------------------------------------------------------------

describe('OcrOverlay — rendering guardrails', () => {
  it('does not render when visible is false', () => {
    expect(ocrOverlaySource).toContain('!visible');
  });

  it('does not render when words array is empty', () => {
    expect(ocrOverlaySource).toContain('words.length === 0');
  });

  it('SVG has pointerEvents none to prevent blocking user interaction', () => {
    expect(ocrOverlaySource).toContain("pointerEvents: 'none'");
  });

  it('uses data-confidence attribute to expose confidence for accessibility/testing', () => {
    expect(ocrOverlaySource).toContain('data-confidence=');
  });

  it('default lowConfidenceThreshold is 0.6', () => {
    expect(ocrOverlaySource).toContain('lowConfidenceThreshold = 0.6');
  });

  it('visible defaults to true (opt-in visible state)', () => {
    expect(ocrOverlaySource).toContain('visible = true');
  });
});

// ---------------------------------------------------------------------------
// Rust OCR bridge — input validation guardrails
// ---------------------------------------------------------------------------

describe('Rust OCR bridge — guardrails', () => {
  it('validates base64 decode before writing temp file', () => {
    expect(ocrRustSource).toContain('base64 decode error');
  });

  it('returns error when temp file creation fails', () => {
    expect(ocrRustSource).toContain('create temp image error');
  });

  it('returns error when bridge process spawn fails', () => {
    expect(ocrRustSource).toContain('failed to spawn OCR bridge');
  });

  it('returns error when bridge exits with non-zero status', () => {
    expect(ocrRustSource).toContain('OCR bridge exited with error');
  });

  it('returns error when JSON parse fails', () => {
    expect(ocrRustSource).toContain('OCR JSON parse error');
  });

  it('cleans up temp file by dropping the handle before spawning subprocess', () => {
    // drop(tmp_file) ensures file is flushed/closed before Python reads it
    expect(ocrRustSource).toContain('drop(tmp_file)');
  });

  it('passes preprocess_mode arg to Python bridge', () => {
    expect(ocrRustSource).toContain('"--preprocess-mode"');
  });

  it('only passes preprocess_steps when not empty', () => {
    expect(ocrRustSource).toContain('!steps.is_empty()');
  });

  it('only passes auto_confidence_threshold when Some', () => {
    expect(ocrRustSource).toContain('auto_confidence_threshold');
    expect(ocrRustSource).toContain('arg(threshold.to_string())');
  });
});

// ---------------------------------------------------------------------------
// OcrPanel — UI guardrails
// ---------------------------------------------------------------------------

describe('OcrPanel — UI guardrails', () => {
  it('run button disabled when ocrRunning is true', () => {
    expect(rightPanelSource).toContain('disabled={ocrRunning}');
  });

  it('onRunOcr called with optional chaining (safe when prop absent)', () => {
    expect(rightPanelSource).toContain('onRunOcr?.({');
  });

  it('scope selector defaults to scanned (prefer safe subset over all)', () => {
    expect(rightPanelSource).toContain("'scanned'");
  });
});

// ---------------------------------------------------------------------------
// MockOcrEngine — conforms to OcrEngine contract
// ---------------------------------------------------------------------------

describe('MockOcrEngine — contract conformance', () => {
  it('implements OcrEngine interface', () => {
    expect(mockOcrEngineSource).toContain('implements OcrEngine');
  });

  it('isAvailable returns true in mock', () => {
    expect(mockOcrEngineSource).toContain('return true');
  });

  it('runOcr returns success: true', () => {
    expect(mockOcrEngineSource).toContain('success: true');
  });

  it('mock words array is non-empty (enables overlay tests)', () => {
    expect(mockOcrEngineSource).toContain("text: 'Mock'");
  });

  it('mock result includes qualityMetrics', () => {
    expect(mockOcrEngineSource).toContain('qualityMetrics');
  });
});

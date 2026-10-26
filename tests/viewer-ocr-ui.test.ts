// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { getWiredTools } from '../src/viewer/tools/wiredTools';

// The OCR run itself (J-60) is no longer a per-page loop in the frontend that
// keeps words for an overlay: it writes a text layer into the document. Its
// behaviour is tested where it happens -- src-tauri/tests/
// ocr_makes_scans_searchable.rs (scan -> OCR -> save -> search),
// src-tauri/src/ocr_component.rs (the bundled component, checksums) and
// src/lib/__tests__/ocrComponent.test.ts (what "Run OCR" leads to).

const modeToolbarSource = readFileSync(
  new URL('../src/viewer/components/ModeToolbar.tsx', import.meta.url),
  'utf8'
);

const pageCanvasSource = readFileSync(
  new URL('../src/viewer/components/PageCanvas.tsx', import.meta.url),
  'utf8'
);

const rightPanelSource = readFileSync(
  new URL('../src/viewer/components/RightContextPanel.tsx', import.meta.url),
  'utf8'
);

const viewerAppSource = [
  '../src/viewer/ViewerApp.tsx',
  '../src/viewer/v3/EditorV3Shell.tsx',
].map(p => readFileSync(new URL(p, import.meta.url), 'utf8')).join('\n\n');

// ---------------------------------------------------------------------------
// ModeToolbar — OCR scan wiring
// ---------------------------------------------------------------------------

describe('ModeToolbar — OCR scan wiring', () => {
  it('includes toolbar.ocrScan in getWiredTools Tauri branch', () => {
    expect(getWiredTools(true).has('toolbar.ocrScan')).toBe(true);
  });

  it('accepts onOcrScan prop', () => {
    expect(modeToolbarSource).toContain('onOcrScan?: () => void');
  });

  it('calls onOcrScan when toolbar.ocrScan action fires', () => {
    expect(modeToolbarSource).toContain("case 'toolbar.ocrScan'");
    expect(modeToolbarSource).toContain('onOcrScan?.()');
  });
});

// ---------------------------------------------------------------------------
// ModeToolbar — protect mode redaction toggle
// ---------------------------------------------------------------------------

describe('ModeToolbar — protect mode redaction toggle', () => {
  it('includes toolbar.redact in getWiredTools Tauri branch', () => {
    expect(getWiredTools(true).has('toolbar.redact')).toBe(true);
  });

  it('renders redaction toggle button when mode is protect (Tauri only)', () => {
    expect(modeToolbarSource).toContain("mode === 'protect'");
    expect(modeToolbarSource).toContain('annotation-tool-redaction-protect');
  });

  it('button has aria-pressed reflecting activeAnnotationTool', () => {
    expect(modeToolbarSource).toContain("aria-pressed={activeAnnotationTool === 'redaction'}");
  });

  it('handles toolbar.redact in handleToolAction', () => {
    expect(modeToolbarSource).toContain("case 'toolbar.redact'");
  });
});

// ---------------------------------------------------------------------------
// PageCanvas — OcrOverlay wiring
// ---------------------------------------------------------------------------

describe('PageCanvas — OcrOverlay wiring', () => {
  it('imports OcrOverlay', () => {
    expect(pageCanvasSource).toContain("import { OcrOverlay }");
  });

  it('accepts ocrWords prop', () => {
    expect(pageCanvasSource).toContain('ocrWords?');
  });

  it('accepts ocrVisible prop', () => {
    expect(pageCanvasSource).toContain('ocrVisible?');
  });

  it('accepts ocrConfidenceThreshold prop', () => {
    expect(pageCanvasSource).toContain('ocrConfidenceThreshold?');
  });

  it('renders OcrOverlay when ocrWords is present', () => {
    expect(pageCanvasSource).toContain('<OcrOverlay');
    expect(pageCanvasSource).toContain('words={ocrWords}');
  });

  it('passes zoom to OcrOverlay', () => {
    expect(pageCanvasSource).toContain('zoom={zoom}');
  });

  it('passes lowConfidenceThreshold to OcrOverlay', () => {
    expect(pageCanvasSource).toContain('lowConfidenceThreshold={ocrConfidenceThreshold}');
  });

  it('passes visible to OcrOverlay', () => {
    expect(pageCanvasSource).toContain('visible={ocrVisible}');
  });
});

// ---------------------------------------------------------------------------
// RightContextPanel — OCR panel confidence + visibility
// ---------------------------------------------------------------------------

describe('RightContextPanel — OCR panel confidence + visibility', () => {
  it('OcrPanel accepts ocrConfidenceThreshold prop', () => {
    expect(rightPanelSource).toContain('ocrConfidenceThreshold?: number');
  });

  it('OcrPanel accepts ocrVisible prop', () => {
    expect(rightPanelSource).toContain('ocrVisible?: boolean');
  });

  it('OcrPanel renders confidence slider', () => {
    expect(rightPanelSource).toContain('data-testid="ocr-confidence-slider"');
    expect(rightPanelSource).toContain('type="range"');
  });

  it('OcrPanel renders visibility toggle button', () => {
    expect(rightPanelSource).toContain('data-testid="ocr-visibility-toggle"');
  });

  it('uses ocr.confidenceThreshold i18n key', () => {
    expect(rightPanelSource).toContain("t('ocr.confidenceThreshold'");
  });

  it('uses ocr.toggleOverlay i18n key', () => {
    expect(rightPanelSource).toContain("t('ocr.toggleOverlay')");
  });
});

// ---------------------------------------------------------------------------
// RightContextPanel — convert mode OCR panel
// ---------------------------------------------------------------------------

describe('RightContextPanel — convert mode has OCR panel', () => {
  it('renders OcrPanel in convert mode', () => {
    expect(rightPanelSource).toContain("mode === 'convert'");
    // OcrPanel is rendered at least 3 times (review, edit, convert)
    expect(rightPanelSource.match(/<OcrPanel/g)?.length).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — OCR overlay state wiring
// ---------------------------------------------------------------------------


describe('ViewerApp — OCR goes through useOcr', () => {
  it('runs OCR from the Convert panel through the hook', () => {
    expect(viewerAppSource).toContain("onRunOcr={() => { if (!isTauri) return; void ocr.requestRun('scanned'); }}");
  });

  it('has no download dialog and hands Settings only the component status', () => {
    expect(viewerAppSource).not.toContain('OcrComponentDialog');
    expect(viewerAppSource).toContain('ocr={isTauri ? { status: ocr.status } : undefined}');
  });
});

// ---------------------------------------------------------------------------
// OCR status probe — logged, never toasted
// ---------------------------------------------------------------------------

describe('useOcr — the background status probe', () => {
  const source = readFileSync(
    new URL('../src/viewer/hooks/useOcr.ts', import.meta.url),
    'utf8'
  );
  const start = source.indexOf('const refreshStatus');
  const probe = source.slice(start, source.indexOf('useEffect', start));

  it('logs a failed probe and does not publish an error', () => {
    expect(probe).toContain('logToApp');
    expect(probe).not.toMatch(/reportCommandFailure|reportFallback|publishAppError|alreadyReported/);
  });

  it('asks the backend through the quiet door', () => {
    const api = readFileSync(new URL('../src/lib/tauri-api.ts', import.meta.url), 'utf8');
    const at = api.indexOf('export async function getOcrComponentStatus');
    expect(api.slice(at, api.indexOf('\nexport ', at + 1))).toContain('invokeQuietly');
  });
});

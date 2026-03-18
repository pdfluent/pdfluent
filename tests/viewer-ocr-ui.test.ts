// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

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

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// ModeToolbar — OCR scan wiring
// ---------------------------------------------------------------------------

describe('ModeToolbar — OCR scan wiring', () => {
  it('includes toolbar.ocrScan in WIRED_TOOLS', () => {
    expect(modeToolbarSource).toContain("'toolbar.ocrScan'");
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
  it('includes toolbar.redact in WIRED_TOOLS', () => {
    expect(modeToolbarSource).toContain("'toolbar.redact'");
  });

  it('renders redaction toggle button when mode is protect', () => {
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

describe('ViewerApp — OCR overlay state wiring', () => {
  it('tracks ocrVisible state', () => {
    expect(viewerAppSource).toContain('ocrVisible');
    expect(viewerAppSource).toContain('setOcrVisible');
  });

  it('tracks ocrConfidenceThreshold state', () => {
    expect(viewerAppSource).toContain('ocrConfidenceThreshold');
    expect(viewerAppSource).toContain('setOcrConfidenceThreshold');
  });

  it('passes ocrPageWords for current page to PageCanvas', () => {
    expect(viewerAppSource).toContain('ocrWords={ocrPageWords.get(pageIndex)}');
  });

  it('passes ocrVisible and ocrConfidenceThreshold to PageCanvas', () => {
    expect(viewerAppSource).toContain('ocrVisible={ocrVisible}');
    expect(viewerAppSource).toContain('ocrConfidenceThreshold={ocrConfidenceThreshold}');
  });

  it('passes onOcrScan to ModeToolbar', () => {
    expect(viewerAppSource).toContain('onOcrScan=');
    expect(viewerAppSource).toContain('handleRunOcr({');
  });
});

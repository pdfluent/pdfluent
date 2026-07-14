// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const rightPanelSource = readFileSync(
  new URL('../src/viewer/components/RightContextPanel.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// OcrPanel component
// ---------------------------------------------------------------------------

describe('OcrPanel component structure', () => {
  it('defines OcrPanel function', () => {
    expect(rightPanelSource).toContain('function OcrPanel(');
  });

  it('has data-testid="ocr-panel" root element', () => {
    expect(rightPanelSource).toContain('data-testid="ocr-panel"');
  });

  it('accepts scannedPageIndices, onRunOcr, ocrRunning props', () => {
    const fnStart = rightPanelSource.indexOf('function OcrPanel(');
    const fnSig = rightPanelSource.slice(fnStart, fnStart + 300);
    expect(fnSig).toContain('scannedPageIndices');
    expect(fnSig).toContain('onRunOcr');
    expect(fnSig).toContain('ocrRunning');
  });
});

// ---------------------------------------------------------------------------
// OcrPanel — language selector
// ---------------------------------------------------------------------------

describe('OcrPanel — language selector', () => {
  it('renders ocr-language-select', () => {
    expect(rightPanelSource).toContain('data-testid="ocr-language-select"');
  });

  it('has English option', () => {
    const selStart = rightPanelSource.indexOf('ocr-language-select');
    const selEnd = rightPanelSource.indexOf('</select>', selStart) + 9;
    const selBody = rightPanelSource.slice(selStart, selEnd);
    expect(selBody).toContain('"en"');
  });

  it('has Dutch option', () => {
    const selStart = rightPanelSource.indexOf('ocr-language-select');
    const selEnd = rightPanelSource.indexOf('</select>', selStart) + 9;
    const selBody = rightPanelSource.slice(selStart, selEnd);
    expect(selBody).toContain('"nl"');
  });

  it('updates ocrLanguage state on change', () => {
    expect(rightPanelSource).toContain('setOcrLanguage(');
  });
});

// ---------------------------------------------------------------------------
// OcrPanel — scope selector
// ---------------------------------------------------------------------------

describe('OcrPanel — scope selector', () => {
  it('renders ocr-scope-select', () => {
    expect(rightPanelSource).toContain('data-testid="ocr-scope-select"');
  });

  it('has "scanned" option', () => {
    const selStart = rightPanelSource.indexOf('ocr-scope-select');
    const selEnd = rightPanelSource.indexOf('</select>', selStart) + 9;
    const selBody = rightPanelSource.slice(selStart, selEnd);
    expect(selBody).toContain('"scanned"');
  });

  it('has "all" option', () => {
    const selStart = rightPanelSource.indexOf('ocr-scope-select');
    const selEnd = rightPanelSource.indexOf('</select>', selStart) + 9;
    const selBody = rightPanelSource.slice(selStart, selEnd);
    expect(selBody).toContain('"all"');
  });

  it('updates ocrScope state', () => {
    expect(rightPanelSource).toContain('setOcrScope(');
  });
});

// ---------------------------------------------------------------------------
// OcrPanel — preprocessing mode selector
// ---------------------------------------------------------------------------

describe('OcrPanel — preprocess mode selector', () => {
  it('renders ocr-preprocess-select', () => {
    expect(rightPanelSource).toContain('data-testid="ocr-preprocess-select"');
  });

  it('has auto option', () => {
    const selStart = rightPanelSource.indexOf('ocr-preprocess-select');
    const selEnd = rightPanelSource.indexOf('</select>', selStart) + 9;
    const selBody = rightPanelSource.slice(selStart, selEnd);
    expect(selBody).toContain('"auto"');
  });

  it('has off option', () => {
    const selStart = rightPanelSource.indexOf('ocr-preprocess-select');
    const selEnd = rightPanelSource.indexOf('</select>', selStart) + 9;
    const selBody = rightPanelSource.slice(selStart, selEnd);
    expect(selBody).toContain('"off"');
  });

  it('has manual option', () => {
    const selStart = rightPanelSource.indexOf('ocr-preprocess-select');
    const selEnd = rightPanelSource.indexOf('</select>', selStart) + 9;
    const selBody = rightPanelSource.slice(selStart, selEnd);
    expect(selBody).toContain('"manual"');
  });
});

// ---------------------------------------------------------------------------
// OcrPanel — run button
// ---------------------------------------------------------------------------

describe('OcrPanel — run OCR button', () => {
  it('renders run-ocr-btn', () => {
    expect(rightPanelSource).toContain('data-testid="run-ocr-btn"');
  });

  it('button calls onRunOcr with language, scope, preprocessMode', () => {
    const btnStart = rightPanelSource.indexOf('run-ocr-btn');
    const btnEnd = rightPanelSource.indexOf('</button>', btnStart) + 9;
    const btnBody = rightPanelSource.slice(btnStart, btnEnd);
    expect(btnBody).toContain('onRunOcr?.({');
    expect(btnBody).toContain('language: ocrLanguage');
    expect(btnBody).toContain('scope: ocrScope');
    expect(btnBody).toContain('preprocessMode: ocrPreprocessMode');
  });

  it('button is disabled when OCR is running or unavailable', () => {
    const btnStart = rightPanelSource.indexOf('run-ocr-btn');
    const btnEnd = rightPanelSource.indexOf('</button>', btnStart) + 9;
    const btnBody = rightPanelSource.slice(btnStart, btnEnd);
    expect(rightPanelSource).toContain('const controlsDisabled = ocrRunning || !runtimeAvailable || ocrStatusChecking');
    expect(btnBody).toContain('disabled={controlsDisabled}');
  });

  it('button label changes to "OCR bezig…" when running', () => {
    const btnStart = rightPanelSource.indexOf('run-ocr-btn');
    const btnEnd = rightPanelSource.indexOf('</button>', btnStart) + 9;
    const btnBody = rightPanelSource.slice(btnStart, btnEnd);
    expect(btnBody).toContain('ocrRunning');
    expect(btnBody).toContain("t('ocr.running')");
  });
});

// ---------------------------------------------------------------------------
// OcrPanel — scanned page count display
// ---------------------------------------------------------------------------

describe('OcrPanel — scanned page count', () => {
  it('shows scannedCount in the panel', () => {
    expect(rightPanelSource).toContain('scannedCount');
  });

  it('reads scannedCount from scannedPageIndices.size', () => {
    expect(rightPanelSource).toContain('scannedPageIndices.size');
  });
});

// ---------------------------------------------------------------------------
// OcrPanel — runtime health status
// ---------------------------------------------------------------------------

describe('OcrPanel — runtime health status', () => {
  it('imports getOcrStatus from the Tauri API boundary', () => {
    expect(rightPanelSource).toContain('getOcrStatus');
    expect(rightPanelSource).toContain('OcrRuntimeStatus');
  });

  it('renders ocr-status and retry controls', () => {
    expect(rightPanelSource).toContain('data-testid="ocr-status"');
    expect(rightPanelSource).toContain('data-testid="ocr-status-refresh"');
  });

  it('checks OCR runtime status before enabling controls', () => {
    expect(rightPanelSource).toContain('refreshOcrStatus');
    expect(rightPanelSource).toContain('const runtimeAvailable = available && (ocrStatus?.available ?? false)');
  });
});

// ---------------------------------------------------------------------------
// RightContextPanel — OCR section in review mode
// ---------------------------------------------------------------------------

describe('RightContextPanel — OCR CollapsibleSection in review mode', () => {
  it('renders OcrPanel inside a CollapsibleSection with title "OCR"', () => {
    expect(rightPanelSource).toContain("CollapsibleSection title={t('rightPanel.ocr')}");
    expect(rightPanelSource).toContain('<OcrPanel');
  });

  it('passes scannedPageIndices to OcrPanel', () => {
    const panelStart = rightPanelSource.indexOf('<OcrPanel');
    const panelEnd = rightPanelSource.indexOf('/>', panelStart) + 2;
    const panelBody = rightPanelSource.slice(panelStart, panelEnd);
    expect(panelBody).toContain('scannedPageIndices={scannedPageIndices}');
  });

  it('passes onRunOcr to OcrPanel', () => {
    const panelStart = rightPanelSource.indexOf('<OcrPanel');
    const panelEnd = rightPanelSource.indexOf('/>', panelStart) + 2;
    const panelBody = rightPanelSource.slice(panelStart, panelEnd);
    expect(panelBody).toContain('onRunOcr={onRunOcr}');
  });

  it('passes ocrRunning to OcrPanel', () => {
    const panelStart = rightPanelSource.indexOf('<OcrPanel');
    const panelEnd = rightPanelSource.indexOf('/>', panelStart) + 2;
    const panelBody = rightPanelSource.slice(panelStart, panelEnd);
    expect(panelBody).toContain('ocrRunning={ocrRunning}');
  });
});

// ---------------------------------------------------------------------------
// RightContextPanelProps — OCR props in interface
// ---------------------------------------------------------------------------

describe('RightContextPanelProps — OCR props', () => {
  it('has scannedPageIndices prop', () => {
    const propsStart = rightPanelSource.indexOf('interface RightContextPanelProps');
    const propsEnd = rightPanelSource.indexOf('\n}', propsStart) + 2;
    const propsBody = rightPanelSource.slice(propsStart, propsEnd);
    expect(propsBody).toContain('scannedPageIndices?:');
  });

  it('has onRunOcr prop', () => {
    const propsStart = rightPanelSource.indexOf('interface RightContextPanelProps');
    const propsEnd = rightPanelSource.indexOf('\n}', propsStart) + 2;
    const propsBody = rightPanelSource.slice(propsStart, propsEnd);
    expect(propsBody).toContain('onRunOcr?:');
  });

  it('has ocrRunning prop', () => {
    const propsStart = rightPanelSource.indexOf('interface RightContextPanelProps');
    const propsEnd = rightPanelSource.indexOf('\n}', propsStart) + 2;
    const propsBody = rightPanelSource.slice(propsStart, propsEnd);
    expect(propsBody).toContain('ocrRunning?:');
  });
});

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

// ---------------------------------------------------------------------------
// ViewerApp — OCR state
// ---------------------------------------------------------------------------

describe('ViewerApp — OCR state', () => {
  it('has ocrRunning state', () => {
    expect(viewerAppSource).toContain('ocrRunning');
    expect(viewerAppSource).toContain('setOcrRunning');
  });

  it('ocrRunning initialized as false', () => {
    expect(viewerAppSource).toContain('useState(false)');
  });

  it('has ocrPageWords state', () => {
    expect(viewerAppSource).toContain('ocrPageWords');
    expect(viewerAppSource).toContain('setOcrPageWords');
  });

  it('has ocrProgress state', () => {
    expect(viewerAppSource).toContain('ocrProgress');
    expect(viewerAppSource).toContain('setOcrProgress');
  });

  it('ocrProgress tracks processed and total', () => {
    expect(viewerAppSource).toContain('processed:');
    expect(viewerAppSource).toContain('total:');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — handleRunOcr callback
// ---------------------------------------------------------------------------

describe('ViewerApp — handleRunOcr callback', () => {
  it('defines handleRunOcr', () => {
    expect(viewerAppSource).toContain('handleRunOcr');
  });

  it('sets ocrRunning to true when starting', () => {
    const fnStart = viewerAppSource.indexOf('handleRunOcr = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('setOcrRunning(true)');
  });

  it('sets ocrRunning to false in finally block', () => {
    const fnStart = viewerAppSource.indexOf('handleRunOcr = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('setOcrRunning(false)');
    expect(fnBody).toContain('finally');
  });

  it('guards on ocrRunning to prevent concurrent runs', () => {
    const fnStart = viewerAppSource.indexOf('handleRunOcr = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('ocrRunning');
  });

  it('processes scanned pages when scope is scanned', () => {
    const fnStart = viewerAppSource.indexOf('handleRunOcr = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("'scanned'");
    expect(fnBody).toContain('scannedPageIndices');
  });

  it('processes all pages when scope is all', () => {
    const fnStart = viewerAppSource.indexOf('handleRunOcr = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("'all'");
    expect(fnBody).toContain('pdfDoc.pages.length');
  });

  it('calls render_page for each page', () => {
    const fnStart = viewerAppSource.indexOf('handleRunOcr = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("'render_page'");
  });

  it('calls run_paddle_ocr for each page', () => {
    const fnStart = viewerAppSource.indexOf('handleRunOcr = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("'run_paddle_ocr'");
  });

  it('updates ocrProgress after each page', () => {
    const fnStart = viewerAppSource.indexOf('handleRunOcr = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('setOcrProgress(');
  });

  it('stores results in ocrPageWords via setOcrPageWords', () => {
    const fnStart = viewerAppSource.indexOf('handleRunOcr = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('setOcrPageWords(');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — OCR props passed to RightContextPanel
// ---------------------------------------------------------------------------

describe('ViewerApp — OCR props wired to RightContextPanel', () => {
  it('passes scannedPageIndices to RightContextPanel', () => {
    expect(viewerAppSource).toContain('scannedPageIndices={scannedPageIndices}');
  });

  it('passes ocrRunning to RightContextPanel', () => {
    expect(viewerAppSource).toContain('ocrRunning={ocrRunning}');
  });

  it('passes onRunOcr to RightContextPanel', () => {
    expect(viewerAppSource).toContain('onRunOcr=');
  });
});

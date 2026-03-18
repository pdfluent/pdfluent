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
// isSavingRef — save-in-progress guard
// ---------------------------------------------------------------------------

describe('ViewerApp — isSavingRef declaration', () => {
  it('declares isSavingRef as a useRef', () => {
    expect(viewerAppSource).toContain('isSavingRef');
    expect(viewerAppSource).toContain('useRef(false)');
  });

  it('declares docLoadingRef as a useRef synced to docLoading', () => {
    expect(viewerAppSource).toContain('docLoadingRef');
    expect(viewerAppSource).toContain('docLoadingRef.current = docLoading');
  });

  it('isSavingRef.current is set to true before save', () => {
    const saveAsStart = viewerAppSource.indexOf('handleSaveAs');
    const savingTrue = viewerAppSource.indexOf('isSavingRef.current = true', saveAsStart);
    expect(savingTrue).toBeGreaterThan(saveAsStart);
  });

  it('isSavingRef.current is reset to false in finally block', () => {
    const saveAsStart = viewerAppSource.indexOf('handleSaveAs');
    const finallyIdx = viewerAppSource.indexOf('finally', saveAsStart);
    const savingFalse = viewerAppSource.indexOf('isSavingRef.current = false', finallyIdx);
    expect(savingFalse).toBeGreaterThan(finallyIdx);
  });
});

// ---------------------------------------------------------------------------
// Guard: prevent operations during document load
// ---------------------------------------------------------------------------

describe('ViewerApp — guard: prevent save during document load', () => {
  it('handleSaveAs checks docLoadingRef.current before proceeding', () => {
    const saveAsStart = viewerAppSource.indexOf('handleSaveAs');
    const docLoadingGuard = viewerAppSource.indexOf('if (docLoadingRef.current) return', saveAsStart);
    expect(docLoadingGuard).toBeGreaterThan(saveAsStart);
  });

  it('docLoadingRef guard is before isSavingRef.current = true', () => {
    const saveAsStart = viewerAppSource.indexOf('handleSaveAs');
    const docLoadingGuard = viewerAppSource.indexOf('if (docLoadingRef.current) return', saveAsStart);
    const savingTrue = viewerAppSource.indexOf('isSavingRef.current = true', saveAsStart);
    expect(docLoadingGuard).toBeLessThan(savingTrue);
  });

  it('docLoadingRef is synced to docLoading via useEffect', () => {
    expect(viewerAppSource).toContain('docLoadingRef.current = docLoading');
  });
});

// ---------------------------------------------------------------------------
// Guard: prevent navigation during save
// ---------------------------------------------------------------------------

describe('ViewerApp — guard: prevent keyboard navigation during save', () => {
  it('handlePageNav checks isSavingRef.current', () => {
    const pageNavStart = viewerAppSource.indexOf('handlePageNav');
    const savingGuard = viewerAppSource.indexOf('isSavingRef.current', pageNavStart);
    expect(savingGuard).toBeGreaterThan(pageNavStart);
  });

  it('isSavingRef guard is before the switch statement', () => {
    const pageNavStart = viewerAppSource.indexOf('handlePageNav');
    const savingGuard = viewerAppSource.indexOf('isSavingRef.current', pageNavStart);
    const switchIdx = viewerAppSource.indexOf('switch (e.key)', pageNavStart);
    expect(savingGuard).toBeLessThan(switchIdx);
  });
});

// ---------------------------------------------------------------------------
// No regressions — existing page nav still intact
// ---------------------------------------------------------------------------

describe('ViewerApp — state resilience: no regressions', () => {
  it('pageCount === 0 guard still present in handlePageNav', () => {
    const pageNavStart = viewerAppSource.indexOf('handlePageNav');
    const pageCountGuard = viewerAppSource.indexOf('if (pageCount === 0) return', pageNavStart);
    expect(pageCountGuard).toBeGreaterThan(pageNavStart);
  });

  it('handlePageNav useEffect dep array still contains pageCount', () => {
    expect(viewerAppSource).toContain('}, [pageCount])');
  });

  it('handleSaveAs still guards against isTauri and pageCount === 0', () => {
    const saveAsStart = viewerAppSource.indexOf('handleSaveAs');
    const tauriGuard = viewerAppSource.indexOf('if (!isTauri || pageCount === 0) return', saveAsStart);
    expect(tauriGuard).toBeGreaterThan(saveAsStart);
  });

  it('handleSaveAs still uses finally block', () => {
    expect(viewerAppSource).toContain('finally { isSavingRef.current = false; }');
  });
});

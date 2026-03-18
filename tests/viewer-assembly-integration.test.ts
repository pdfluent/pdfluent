// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const gridSource = readFileSync(
  new URL('../src/viewer/components/OrganizeGrid.tsx', import.meta.url),
  'utf8'
);

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

const thumbnailsSource = readFileSync(
  new URL('../src/viewer/hooks/useThumbnails.ts', import.meta.url),
  'utf8'
);

const renderEngineSource = readFileSync(
  new URL('../src/platform/engine/tauri/TauriRenderEngine.ts', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// Thumbnail refresh after mutations
// ---------------------------------------------------------------------------

describe('useThumbnails — page count override', () => {
  it('accepts an optional pageCount parameter', () => {
    expect(thumbnailsSource).toContain('pageCount?: number');
  });

  it('uses effectiveCount (= pageCount ?? document.pages.length) for the loop', () => {
    expect(thumbnailsSource).toContain('effectiveCount');
    expect(thumbnailsSource).toContain('pageCount ?? document');
  });

  it('adds effectiveCount to the useEffect dependency array', () => {
    expect(thumbnailsSource).toContain('[engine, document, effectiveCount]');
  });

  it('guards against effectiveCount === 0 (not just document.pages.length === 0)', () => {
    expect(thumbnailsSource).toContain('effectiveCount === 0');
  });

  it('loops to effectiveCount, not document.pages.length', () => {
    // The loop must use effectiveCount
    const loopIdx = thumbnailsSource.indexOf('for (let i = 0; i < effectiveCount');
    expect(loopIdx).toBeGreaterThan(-1);
  });
});

describe('ViewerApp — passes pageCount to useThumbnails', () => {
  it('passes pageCount as third argument to useThumbnails', () => {
    expect(viewerAppSource).toContain('useThumbnails(engine, pdfDoc, pageCount)');
  });
});

describe('TauriRenderEngine — getThumbnail guard relaxed', () => {
  const getThumbnailStart = renderEngineSource.indexOf('async getThumbnail(');
  const getThumbnailEnd   = renderEngineSource.indexOf('\n  async ', getThumbnailStart + 1);
  const getThumbnailBody  = renderEngineSource.slice(getThumbnailStart, getThumbnailEnd);

  it('no longer has a conditional return based on document.pages lookup', () => {
    // The old guard was: if (!document.pages[pageIndex]) { return error }
    // It must not appear as executable code (a comment mentioning it is acceptable)
    expect(getThumbnailBody).not.toContain('if (!document.pages[pageIndex])');
  });

  it('only guards against negative page indices', () => {
    expect(getThumbnailBody).toContain('pageIndex < 0');
  });

  it('still invokes render_thumbnail on the backend', () => {
    expect(getThumbnailBody).toContain("'render_thumbnail'");
    expect(getThumbnailBody).toContain('pageIndex');
  });
});

// ---------------------------------------------------------------------------
// Page navigation after append / insert
// ---------------------------------------------------------------------------

describe('ViewerApp — handlePageMutation with navigateTo', () => {
  const mutStart = viewerAppSource.indexOf('const handlePageMutation = useCallback');
  const mutEnd   = viewerAppSource.indexOf('\n  }, [', mutStart);
  const mutBody  = viewerAppSource.slice(mutStart, mutEnd + 35);

  it('accepts an optional navigateTo parameter', () => {
    expect(mutBody).toContain('navigateTo?: number');
  });

  it('sets pageIndex to navigateTo (clamped) when navigateTo is provided', () => {
    expect(mutBody).toContain('if (navigateTo !== undefined)');
    expect(mutBody).toContain('Math.min(Math.max(0, navigateTo)');
  });

  it('falls back to clamping current index when navigateTo is absent', () => {
    expect(mutBody).toContain('Math.min(prev, Math.max(0, newPageCount - 1))');
  });
});

describe('OrganizeGrid — append navigates to first new page', () => {
  const appendStart = gridSource.indexOf('async function handleAppendPdf');
  const appendEnd   = gridSource.indexOf('async function handleInsertPdf');
  const appendBody  = gridSource.slice(appendStart, appendEnd);

  it('captures pageCount as firstNewPageIndex before the operation', () => {
    expect(appendBody).toContain('const firstNewPageIndex = pageCount');
  });

  it('passes firstNewPageIndex to onPageMutation', () => {
    expect(appendBody).toContain('onPageMutation(result.page_count, firstNewPageIndex)');
  });
});

describe('OrganizeGrid — insert navigates to insertion point', () => {
  const insertStart = gridSource.indexOf('async function handleInsertPdf');
  const insertEnd   = gridSource.indexOf('async function handleExportSelection');
  const insertBody  = gridSource.slice(insertStart, insertEnd);

  it('passes atIndex to onPageMutation as navigateTo', () => {
    expect(insertBody).toContain('onPageMutation(result.page_count, atIndex)');
  });
});

// ---------------------------------------------------------------------------
// Double-invoke prevention (isAssemblyBusy)
// ---------------------------------------------------------------------------

describe('OrganizeGrid — isAssemblyBusy guard', () => {
  it('declares isAssemblyBusy state', () => {
    expect(gridSource).toContain('isAssemblyBusy');
    expect(gridSource).toContain('setIsAssemblyBusy');
  });

  it('all assembly buttons are disabled when isAssemblyBusy is true', () => {
    expect(gridSource).toContain('disabled={!isTauri || pageCount === 0 || isAssemblyBusy}');
    expect(gridSource).toContain('disabled={!isTauri || isAssemblyBusy}');
  });

  it('all assembly handlers set isAssemblyBusy(true) before the invoke', () => {
    const appendBody  = gridSource.slice(gridSource.indexOf('async function handleAppendPdf'), gridSource.indexOf('async function handleInsertPdf'));
    const insertBody  = gridSource.slice(gridSource.indexOf('async function handleInsertPdf'), gridSource.indexOf('async function handleExportSelection'));
    const exportBody  = gridSource.slice(gridSource.indexOf('async function handleExportSelection'), gridSource.indexOf('async function handleSplitIntoPages'));
    const splitBody   = gridSource.slice(gridSource.indexOf('async function handleSplitIntoPages'), gridSource.indexOf('// Use refs to keep keyboard handler'));
    for (const body of [appendBody, insertBody, exportBody, splitBody]) {
      expect(body).toContain('setIsAssemblyBusy(true)');
    }
  });

  it('all assembly handlers reset isAssemblyBusy in a finally block', () => {
    const appendBody  = gridSource.slice(gridSource.indexOf('async function handleAppendPdf'), gridSource.indexOf('async function handleInsertPdf'));
    const insertBody  = gridSource.slice(gridSource.indexOf('async function handleInsertPdf'), gridSource.indexOf('async function handleExportSelection'));
    const exportBody  = gridSource.slice(gridSource.indexOf('async function handleExportSelection'), gridSource.indexOf('async function handleSplitIntoPages'));
    const splitBody   = gridSource.slice(gridSource.indexOf('async function handleSplitIntoPages'), gridSource.indexOf('// Use refs to keep keyboard handler'));
    for (const body of [appendBody, insertBody, exportBody, splitBody]) {
      expect(body).toContain('finally {');
      expect(body).toContain('setIsAssemblyBusy(false)');
    }
  });
});

// ---------------------------------------------------------------------------
// Dirty-state transitions
// ---------------------------------------------------------------------------

describe('dirty-state transitions', () => {
  it('append calls onMarkDirty — document is modified', () => {
    const appendBody = gridSource.slice(gridSource.indexOf('async function handleAppendPdf'), gridSource.indexOf('async function handleInsertPdf'));
    expect(appendBody).toContain('onMarkDirty()');
  });

  it('insert calls onMarkDirty — document is modified', () => {
    const insertBody = gridSource.slice(gridSource.indexOf('async function handleInsertPdf'), gridSource.indexOf('async function handleExportSelection'));
    expect(insertBody).toContain('onMarkDirty()');
  });

  it('export does NOT call onMarkDirty — current document unchanged', () => {
    const exportBody = gridSource.slice(gridSource.indexOf('async function handleExportSelection'), gridSource.indexOf('async function handleSplitIntoPages'));
    expect(exportBody).not.toContain('onMarkDirty');
  });

  it('split does NOT call onMarkDirty — current document unchanged', () => {
    const splitBody = gridSource.slice(gridSource.indexOf('async function handleSplitIntoPages'), gridSource.indexOf('// Use refs to keep keyboard handler'));
    expect(splitBody).not.toContain('onMarkDirty');
  });

  it('handlePageMutation calls markDirty — all page mutations dirty the document', () => {
    const mutStart = viewerAppSource.indexOf('const handlePageMutation = useCallback');
    const mutEnd   = viewerAppSource.indexOf('\n  }, [', mutStart);
    expect(viewerAppSource.slice(mutStart, mutEnd)).toContain('markDirty()');
  });
});

// ---------------------------------------------------------------------------
// pageIndex clamping after mutations
// ---------------------------------------------------------------------------

describe('pageIndex clamping after mutations', () => {
  it('handlePageMutation clamps pageIndex to [0, newPageCount - 1]', () => {
    const mutStart = viewerAppSource.indexOf('const handlePageMutation = useCallback');
    const mutEnd   = viewerAppSource.indexOf('\n  }, [', mutStart);
    const mutBody  = viewerAppSource.slice(mutStart, mutEnd);
    expect(mutBody).toContain('Math.max(0, newPageCount - 1)');
  });

  it('navigateTo is clamped to [0, newPageCount - 1]', () => {
    const mutStart = viewerAppSource.indexOf('const handlePageMutation = useCallback');
    const mutEnd   = viewerAppSource.indexOf('\n  }, [', mutStart);
    const mutBody  = viewerAppSource.slice(mutStart, mutEnd);
    expect(mutBody).toContain('Math.min(Math.max(0, navigateTo), Math.max(0, newPageCount - 1))');
  });

  it('useEffect clamp still protects against pageCount changes from other sources', () => {
    expect(viewerAppSource).toContain('setPageIndex(prev => Math.min(prev, pageCount - 1))');
  });
});

// ---------------------------------------------------------------------------
// Selection reset
// ---------------------------------------------------------------------------

describe('selection reset after mutations', () => {
  it('insert clears selection after success (pages shifted)', () => {
    const insertBody = gridSource.slice(gridSource.indexOf('async function handleInsertPdf'), gridSource.indexOf('async function handleExportSelection'));
    expect(insertBody).toContain('clearSelection()');
  });

  it('batch-delete clears selection after success', () => {
    const batchDeleteBody = gridSource.slice(
      gridSource.indexOf('async function handleBatchDelete'),
      gridSource.indexOf('async function handleBatchRotate')
    );
    expect(batchDeleteBody).toContain('clearSelection()');
  });
});

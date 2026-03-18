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

// ---------------------------------------------------------------------------
// Locate key sections in OrganizeGrid for scoped assertions
// ---------------------------------------------------------------------------

const deleteStart = gridSource.indexOf('async function handleDeletePage');
const deleteEnd   = gridSource.indexOf('async function handleRotatePage');
const deleteBody  = gridSource.slice(deleteStart, deleteEnd);

const rotateStart = gridSource.indexOf('async function handleRotatePage');
const rotateEnd   = gridSource.indexOf('return (', rotateStart);
const rotateBody  = gridSource.slice(rotateStart, rotateEnd);

// ---------------------------------------------------------------------------
// Grid rendering
// ---------------------------------------------------------------------------

describe('OrganizeGrid — rendering', () => {
  it('renders the outer grid with data-testid="organize-grid"', () => {
    expect(gridSource).toContain('data-testid="organize-grid"');
  });

  it('renders individual tiles with data-testid pattern organize-page-tile-{i}', () => {
    expect(gridSource).toContain('data-testid={`organize-page-tile-${i}`}');
  });

  it('uses auto-fill grid columns', () => {
    expect(gridSource).toContain('auto-fill');
    expect(gridSource).toContain('minmax(140px');
  });

  it('iterates over pageCount pages', () => {
    expect(gridSource).toContain('Array.from({ length: pageCount }');
  });
});

// ---------------------------------------------------------------------------
// Thumbnail presence
// ---------------------------------------------------------------------------

describe('OrganizeGrid — thumbnail', () => {
  it('renders an <img> with data-testid="organize-thumb-{i}" when url is available', () => {
    expect(gridSource).toContain('data-testid={`organize-thumb-${i}`}');
    expect(gridSource).toContain('<img');
  });

  it('reads the thumbnail url from the thumbnails map via thumbnails.get(i)', () => {
    expect(gridSource).toContain('thumbnails.get(i)');
  });

  it('renders a placeholder when no thumbnail url is available', () => {
    // Scope to the thumbUrl ternary: thumbUrl ? ( <img/> ) : ( <svg>...</svg> )
    const thumbIdx = gridSource.indexOf('thumbUrl ?');
    const elseIdx  = gridSource.indexOf(') : (', thumbIdx);
    expect(elseIdx).toBeGreaterThan(-1);
    const placeholderSection = gridSource.slice(elseIdx, elseIdx + 400);
    expect(placeholderSection).toContain('<svg');
  });
});

// ---------------------------------------------------------------------------
// Page number
// ---------------------------------------------------------------------------

describe('OrganizeGrid — page number', () => {
  it('renders a page number element with data-testid="organize-page-number-{i}"', () => {
    expect(gridSource).toContain('data-testid={`organize-page-number-${i}`}');
  });

  it('displays one-based page number {i + 1}', () => {
    expect(gridSource).toContain('{i + 1}');
  });
});

// ---------------------------------------------------------------------------
// Delete action
// ---------------------------------------------------------------------------

describe('OrganizeGrid — delete action', () => {
  it('renders a delete button with data-testid="organize-delete-{i}"', () => {
    expect(gridSource).toContain('data-testid={`organize-delete-${i}`}');
  });

  it('invokes delete_pages with the correct pageIndex', () => {
    expect(deleteBody).toContain("'delete_pages'");
    expect(deleteBody).toContain('pageIndices: [pageIndex]');
  });

  it('is disabled when pageCount <= 1', () => {
    expect(deleteBody).toContain('pageCount <= 1');
    expect(gridSource).toContain('!isTauri || !canDelete');
  });

  it('canDelete is true only when pageCount > 1', () => {
    expect(gridSource).toContain('const canDelete = pageCount > 1');
  });

  it('calls onPageMutation with the new page count after success', () => {
    expect(deleteBody).toContain('onPageMutation(result.page_count)');
  });

  it('is guarded by isTauri', () => {
    expect(deleteBody).toContain('if (!isTauri || pageCount <= 1) return');
  });
});

// ---------------------------------------------------------------------------
// Rotate action
// ---------------------------------------------------------------------------

describe('OrganizeGrid — rotate action', () => {
  it('renders a rotate button with data-testid="organize-rotate-{i}"', () => {
    expect(gridSource).toContain('data-testid={`organize-rotate-${i}`}');
  });

  it('invokes rotate_pages with the correct pageIndex and 90-degree rotation', () => {
    expect(rotateBody).toContain("'rotate_pages'");
    expect(rotateBody).toContain('pageIndices: [pageIndex]');
    expect(rotateBody).toContain('rotation: 90');
  });

  it('calls onPageMutation with the new page count after success', () => {
    expect(rotateBody).toContain('onPageMutation(result.page_count)');
  });

  it('is guarded by isTauri', () => {
    expect(rotateBody).toContain('if (!isTauri) return');
  });
});

// ---------------------------------------------------------------------------
// Task queue integration
// ---------------------------------------------------------------------------

describe('OrganizeGrid — task queue', () => {
  it('uses useTaskQueueContext', () => {
    expect(gridSource).toContain('useTaskQueueContext');
    expect(gridSource).toContain('const { push, update } = useTaskQueueContext()');
  });

  it('pushes a running task on delete', () => {
    expect(deleteBody).toContain("status: 'running'");
    expect(deleteBody).toContain('push(');
  });

  it('updates task to done on successful delete', () => {
    expect(deleteBody).toContain("status: 'done'");
    expect(deleteBody).toContain('update(taskId,');
  });

  it('updates task to error on failed delete', () => {
    expect(deleteBody).toContain("status: 'error'");
    expect(deleteBody).toContain("'Verwijderen mislukt'");
  });

  it('pushes a running task on rotate', () => {
    expect(rotateBody).toContain("status: 'running'");
    expect(rotateBody).toContain('push(');
  });

  it('updates task to done on successful rotate', () => {
    expect(rotateBody).toContain("status: 'done'");
    expect(rotateBody).toContain('update(taskId,');
  });

  it('updates task to error on failed rotate', () => {
    expect(rotateBody).toContain("status: 'error'");
    expect(rotateBody).toContain("'Roteren mislukt'");
  });
});

// ---------------------------------------------------------------------------
// ViewerApp integration
// ---------------------------------------------------------------------------

describe('ViewerApp — organize mode integration', () => {
  it('imports OrganizeGrid', () => {
    expect(viewerAppSource).toContain("import { OrganizeGrid } from './components/OrganizeGrid'");
  });

  it('renders OrganizeGrid when mode === "organize"', () => {
    expect(viewerAppSource).toContain("mode === 'organize'");
    expect(viewerAppSource).toContain('<OrganizeGrid');
  });

  it('renders PageCanvas when mode !== "organize"', () => {
    expect(viewerAppSource).toContain("mode !== 'organize'");
    expect(viewerAppSource).toContain('<PageCanvas');
  });

  it('passes thumbnails to OrganizeGrid', () => {
    expect(viewerAppSource).toContain('thumbnails={thumbnails}');
  });

  it('passes pageCount to OrganizeGrid', () => {
    const gridBlock = viewerAppSource.slice(
      viewerAppSource.indexOf('<OrganizeGrid'),
      viewerAppSource.indexOf('/>', viewerAppSource.indexOf('<OrganizeGrid')) + 2
    );
    expect(gridBlock).toContain('pageCount={pageCount}');
  });

  it('passes onPageMutation to OrganizeGrid reusing handlePageMutation', () => {
    expect(viewerAppSource).toContain('onPageMutation={handlePageMutation}');
  });

  it('hides the floating zoom controls in organize mode', () => {
    // The guard comment appears before the zoom float block in source order
    const guardIdx  = viewerAppSource.indexOf("mode !== 'organize' && (", viewerAppSource.indexOf('zoom-reset-btn') - 2000);
    const resetIdx  = viewerAppSource.indexOf('zoom-reset-btn');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(resetIdx).toBeGreaterThan(guardIdx);
  });
});

// ---------------------------------------------------------------------------
// No regressions
// ---------------------------------------------------------------------------

describe('ViewerApp — organize grid: no regressions', () => {
  it('PageCanvas is still rendered in non-organize modes', () => {
    expect(viewerAppSource).toContain('<PageCanvas');
  });

  it('fullscreen shortcut still present', () => {
    expect(viewerAppSource).toContain('handleFullscreenKey');
  });

  it('unsaved-changes guard still present', () => {
    expect(viewerAppSource).toContain('handleBeforeUnload');
  });

  it('arrow page nav still present', () => {
    expect(viewerAppSource).toContain('handlePageNav');
  });

  it('handlePageMutation still wires delete and rotate from ModeToolbar', () => {
    expect(viewerAppSource).toContain('handlePageMutation');
  });
});

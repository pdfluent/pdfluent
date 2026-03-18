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

// ---------------------------------------------------------------------------
// Selection state
// ---------------------------------------------------------------------------

describe('organize batch — selection state', () => {
  it('declares selectedPages as a Set<number>', () => {
    expect(gridSource).toContain('selectedPages');
    expect(gridSource).toContain('Set<number>');
    expect(gridSource).toContain('new Set()');
  });

  it('toggleSelection adds a page when not selected', () => {
    expect(gridSource).toContain('toggleSelection');
    expect(gridSource).toContain('next.add(index)');
  });

  it('toggleSelection removes a page when already selected', () => {
    expect(gridSource).toContain('next.delete(index)');
  });

  it('selectAll fills the set with all page indices', () => {
    expect(gridSource).toContain('selectAll');
    expect(gridSource).toContain('Array.from({ length: pageCount }');
  });

  it('clearSelection resets to an empty set', () => {
    expect(gridSource).toContain('clearSelection');
    expect(gridSource).toContain('setSelectedPages(new Set())');
  });
});

// ---------------------------------------------------------------------------
// Batch action bar
// ---------------------------------------------------------------------------

describe('organize batch — batch action bar', () => {
  it('renders the batch-action-bar testid when hasSelection', () => {
    expect(gridSource).toContain('data-testid="batch-action-bar"');
  });

  it('batch-action-bar is conditional on hasSelection', () => {
    expect(gridSource).toContain('hasSelection');
    expect(gridSource).toContain('{hasSelection ?');
  });

  it('shows the selection count in selection-count testid', () => {
    expect(gridSource).toContain('data-testid="selection-count"');
    expect(gridSource).toContain('selectedPages.size');
  });

  it('renders batch-rotate-btn', () => {
    expect(gridSource).toContain('data-testid="batch-rotate-btn"');
  });

  it('renders batch-delete-btn', () => {
    expect(gridSource).toContain('data-testid="batch-delete-btn"');
  });

  it('renders clear-selection-btn', () => {
    expect(gridSource).toContain('data-testid="clear-selection-btn"');
    expect(gridSource).toContain('clearSelection');
  });
});

// ---------------------------------------------------------------------------
// Select-all header
// ---------------------------------------------------------------------------

describe('organize batch — select-all header', () => {
  it('renders organize-header when no pages selected', () => {
    expect(gridSource).toContain('data-testid="organize-header"');
  });

  it('renders select-all-btn in the header', () => {
    expect(gridSource).toContain('data-testid="select-all-btn"');
  });

  it('select-all-btn calls selectAll', () => {
    const btnIdx   = gridSource.indexOf('select-all-btn');
    const btnStart = gridSource.lastIndexOf('<button', btnIdx);
    const btnEnd   = gridSource.indexOf('</button>', btnIdx);
    const btn      = gridSource.slice(btnStart, btnEnd);
    expect(btn).toContain('selectAll');
  });
});

// ---------------------------------------------------------------------------
// Batch delete
// ---------------------------------------------------------------------------

describe('organize batch — batch delete', () => {
  it('calls delete_pages with all selected indices', () => {
    expect(gridSource).toContain("'delete_pages'");
    expect(gridSource).toContain('pageIndices: indices');
  });

  it('sorts indices before sending', () => {
    // Locate handleBatchDelete
    const fnStart = gridSource.indexOf('handleBatchDelete');
    const fnEnd   = gridSource.indexOf('\n  }', fnStart) + 4;
    const fnBody  = gridSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('.sort((a, b) => a - b)');
  });

  it('guards against deleting all pages', () => {
    expect(gridSource).toContain('selectedPages.size >= pageCount');
  });

  it('canBatchDelete prevents deletion when all pages selected', () => {
    expect(gridSource).toContain('canBatchDelete');
    expect(gridSource).toContain('selectedPages.size < pageCount');
  });

  it('clears selection after successful batch delete', () => {
    const fnStart = gridSource.indexOf('handleBatchDelete');
    const fnEnd   = gridSource.indexOf('\n  }', fnStart) + 4;
    const fnBody  = gridSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('clearSelection()');
  });

  it('calls onPageMutation after batch delete', () => {
    const fnStart = gridSource.indexOf('handleBatchDelete');
    const fnEnd   = gridSource.indexOf('\n  }', fnStart) + 4;
    const fnBody  = gridSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('onPageMutation(result.page_count)');
  });

  it('pushes a running task on batch delete start', () => {
    const fnStart = gridSource.indexOf('handleBatchDelete');
    const fnEnd   = gridSource.indexOf('\n  }', fnStart) + 4;
    const fnBody  = gridSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("status: 'running'");
  });

  it('updates task to done on batch delete success', () => {
    const fnStart = gridSource.indexOf('handleBatchDelete');
    const fnEnd   = gridSource.indexOf('\n  }', fnStart) + 4;
    const fnBody  = gridSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("status: 'done'");
  });

  it('updates task to error on batch delete failure', () => {
    const fnStart = gridSource.indexOf('handleBatchDelete');
    const fnEnd   = gridSource.indexOf('\n  }', fnStart) + 4;
    const fnBody  = gridSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("status: 'error'");
  });
});

// ---------------------------------------------------------------------------
// Batch rotate
// ---------------------------------------------------------------------------

describe('organize batch — batch rotate', () => {
  it('calls rotate_pages with all selected indices', () => {
    expect(gridSource).toContain("'rotate_pages'");
    expect(gridSource).toContain('pageIndices: indices');
  });

  it('rotates by 90 degrees', () => {
    const fnStart = gridSource.indexOf('handleBatchRotate');
    const fnEnd   = gridSource.indexOf('\n  }', fnStart) + 4;
    const fnBody  = gridSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('rotation: 90');
  });

  it('clears selection after successful batch rotate', () => {
    const fnStart = gridSource.indexOf('handleBatchRotate');
    const fnEnd   = gridSource.indexOf('\n  }', fnStart) + 4;
    const fnBody  = gridSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('clearSelection()');
  });

  it('calls onPageMutation after batch rotate', () => {
    const fnStart = gridSource.indexOf('handleBatchRotate');
    const fnEnd   = gridSource.indexOf('\n  }', fnStart) + 4;
    const fnBody  = gridSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('onPageMutation(result.page_count)');
  });
});

// ---------------------------------------------------------------------------
// Per-tile selection UI
// ---------------------------------------------------------------------------

describe('organize batch — tile selection UI', () => {
  it('tiles are clickable to toggle selection', () => {
    expect(gridSource).toContain('onClick={() => { toggleSelection(i); }}');
  });

  it('tile has a selected visual state class', () => {
    expect(gridSource).toContain('ring-2 ring-primary/30');
  });

  it('renders organize-selected testid when tile is selected', () => {
    expect(gridSource).toContain('data-testid={`organize-selected-${i}`}');
  });

  it('per-tile action buttons stop click propagation', () => {
    expect(gridSource).toContain('e.stopPropagation()');
  });

  it('isSelected controls the visual ring', () => {
    expect(gridSource).toContain('isSelected');
    expect(gridSource).toContain('border-primary ring-2 ring-primary/30');
  });
});

// ---------------------------------------------------------------------------
// No regressions to existing single-page operations
// ---------------------------------------------------------------------------

describe('organize batch — single-page operation regressions', () => {
  it('organize-grid testid still present', () => {
    expect(gridSource).toContain('data-testid="organize-grid"');
  });

  it('per-tile rotate button still present', () => {
    expect(gridSource).toContain('data-testid={`organize-rotate-${i}`}');
  });

  it('per-tile delete button still present', () => {
    expect(gridSource).toContain('data-testid={`organize-delete-${i}`}');
  });

  it('thumbnail testid still present', () => {
    expect(gridSource).toContain('data-testid={`organize-thumb-${i}`}');
  });

  it('page number testid still present', () => {
    expect(gridSource).toContain('data-testid={`organize-page-number-${i}`}');
  });

  it('page-tile testid still present', () => {
    expect(gridSource).toContain('data-testid={`organize-page-tile-${i}`}');
  });

  it('single-page delete still guards against deleting the last page', () => {
    const fnStart = gridSource.indexOf('handleDeletePage');
    const fnEnd   = gridSource.indexOf('\n  }', fnStart) + 4;
    const fnBody  = gridSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('pageCount <= 1');
  });

  it('single-page rotate still uses rotate_pages', () => {
    const fnStart = gridSource.indexOf('handleRotatePage');
    const fnEnd   = gridSource.indexOf('\n  }', fnStart) + 4;
    const fnBody  = gridSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("'rotate_pages'");
  });
});

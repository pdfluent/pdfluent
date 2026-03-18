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
// Pending order state
// ---------------------------------------------------------------------------

describe('organize pending order — state', () => {
  it('declares pendingOrder state as number[] | null', () => {
    expect(gridSource).toContain('pendingOrder');
    expect(gridSource).toContain('useState<number[] | null>(null)');
  });

  it('resets pendingOrder to null when pageCount changes', () => {
    expect(gridSource).toContain('useEffect(() => { setPendingOrder(null); }, [pageCount])');
  });

  it('computes displayOrder from pendingOrder or original sequence', () => {
    expect(gridSource).toContain('const displayOrder = pendingOrder ??');
    expect(gridSource).toContain('Array.from({ length: pageCount }');
  });

  it('grid iterates displayOrder via .map()', () => {
    expect(gridSource).toContain('displayOrder.map((i, displayPos) => {');
  });
});

// ---------------------------------------------------------------------------
// handleLocalReorder
// ---------------------------------------------------------------------------

describe('organize pending order — handleLocalReorder', () => {
  it('defines handleLocalReorder function', () => {
    expect(gridSource).toContain('function handleLocalReorder(src: number, dst: number): void');
  });

  it('returns early when src === dst', () => {
    const fnStart = gridSource.indexOf('function handleLocalReorder');
    const fnEnd = gridSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = gridSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('if (src === dst) return');
  });

  it('splices src out and inserts at dst', () => {
    const fnStart = gridSource.indexOf('function handleLocalReorder');
    const fnEnd = gridSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = gridSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('next.splice(src, 1)');
    expect(fnBody).toContain('next.splice(dst, 0, removed!)');
  });

  it('updates pendingOrder state (does not invoke Tauri)', () => {
    const fnStart = gridSource.indexOf('function handleLocalReorder');
    const fnEnd = gridSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = gridSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('setPendingOrder(prev =>');
    expect(fnBody).not.toContain('invoke');
  });
});

// ---------------------------------------------------------------------------
// handleApplyOrder
// ---------------------------------------------------------------------------

describe('organize pending order — handleApplyOrder', () => {
  it('defines handleApplyOrder as an async function', () => {
    expect(gridSource).toContain('async function handleApplyOrder(): Promise<void>');
  });

  it('guards against null pendingOrder and non-Tauri environment', () => {
    const fnStart = gridSource.indexOf('async function handleApplyOrder');
    const fnEnd = gridSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = gridSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('if (!pendingOrder || !isTauri) return');
  });

  it('invokes reorder_pages with newOrder: pendingOrder', () => {
    const fnStart = gridSource.indexOf('async function handleApplyOrder');
    const fnEnd = gridSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = gridSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("'reorder_pages'");
    expect(fnBody).toContain('newOrder: pendingOrder');
  });

  it('resets pendingOrder to null after successful apply', () => {
    const fnStart = gridSource.indexOf('async function handleApplyOrder');
    const fnEnd = gridSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = gridSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('setPendingOrder(null)');
  });

  it('calls onPageMutation after successful apply', () => {
    const fnStart = gridSource.indexOf('async function handleApplyOrder');
    const fnEnd = gridSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = gridSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('onPageMutation(result.page_count)');
  });

  it('pushes a running task and updates on success/error', () => {
    const fnStart = gridSource.indexOf('async function handleApplyOrder');
    const fnEnd = gridSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = gridSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("status: 'running'");
    expect(fnBody).toContain("status: 'done'");
    expect(fnBody).toContain("status: 'error'");
  });
});

// ---------------------------------------------------------------------------
// handleCancelOrder
// ---------------------------------------------------------------------------

describe('organize pending order — handleCancelOrder', () => {
  it('defines handleCancelOrder function', () => {
    expect(gridSource).toContain('function handleCancelOrder(): void');
  });

  it('resets pendingOrder to null', () => {
    const fnStart = gridSource.indexOf('function handleCancelOrder');
    const fnEnd = gridSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = gridSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('setPendingOrder(null)');
  });
});

// ---------------------------------------------------------------------------
// Pending order bar UI
// ---------------------------------------------------------------------------

describe('organize pending order — order bar UI', () => {
  it('renders organize-order-bar testid', () => {
    expect(gridSource).toContain('data-testid="organize-order-bar"');
  });

  it('order bar is conditional on pendingOrder !== null', () => {
    const barPos = gridSource.indexOf('organize-order-bar');
    const condPos = gridSource.lastIndexOf('pendingOrder !== null', barPos);
    expect(condPos).toBeGreaterThan(-1);
    expect(barPos - condPos).toBeLessThan(200);
  });

  it('renders organize-apply-order-btn', () => {
    expect(gridSource).toContain('data-testid="organize-apply-order-btn"');
  });

  it('apply button calls handleApplyOrder', () => {
    const btnPos = gridSource.indexOf('organize-apply-order-btn');
    const btnEnd = gridSource.indexOf('</button>', btnPos) + 9;
    const btnBlock = gridSource.slice(btnPos, btnEnd);
    expect(btnBlock).toContain('handleApplyOrder');
  });

  it('apply button is disabled when not in Tauri', () => {
    const btnPos = gridSource.indexOf('organize-apply-order-btn');
    const btnEnd = gridSource.indexOf('</button>', btnPos) + 9;
    const btnBlock = gridSource.slice(btnPos, btnEnd);
    expect(btnBlock).toContain('disabled={!isTauri}');
  });

  it('renders organize-cancel-order-btn', () => {
    expect(gridSource).toContain('data-testid="organize-cancel-order-btn"');
  });

  it('cancel button calls handleCancelOrder', () => {
    const btnPos = gridSource.indexOf('organize-cancel-order-btn');
    const btnEnd = gridSource.indexOf('</button>', btnPos) + 9;
    const btnBlock = gridSource.slice(btnPos, btnEnd);
    expect(btnBlock).toContain('handleCancelOrder');
  });

  it('apply button label is "Toepassen"', () => {
    const btnPos = gridSource.indexOf('organize-apply-order-btn');
    const btnEnd = gridSource.indexOf('</button>', btnPos) + 9;
    const btnBlock = gridSource.slice(btnPos, btnEnd);
    expect(btnBlock).toContain("t('common.apply')");
  });

  it('cancel button label is "Annuleren"', () => {
    const btnPos = gridSource.indexOf('organize-cancel-order-btn');
    const btnEnd = gridSource.indexOf('</button>', btnPos) + 9;
    const btnBlock = gridSource.slice(btnPos, btnEnd);
    expect(btnBlock).toContain("t('common.cancel')");
  });
});

// ---------------------------------------------------------------------------
// Drag wiring to handleLocalReorder
// ---------------------------------------------------------------------------

describe('organize pending order — drag wiring', () => {
  it('onDrop calls handleLocalReorder instead of invoking Tauri directly', () => {
    expect(gridSource).toContain('handleLocalReorder(dragSrcRef.current, displayPos)');
  });

  it('onDragStart records displayPos in dragSrcRef', () => {
    expect(gridSource).toContain('dragSrcRef.current = displayPos');
  });

  it('onDragOver sets dragOverIdx to displayPos', () => {
    expect(gridSource).toContain('setDragOverIdx(displayPos)');
  });
});

// ---------------------------------------------------------------------------
// No regressions
// ---------------------------------------------------------------------------

describe('organize pending order — no regressions', () => {
  it('organize-grid testid still present', () => {
    expect(gridSource).toContain('data-testid="organize-grid"');
  });

  it('batch-action-bar testid still present', () => {
    expect(gridSource).toContain('data-testid="batch-action-bar"');
  });

  it('organize-header testid still present', () => {
    expect(gridSource).toContain('data-testid="organize-header"');
  });

  it('thumbnails.get(i) still used for thumbnail lookup', () => {
    expect(gridSource).toContain('thumbnails.get(i)');
  });

  it('page tile testid still uses i', () => {
    expect(gridSource).toContain('data-testid={`organize-page-tile-${i}`}');
  });

  it('rotate button testid still uses i', () => {
    expect(gridSource).toContain('data-testid={`organize-rotate-${i}`}');
  });

  it('delete button testid still uses i', () => {
    expect(gridSource).toContain('data-testid={`organize-delete-${i}`}');
  });

  it('page number still shows i + 1', () => {
    expect(gridSource).toContain('{i + 1}');
  });

  it('toggleSelection still called with i', () => {
    expect(gridSource).toContain('onClick={() => { toggleSelection(i); }}');
  });
});

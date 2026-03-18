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

const transformSource = readFileSync(
  new URL('../src/platform/engine/tauri/TauriTransformEngine.ts', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// OrganizeGrid — drag-to-reorder state
// ---------------------------------------------------------------------------

describe('OrganizeGrid — drag-to-reorder state', () => {
  it('declares dragSrcRef with useRef', () => {
    expect(gridSource).toContain('dragSrcRef');
    expect(gridSource).toContain('useRef<number>');
  });

  it('declares dragOverIdx state', () => {
    expect(gridSource).toContain('dragOverIdx');
    expect(gridSource).toContain('useState<number>');
  });

  it('initializes dragSrcRef to -1', () => {
    expect(gridSource).toContain('dragSrcRef = useRef<number>(-1)');
  });

  it('initializes dragOverIdx to -1', () => {
    expect(gridSource).toContain('dragOverIdx, setDragOverIdx] = useState<number>(-1)');
  });
});

// ---------------------------------------------------------------------------
// OrganizeGrid — handleApplyOrder (replaces old immediate handleReorderPages)
// ---------------------------------------------------------------------------

describe('OrganizeGrid — handleApplyOrder', () => {
  it('declares handleApplyOrder async function', () => {
    expect(gridSource).toContain('async function handleApplyOrder');
  });

  it('guards on isTauri', () => {
    const fnStart = gridSource.indexOf('async function handleApplyOrder');
    const fnEnd = gridSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = gridSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('isTauri');
  });

  it('calls invoke reorder_pages', () => {
    expect(gridSource).toContain("invoke<{ page_count: number }>('reorder_pages'");
  });

  it('passes newOrder: pendingOrder to invoke', () => {
    expect(gridSource).toContain('newOrder: pendingOrder');
  });

  it('calls onPageMutation with result.page_count on success', () => {
    expect(gridSource).toContain('onPageMutation(result.page_count)');
  });

  it('pushes a task for visual progress feedback', () => {
    const fnStart = gridSource.indexOf('async function handleApplyOrder');
    const fnEnd = gridSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = gridSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('push(');
    expect(fnBody).toContain("'running'");
  });

  it('updates task to done on success', () => {
    const fnStart = gridSource.indexOf('async function handleApplyOrder');
    const fnEnd = gridSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = gridSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("status: 'done'");
  });

  it('updates task to error on failure', () => {
    const fnStart = gridSource.indexOf('async function handleApplyOrder');
    const fnEnd = gridSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = gridSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("status: 'error'");
  });
});

// ---------------------------------------------------------------------------
// OrganizeGrid — tile drag attributes
// ---------------------------------------------------------------------------

describe('OrganizeGrid — tile drag attributes', () => {
  it('sets draggable on tiles (gated on isTauri)', () => {
    expect(gridSource).toContain('draggable={isTauri}');
  });

  it('has onDragStart handler that sets dragSrcRef to displayPos and effectAllowed', () => {
    expect(gridSource).toContain('onDragStart=');
    expect(gridSource).toContain('dragSrcRef.current = displayPos');
    expect(gridSource).toContain("effectAllowed = 'move'");
  });

  it('has onDragOver handler that prevents default and sets dragOverIdx to displayPos', () => {
    expect(gridSource).toContain('onDragOver=');
    expect(gridSource).toContain('e.preventDefault()');
    expect(gridSource).toContain('setDragOverIdx(displayPos)');
  });

  it('has onDragLeave that clears dragOverIdx', () => {
    expect(gridSource).toContain('onDragLeave=');
    expect(gridSource).toContain('setDragOverIdx(-1)');
  });

  it('has onDrop handler that calls handleLocalReorder', () => {
    expect(gridSource).toContain('onDrop=');
    expect(gridSource).toContain('handleLocalReorder(dragSrcRef.current, displayPos)');
  });

  it('onDrop clears dragSrcRef and dragOverIdx', () => {
    const dropStart = gridSource.indexOf('onDrop=');
    const dropEnd = gridSource.indexOf('})', dropStart) + 2;
    const dropBlock = gridSource.slice(dropStart, dropEnd);
    expect(dropBlock).toContain('dragSrcRef.current = -1');
    expect(dropBlock).toContain('setDragOverIdx(-1)');
  });

  it('has onDragEnd that clears both drag refs', () => {
    expect(gridSource).toContain('onDragEnd=');
    const endStart = gridSource.indexOf('onDragEnd=');
    const endEnd = gridSource.indexOf('})', endStart) + 2;
    const endBlock = gridSource.slice(endStart, endEnd);
    expect(endBlock).toContain('setDragOverIdx(-1)');
    expect(endBlock).toContain('dragSrcRef.current = -1');
  });
});

// ---------------------------------------------------------------------------
// OrganizeGrid — drag-over visual feedback
// ---------------------------------------------------------------------------

describe('OrganizeGrid — drag-over visual feedback', () => {
  it('applies drag-target highlight class when dragOverIdx matches display position', () => {
    expect(gridSource).toContain('dragOverIdx === displayPos');
    expect(gridSource).toContain('ring-primary/40');
  });

  it('does not highlight source tile as drop target', () => {
    expect(gridSource).toContain('dragSrcRef.current !== displayPos');
  });

  it('applies bg change for drop target', () => {
    expect(gridSource).toContain('bg-primary/5');
  });
});

// ---------------------------------------------------------------------------
// TauriTransformEngine — reorderPages wired to Tauri
// ---------------------------------------------------------------------------

describe('TauriTransformEngine — reorderPages Tauri wiring', () => {
  it('imports Page type from document', () => {
    expect(transformSource).toContain("import type { PdfDocument, Page }");
  });

  it('defines TauriReorderDocInfo local type', () => {
    expect(transformSource).toContain('TauriReorderDocInfo');
  });

  it('defines TauriReorderPageInfo local type', () => {
    expect(transformSource).toContain('TauriReorderPageInfo');
  });

  it('calls invoke reorder_pages with newOrder', () => {
    expect(transformSource).toContain("invoke<TauriReorderDocInfo>('reorder_pages'");
    expect(transformSource).toContain('newOrder');
  });

  it('maps pages from TauriReorderDocInfo to Page[]', () => {
    const reorderStart = transformSource.indexOf('async reorderPages(');
    const reorderEnd = transformSource.indexOf('\n  }', reorderStart) + 4;
    const fnBody = transformSource.slice(reorderStart, reorderEnd);
    expect(fnBody).toContain('pages: Page[]');
    expect(fnBody).toContain('info.pages.map');
    expect(fnBody).toContain('width_pt');
    expect(fnBody).toContain('height_pt');
  });

  it('returns success with updated document preserving existing props', () => {
    const reorderStart = transformSource.indexOf('async reorderPages(');
    const reorderEnd = transformSource.indexOf('\n  }', reorderStart) + 4;
    const fnBody = transformSource.slice(reorderStart, reorderEnd);
    expect(fnBody).toContain('{ ...document, pages }');
  });

  it('returns internal-error on invoke failure', () => {
    const reorderStart = transformSource.indexOf('async reorderPages(');
    const reorderEnd = transformSource.indexOf('\n  }', reorderStart) + 4;
    const fnBody = transformSource.slice(reorderStart, reorderEnd);
    expect(fnBody).toContain("code: 'internal-error'");
  });

  it('still validates page indices before invoke', () => {
    const reorderStart = transformSource.indexOf('async reorderPages(');
    const reorderEnd = transformSource.indexOf('\n  }', reorderStart) + 4;
    const fnBody = transformSource.slice(reorderStart, reorderEnd);
    expect(fnBody).toContain('page-not-found');
  });
});

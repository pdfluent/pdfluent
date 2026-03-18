// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const navRailSource = readFileSync(
  new URL('../src/viewer/components/LeftNavRail.tsx', import.meta.url),
  'utf8'
);

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// LeftNavRail — onReorderPages prop
// ---------------------------------------------------------------------------

describe('LeftNavRail — onReorderPages prop', () => {
  it('declares onReorderPages in LeftNavRailProps', () => {
    expect(navRailSource).toContain('onReorderPages?: (newOrder: number[]) => void');
  });

  it('passes onReorderPages to ThumbnailPanel', () => {
    expect(navRailSource).toContain('onReorderPages={onReorderPages}');
  });
});

// ---------------------------------------------------------------------------
// LeftNavRail — ThumbnailPanel drag-to-reorder
// ---------------------------------------------------------------------------

describe('LeftNavRail — ThumbnailPanel drag-to-reorder', () => {
  function thumbnailPanelBody(): string {
    const fnStart = navRailSource.indexOf('function ThumbnailPanel(');
    const fnEnd = navRailSource.indexOf('function OutlineItem(', fnStart);
    return navRailSource.slice(fnStart, fnEnd);
  }

  it('accepts onReorderPages prop', () => {
    expect(thumbnailPanelBody()).toContain('onReorderPages');
  });

  it('sets draggable on thumbnail buttons when onReorderPages provided', () => {
    expect(thumbnailPanelBody()).toContain('draggable=');
  });

  it('tracks drag source index via dragSrcIndex ref', () => {
    expect(thumbnailPanelBody()).toContain('dragSrcIndex');
  });

  it('defines handleDragStart function', () => {
    expect(thumbnailPanelBody()).toContain('handleDragStart');
  });

  it('defines handleDragOver function', () => {
    expect(thumbnailPanelBody()).toContain('handleDragOver');
  });

  it('defines handleDrop function', () => {
    expect(thumbnailPanelBody()).toContain('handleDrop');
  });

  it('calls e.preventDefault() in handleDragOver', () => {
    expect(thumbnailPanelBody()).toContain('e.preventDefault()');
  });

  it('builds new page order array on drop', () => {
    expect(thumbnailPanelBody()).toContain('order.splice(');
  });

  it('calls onReorderPages with computed order', () => {
    expect(thumbnailPanelBody()).toContain('onReorderPages?.(order)');
  });

  it('wires onDragStart handler to thumbnail button', () => {
    expect(thumbnailPanelBody()).toContain('onDragStart=');
  });

  it('wires onDragOver handler to thumbnail button', () => {
    expect(thumbnailPanelBody()).toContain('onDragOver=');
  });

  it('wires onDrop handler to thumbnail button', () => {
    expect(thumbnailPanelBody()).toContain('onDrop=');
  });

  it('does not reorder when src equals drop target', () => {
    expect(thumbnailPanelBody()).toContain('src === dropIndex');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — handleReorderPages
// ---------------------------------------------------------------------------

describe('ViewerApp — handleReorderPages', () => {
  it('defines handleReorderPages callback', () => {
    expect(viewerAppSource).toContain('handleReorderPages');
  });

  it('invokes reorder_pages Tauri command', () => {
    const fnStart = viewerAppSource.indexOf('handleReorderPages');
    const fnBody = viewerAppSource.slice(fnStart, fnStart + 300);
    expect(fnBody).toContain("'reorder_pages'");
  });

  it('passes newOrder parameter to reorder_pages', () => {
    const fnStart = viewerAppSource.indexOf('handleReorderPages');
    const fnBody = viewerAppSource.slice(fnStart, fnStart + 300);
    expect(fnBody).toContain('newOrder');
  });

  it('calls markDirty after reorder', () => {
    const fnStart = viewerAppSource.indexOf('handleReorderPages');
    const fnBody = viewerAppSource.slice(fnStart, fnStart + 300);
    expect(fnBody).toContain('markDirty()');
  });

  it('passes onReorderPages to LeftNavRail', () => {
    expect(viewerAppSource).toContain('onReorderPages={handleReorderPages}');
  });
});

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

// ---------------------------------------------------------------------------
// ThumbnailPanel — virtualization constants
// ---------------------------------------------------------------------------

describe('ThumbnailPanel — virtualization constants', () => {
  it('defines THUMBNAIL_ITEM_HEIGHT constant', () => {
    expect(navRailSource).toContain('THUMBNAIL_ITEM_HEIGHT');
  });

  it('defines THUMBNAIL_OVERSCAN constant', () => {
    expect(navRailSource).toContain('THUMBNAIL_OVERSCAN');
  });
});

// ---------------------------------------------------------------------------
// ThumbnailPanel — virtual scroll state and refs
// ---------------------------------------------------------------------------

describe('ThumbnailPanel — virtual scroll state and refs', () => {
  function thumbnailPanelBody(): string {
    const fnStart = navRailSource.indexOf('function ThumbnailPanel(');
    const fnEnd = navRailSource.indexOf('function OutlineItem(', fnStart);
    return navRailSource.slice(fnStart, fnEnd);
  }

  it('tracks containerRef for scroll container element', () => {
    expect(thumbnailPanelBody()).toContain('containerRef');
  });

  it('tracks scrollTop state', () => {
    expect(thumbnailPanelBody()).toContain('scrollTop');
    expect(thumbnailPanelBody()).toContain('setScrollTop');
  });

  it('tracks containerHeight state', () => {
    expect(thumbnailPanelBody()).toContain('containerHeight');
    expect(thumbnailPanelBody()).toContain('setContainerHeight');
  });

  it('uses ResizeObserver to watch container size', () => {
    expect(thumbnailPanelBody()).toContain('ResizeObserver');
  });

  it('disconnects ResizeObserver on cleanup', () => {
    expect(thumbnailPanelBody()).toContain('ro.disconnect()');
  });

  it('computes visibleStart from scrollTop and THUMBNAIL_ITEM_HEIGHT', () => {
    expect(thumbnailPanelBody()).toContain('visibleStart');
    expect(thumbnailPanelBody()).toContain('THUMBNAIL_ITEM_HEIGHT');
  });

  it('computes visibleEnd from scrollTop and containerHeight', () => {
    expect(thumbnailPanelBody()).toContain('visibleEnd');
    expect(thumbnailPanelBody()).toContain('containerHeight');
  });

  it('applies THUMBNAIL_OVERSCAN buffer to visible range', () => {
    expect(thumbnailPanelBody()).toContain('THUMBNAIL_OVERSCAN');
  });

  it('computes topPad from visibleStart', () => {
    expect(thumbnailPanelBody()).toContain('topPad');
  });

  it('computes bottomPad from remaining items below visible window', () => {
    expect(thumbnailPanelBody()).toContain('bottomPad');
  });
});

// ---------------------------------------------------------------------------
// ThumbnailPanel — virtual scroll DOM structure
// ---------------------------------------------------------------------------

describe('ThumbnailPanel — virtual scroll DOM structure', () => {
  function thumbnailPanelBody(): string {
    const fnStart = navRailSource.indexOf('function ThumbnailPanel(');
    const fnEnd = navRailSource.indexOf('function OutlineItem(', fnStart);
    return navRailSource.slice(fnStart, fnEnd);
  }

  it('attaches containerRef to scroll container div', () => {
    expect(thumbnailPanelBody()).toContain('ref={containerRef}');
  });

  it('has thumbnail-scroll-container testid', () => {
    expect(thumbnailPanelBody()).toContain('data-testid="thumbnail-scroll-container"');
  });

  it('updates scrollTop state on scroll event', () => {
    expect(thumbnailPanelBody()).toContain('setScrollTop(');
    expect(thumbnailPanelBody()).toContain('.scrollTop');
  });

  it('renders top spacer div with topPad height', () => {
    expect(thumbnailPanelBody()).toContain('topPad > 0');
    expect(thumbnailPanelBody()).toContain('height: topPad');
  });

  it('renders bottom spacer div with bottomPad height', () => {
    expect(thumbnailPanelBody()).toContain('bottomPad > 0');
    expect(thumbnailPanelBody()).toContain('height: bottomPad');
  });

  it('renders only visible window slice of thumbnails', () => {
    expect(thumbnailPanelBody()).toContain('visibleEnd - visibleStart + 1');
  });

  it('uses page index i = visibleStart + idx for data-testid', () => {
    expect(thumbnailPanelBody()).toContain('visibleStart + idx');
  });
});

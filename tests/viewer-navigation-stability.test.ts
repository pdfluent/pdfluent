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

const viewerAppSource = [
  '../src/viewer/hooks/usePageNavigation.ts',
  '../src/viewer/hooks/useZoomControls.ts',
  '../src/viewer/hooks/useSidebarState.ts',
  '../src/viewer/hooks/useUndoRedo.ts',
  '../src/viewer/hooks/useSearch.ts',
  '../src/viewer/hooks/useFormFields.ts',
  '../src/viewer/hooks/useModeManager.ts',
  '../src/viewer/hooks/useDocumentLifecycle.ts',
  '../src/viewer/hooks/useCommands.ts',
  '../src/viewer/hooks/useDragDrop.ts',
  '../src/viewer/ViewerSidePanels.tsx',
  '../src/viewer/hooks/useAnnotations.ts',
  '../src/viewer/hooks/useTextInteraction.ts',
  '../src/viewer/hooks/useKeyboardShortcuts.ts',
  '../src/viewer/ViewerApp.tsx',
  '../src/viewer/WelcomeSection.tsx',
].map(p => readFileSync(new URL(p, import.meta.url), 'utf8')).join('\n\n');

const engineSource = readFileSync(
  new URL('../src-tauri/src/pdf_engine.rs', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// Stability — LeftNavRailProps completeness
// ---------------------------------------------------------------------------

describe('Stability — LeftNavRailProps interface completeness', () => {
  it('contains all required navigation props', () => {
    const ifaceStart = navRailSource.indexOf('interface LeftNavRailProps');
    const ifaceEnd = navRailSource.indexOf('\n}', ifaceStart) + 2;
    const iface = navRailSource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('thumbnails');
    expect(iface).toContain('pageCount');
    expect(iface).toContain('currentPage');
    expect(iface).toContain('onPageSelect');
    expect(iface).toContain('outline');
    expect(iface).toContain('onReorderPages');
    expect(iface).toContain('pageLabels');
  });
});

// ---------------------------------------------------------------------------
// Stability — ThumbnailPanel feature coexistence
// ---------------------------------------------------------------------------

describe('Stability — ThumbnailPanel features coexist', () => {
  function thumbnailPanelBody(): string {
    const fnStart = navRailSource.indexOf('function ThumbnailPanel(');
    const fnEnd = navRailSource.indexOf('function OutlineItem(', fnStart);
    return navRailSource.slice(fnStart, fnEnd);
  }

  it('virtualization does not break drag-and-drop (dragSrcIndex still present)', () => {
    expect(thumbnailPanelBody()).toContain('dragSrcIndex');
  });

  it('virtualization does not break page label display', () => {
    expect(thumbnailPanelBody()).toContain('pageLabels?.[i]');
  });

  it('virtualization does not break active page highlighting', () => {
    expect(thumbnailPanelBody()).toContain('isActive');
    expect(thumbnailPanelBody()).toContain('2px solid #2563eb');
  });

  it('virtualization does not break auto-scroll to active page', () => {
    expect(thumbnailPanelBody()).toContain('scrollIntoView');
  });

  it('drag handlers are still wired to visible thumbnail buttons', () => {
    expect(thumbnailPanelBody()).toContain('onDragStart=');
    expect(thumbnailPanelBody()).toContain('onDragOver=');
    expect(thumbnailPanelBody()).toContain('onDrop=');
  });
});

// ---------------------------------------------------------------------------
// Stability — ViewerApp wires all navigation callbacks
// ---------------------------------------------------------------------------

describe('Stability — ViewerApp passes all navigation callbacks to LeftNavRail', () => {
  function leftNavRailBlock(): string {
    const start = viewerAppSource.indexOf('<LeftNavRail');
    const end = viewerAppSource.indexOf('/>', start) + 2;
    return viewerAppSource.slice(start, end);
  }

  it('passes thumbnails', () => {
    expect(leftNavRailBlock()).toContain('thumbnails=');
  });

  it('passes pageCount', () => {
    expect(leftNavRailBlock()).toContain('pageCount=');
  });

  it('passes currentPage (pageIndex)', () => {
    expect(leftNavRailBlock()).toContain('currentPage=');
  });

  it('passes onPageSelect', () => {
    expect(leftNavRailBlock()).toContain('onPageSelect=');
  });

  it('passes outline', () => {
    expect(leftNavRailBlock()).toContain('outline=');
  });

  it('passes onReorderPages', () => {
    expect(leftNavRailBlock()).toContain('onReorderPages=');
  });

  it('passes pageLabels', () => {
    expect(leftNavRailBlock()).toContain('pageLabels=');
  });
});

// ---------------------------------------------------------------------------
// Stability — ViewerApp navigation state initialisation
// ---------------------------------------------------------------------------

describe('Stability — ViewerApp navigation state initialisation', () => {
  it('initialises outline as empty array', () => {
    expect(viewerAppSource).toContain('useState<OutlineNode[]>([])');
  });

  it('initialises pageLabels as empty array', () => {
    expect(viewerAppSource).toContain("useState<string[]>([])");
  });

  it('fetches outline and page labels on document load', () => {
    expect(viewerAppSource).toContain('getOutline(');
    expect(viewerAppSource).toContain("'get_page_labels'");
  });
});

// ---------------------------------------------------------------------------
// Stability — pdf_engine rotation does not touch page labels
// ---------------------------------------------------------------------------

describe('Stability — pdf_engine rotation and page labels are independent', () => {
  it('rotate_page_left does not mutate /PageLabels', () => {
    const fnStart = engineSource.indexOf('pub fn rotate_page_left(');
    const fnEnd = engineSource.indexOf('pub fn rotate_page_right(', fnStart);
    const body = engineSource.slice(fnStart, fnEnd);
    expect(body).not.toContain('PageLabels');
  });

  it('rotate_page_right does not mutate /PageLabels', () => {
    const fnStart = engineSource.indexOf('pub fn rotate_page_right(');
    // Tight window: just the function body (ends with `}` on its own line)
    const fnEnd = engineSource.indexOf('\n    }\n', fnStart) + 7;
    const body = engineSource.slice(fnStart, fnEnd);
    expect(body).not.toContain('PageLabels');
  });

  it('get_page_labels is read-only (takes &self)', () => {
    expect(engineSource).toContain('pub fn get_page_labels(&self)');
  });
});

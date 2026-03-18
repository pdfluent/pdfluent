// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const toolbarSource = readFileSync(
  new URL('../src/viewer/components/ModeToolbar.tsx', import.meta.url),
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

const useDocumentSource = readFileSync(
  new URL('../src/viewer/hooks/useDocument.ts', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// WIRED_TOOLS definition
// ---------------------------------------------------------------------------

describe('ModeToolbar — WIRED_TOOLS', () => {
  it('exports WIRED_TOOLS as a ReadonlySet', () => {
    expect(toolbarSource).toContain('WIRED_TOOLS');
    expect(toolbarSource).toContain('ReadonlySet<string>');
  });

  it('includes all three read mode tools', () => {
    expect(toolbarSource).toContain("'toolbar.zoomIn'");
    expect(toolbarSource).toContain("'toolbar.zoomOut'");
    expect(toolbarSource).toContain("'toolbar.searchText'");
  });

  it('includes both wired organize mode tools', () => {
    expect(toolbarSource).toContain("'toolbar.deletePage'");
    expect(toolbarSource).toContain("'toolbar.rotateLeft'");
    expect(toolbarSource).toContain("'toolbar.rotateRight'");
  });

  it('does not include annotation tool labels in WIRED_TOOLS set', () => {
    // Annotation tools (Markeren, Onderstrepen, etc.) have their own active/inactive state
    // and are NOT gated by WIRED_TOOLS. Check only the WIRED_TOOLS set definition itself.
    const wiredStart = toolbarSource.indexOf('export const WIRED_TOOLS');
    const wiredEnd = toolbarSource.indexOf(']);', wiredStart) + 3;
    const wiredBlock = toolbarSource.slice(wiredStart, wiredEnd);
    expect(wiredBlock).not.toContain("'Markeren'");
    expect(wiredBlock).not.toContain("'Onderstrepen'");
    expect(wiredBlock).not.toContain("'Opmerking'");
  });
});

// ---------------------------------------------------------------------------
// Read mode actions
// ---------------------------------------------------------------------------

describe('ModeToolbar — read mode actions', () => {
  it('accepts onZoomIn prop', () => {
    expect(toolbarSource).toContain('onZoomIn:');
    expect(toolbarSource).toContain('onZoomIn()');
  });

  it('accepts onZoomOut prop', () => {
    expect(toolbarSource).toContain('onZoomOut:');
    expect(toolbarSource).toContain('onZoomOut()');
  });

  it('accepts onOpenSearch prop', () => {
    expect(toolbarSource).toContain('onOpenSearch:');
    expect(toolbarSource).toContain('onOpenSearch()');
  });

  it('routes Inzoomen to onZoomIn in the action switch', () => {
    expect(toolbarSource).toContain("case 'toolbar.zoomIn'");
    expect(toolbarSource).toContain('onZoomIn()');
  });

  it('routes Uitzoomen to onZoomOut in the action switch', () => {
    expect(toolbarSource).toContain("case 'toolbar.zoomOut'");
    expect(toolbarSource).toContain('onZoomOut()');
  });

  it('routes Zoek tekst to onOpenSearch in the action switch', () => {
    expect(toolbarSource).toContain("case 'toolbar.searchText'");
    expect(toolbarSource).toContain('onOpenSearch()');
  });
});

// ---------------------------------------------------------------------------
// Organize mode actions
// ---------------------------------------------------------------------------

describe('ModeToolbar — organize mode actions', () => {
  it('invokes delete_pages with current pageIndex', () => {
    expect(toolbarSource).toContain("'delete_pages'");
    expect(toolbarSource).toContain('pageIndices: [pageIndex]');
  });

  it('invokes rotate_page_right and rotate_page_left Tauri commands', () => {
    expect(toolbarSource).toContain("'rotate_page_right'");
    expect(toolbarSource).toContain("'rotate_page_left'");
  });

  it('guards delete when pageCount <= 1', () => {
    expect(toolbarSource).toContain('pageCount <= 1');
  });

  it('calls onPageMutation with result.page_count after delete', () => {
    expect(toolbarSource).toContain('onPageMutation(result.page_count)');
  });

  it('calls onPageMutation with result.page_count after rotate', () => {
    // rotate calls onPageMutation to trigger canvas refresh
    const rotateBlockStart = toolbarSource.indexOf('handleRotatePage');
    const mutationInRotate = toolbarSource.indexOf('onPageMutation(result.page_count)', rotateBlockStart);
    expect(mutationInRotate).toBeGreaterThan(rotateBlockStart);
  });

  it('accepts pageIndex and pageCount props', () => {
    expect(toolbarSource).toContain('pageIndex:');
    expect(toolbarSource).toContain('pageCount:');
  });
});

// ---------------------------------------------------------------------------
// Task queue integration
// ---------------------------------------------------------------------------

describe('ModeToolbar — task queue integration', () => {
  it('uses useTaskQueueContext for push and update', () => {
    expect(toolbarSource).toContain('useTaskQueueContext');
    expect(toolbarSource).toContain('push,');
    expect(toolbarSource).toContain('update }');
  });

  it('pushes a running task when delete starts', () => {
    expect(toolbarSource).toContain('delete-page-${Date.now()}');
    expect(toolbarSource).toContain("t('tasks.deletePageRunning'");
    expect(toolbarSource).toContain("status: 'running'");
  });

  it('pushes a running task when rotate starts', () => {
    expect(toolbarSource).toContain('rotate-page-right-${Date.now()}');
    expect(toolbarSource).toContain("t('tasks.rotateRightRunning'");
  });

  it('updates task to done on delete success', () => {
    expect(toolbarSource).toContain("t('tasks.deletePageDone'");
    expect(toolbarSource).toContain("status: 'done'");
  });

  it('updates task to done on rotate success', () => {
    expect(toolbarSource).toContain("t('tasks.rotateRightDone'");
  });

  it('updates task to error on delete failure', () => {
    expect(toolbarSource).toContain("t('tasks.deleteFailed')");
    expect(toolbarSource).toContain("status: 'error'");
  });

  it('updates task to error on rotate failure', () => {
    expect(toolbarSource).toContain("t('tasks.rotateFailed')");
  });
});

// ---------------------------------------------------------------------------
// Disabled tools still render
// ---------------------------------------------------------------------------

describe('ModeToolbar — disabled tools', () => {
  it('checks WIRED_TOOLS.has to determine enabled state', () => {
    expect(toolbarSource).toContain('WIRED_TOOLS.has(');
  });

  it('renders all tools regardless of wired state (no filtering)', () => {
    // Tools are rendered but with disabled={!wired} — not filtered out
    expect(toolbarSource).toContain('disabled={!wired}');
  });

  it('no longer has the top-level TODO(pdfluent-viewer) markers', () => {
    expect(toolbarSource).not.toContain('TODO(pdfluent-viewer): wire all ModeToolbar');
    expect(toolbarSource).not.toContain('TODO(pdfluent-viewer): connect individual tool buttons');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — ModeToolbar wiring
// ---------------------------------------------------------------------------

describe('ViewerApp — ModeToolbar wiring', () => {
  it('passes pageIndex to ModeToolbar', () => {
    expect(viewerAppSource).toContain('pageIndex={pageIndex}');
  });

  it('passes pageCount to ModeToolbar', () => {
    // pageCount already appears in RightContextPanel wiring too — check ModeToolbar context
    expect(viewerAppSource).toContain('pageCount={pageCount}');
  });

  it('passes onZoomIn to ModeToolbar', () => {
    expect(viewerAppSource).toContain('onZoomIn=');
  });

  it('passes onZoomOut to ModeToolbar', () => {
    expect(viewerAppSource).toContain('onZoomOut=');
  });

  it('passes onOpenSearch to ModeToolbar', () => {
    expect(viewerAppSource).toContain('onOpenSearch=');
    expect(viewerAppSource).toContain('setCommandPaletteOpen(true)');
  });

  it('passes onPageMutation to ModeToolbar', () => {
    expect(viewerAppSource).toContain('onPageMutation={handlePageMutation}');
  });

  it('tracks documentVersion state', () => {
    expect(viewerAppSource).toContain('documentVersion');
    expect(viewerAppSource).toContain('setDocumentVersion');
  });

  it('passes documentVersion as key to PageCanvas', () => {
    expect(viewerAppSource).toContain('key={documentVersion}');
  });

  it('handlePageMutation clamps pageIndex and increments documentVersion', () => {
    expect(viewerAppSource).toContain('handlePageMutation');
    expect(viewerAppSource).toContain('Math.min(prev, Math.max(0, newPageCount - 1))');
    expect(viewerAppSource).toContain('setDocumentVersion(v => v + 1)');
  });
});

// ---------------------------------------------------------------------------
// useDocument — updatePageCount
// ---------------------------------------------------------------------------

describe('useDocument — updatePageCount', () => {
  it('exports updatePageCount in the result interface', () => {
    expect(useDocumentSource).toContain('updatePageCount:');
    expect(useDocumentSource).toContain('(n: number) => void');
  });

  it('updatePageCount sets pageCount and marks dirty', () => {
    expect(useDocumentSource).toContain('setPageCount(n)');
    expect(useDocumentSource).toContain('setIsDirty(true)');
  });
});

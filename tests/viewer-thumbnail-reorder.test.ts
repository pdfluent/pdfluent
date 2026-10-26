// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';


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

// ---------------------------------------------------------------------------
// LeftNavRail — onReorderPages prop
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// LeftNavRail — ThumbnailPanel drag-to-reorder
// ---------------------------------------------------------------------------


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

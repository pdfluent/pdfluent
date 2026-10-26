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
// LeftNavRail — BookmarksPanel component
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// LeftNavRail — OutlineItem component
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// LeftNavRail — bookmarks panel tab
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// ViewerApp — outline state and fetch
// ---------------------------------------------------------------------------

describe('ViewerApp — outline state and fetch', () => {
  it('declares outline state as OutlineNode array', () => {
    expect(viewerAppSource).toContain('useState<OutlineNode[]>');
  });

  it('fetches outline via engine.document.getOutline', () => {
    expect(viewerAppSource).toContain('engine.document.getOutline(');
  });

  it('passes outline to LeftNavRail', () => {
    expect(viewerAppSource).toContain('outline={outline}');
  });
});

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
  '../src/viewer/v3/EditorV3Shell.tsx',
  '../src/viewer/WelcomeSection.tsx',
].map(p => readFileSync(new URL(p, import.meta.url), 'utf8')).join('\n\n');

// ---------------------------------------------------------------------------
// LeftNavRailProps — new navigation props
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Navigation bar UI
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// ViewerApp wiring
// ---------------------------------------------------------------------------

describe('ViewerApp — V3 nav props', () => {
  it('passes onNavigatePage to EditorV3Shell', () => {
    expect(viewerAppSource).toContain('onNavigatePage={navigateToPage}');
  });

  it('renders previous-page controls in the V3 shell', () => {
    expect(viewerAppSource).toContain('onNavigatePage(Math.max(0, pageIndex - 1))');
  });

  it('renders next-page controls in the V3 shell', () => {
    expect(viewerAppSource).toContain('onNavigatePage(Math.min(pageCount - 1, pageIndex + 1))');
  });

  it('keeps the floating page indicator in the V3 shell', () => {
    expect(viewerAppSource).toContain('data-testid="floating-page-indicator"');
  });
});

// ---------------------------------------------------------------------------
// No regressions
// ---------------------------------------------------------------------------



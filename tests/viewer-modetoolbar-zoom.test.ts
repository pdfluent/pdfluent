// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
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
  '../src/viewer/v3/EditorV3Shell.tsx',
  '../src/viewer/WelcomeSection.tsx',
].map(p => readFileSync(new URL(p, import.meta.url), 'utf8')).join('\n\n');

// ---------------------------------------------------------------------------
// ModeToolbarProps — zoom prop
// ---------------------------------------------------------------------------

describe('ModeToolbar — zoom prop declaration', () => {
  it('declares zoom in ModeToolbarProps', () => {
    expect(toolbarSource).toContain('zoom: number');
  });

  it('destructures zoom in the function signature', () => {
    const destructureStart = toolbarSource.indexOf('export function ModeToolbar(');
    const destructureEnd = toolbarSource.indexOf('}: ModeToolbarProps)', destructureStart);
    const block = toolbarSource.slice(destructureStart, destructureEnd);
    expect(block).toContain('zoom');
  });
});

// ---------------------------------------------------------------------------
// Zoom display rendering
// ---------------------------------------------------------------------------

describe('ModeToolbar — zoom display: rendering', () => {
  it('renders the zoom percentage using Math.round', () => {
    expect(toolbarSource).toContain('Math.round(zoom * 100)');
  });

  it('appends a % sign after the rounded value', () => {
    expect(toolbarSource).toContain('Math.round(zoom * 100)}%');
  });

  it('has data-testid toolbar-zoom-display', () => {
    expect(toolbarSource).toContain('data-testid="toolbar-zoom-display"');
  });

  it('has an aria-label with the zoom percentage', () => {
    expect(toolbarSource).toContain('aria-label={`Zoom ${Math.round(zoom * 100)}%`}');
  });

  it('uses tabular-nums for stable width', () => {
    // v2: tabular-nums is applied via the .modetoolbar-meta CSS class
    // (font-variant-numeric: tabular-nums), not as a Tailwind utility.
    expect(toolbarSource).toMatch(/tabular-nums|modetoolbar-meta/);
  });
});

// ---------------------------------------------------------------------------
// Read-mode only
// ---------------------------------------------------------------------------

describe('ModeToolbar — zoom display: read mode gate', () => {
  it("shows the zoom display only when mode === 'read'", () => {
    expect(toolbarSource).toContain("mode === 'read'");
  });

  it('zoom display is inside the read mode conditional block', () => {
    const readGate = toolbarSource.indexOf("mode === 'read'");
    const zoomDisplay = toolbarSource.indexOf('toolbar-zoom-display', readGate);
    expect(zoomDisplay).toBeGreaterThan(readGate);
  });

  it('zoom display is separated from the tool groups by a Divider', () => {
    const readGate = toolbarSource.indexOf("mode === 'read'");
    const dividerIdx = toolbarSource.indexOf('<Divider />', readGate);
    const displayIdx = toolbarSource.indexOf('toolbar-zoom-display', readGate);
    // Divider must appear before the display span in the read block
    expect(dividerIdx).toBeGreaterThan(readGate);
    expect(dividerIdx).toBeLessThan(displayIdx);
  });
});

// ---------------------------------------------------------------------------
// ViewerApp wiring
// ---------------------------------------------------------------------------

describe('ViewerApp — passes zoom to EditorV3Shell', () => {
  it('passes zoom={zoom} to EditorV3Shell', () => {
    expect(viewerAppSource).toContain('zoom={zoom}');
  });

  it('zoom prop appears on the EditorV3Shell element', () => {
    const modeToolbarStart = viewerAppSource.indexOf('<EditorV3Shell');
    const modeToolbarEnd = viewerAppSource.indexOf('>\n          {docLoading', modeToolbarStart);
    const block = viewerAppSource.slice(modeToolbarStart, modeToolbarEnd);
    expect(block).toContain('zoom={zoom}');
  });
});

// ---------------------------------------------------------------------------
// No regressions
// ---------------------------------------------------------------------------

describe('ModeToolbar — no regressions after zoom display', () => {
  it('onZoomIn and onZoomOut props still present', () => {
    expect(toolbarSource).toContain('onZoomIn');
    expect(toolbarSource).toContain('onZoomOut');
  });

  it('getWiredTools still contains Inzoomen and Uitzoomen', () => {
    expect(toolbarSource).toContain("'toolbar.zoomIn'");
    expect(toolbarSource).toContain("'toolbar.zoomOut'");
  });

  it('handleToolAction still dispatches zoom actions', () => {
    expect(toolbarSource).toContain("case 'toolbar.zoomIn'");
    expect(toolbarSource).toContain("case 'toolbar.zoomOut'");
  });

  it('onPageMutation prop still present', () => {
    expect(toolbarSource).toContain('onPageMutation');
  });
});

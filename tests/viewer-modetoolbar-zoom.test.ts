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

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

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
    expect(toolbarSource).toContain('tabular-nums');
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

describe('ViewerApp — passes zoom to ModeToolbar', () => {
  it('passes zoom={zoom} to ModeToolbar', () => {
    expect(viewerAppSource).toContain('zoom={zoom}');
  });

  it('zoom prop appears on the ModeToolbar element', () => {
    const modeToolbarStart = viewerAppSource.indexOf('<ModeToolbar');
    const modeToolbarEnd = viewerAppSource.indexOf('/>', modeToolbarStart);
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

  it('WIRED_TOOLS still contains Inzoomen and Uitzoomen', () => {
    expect(toolbarSource).toContain("'Inzoomen'");
    expect(toolbarSource).toContain("'Uitzoomen'");
  });

  it('handleToolAction still dispatches zoom actions', () => {
    expect(toolbarSource).toContain("case 'Inzoomen'");
    expect(toolbarSource).toContain("case 'Uitzoomen'");
  });

  it('onPageMutation prop still present', () => {
    expect(toolbarSource).toContain('onPageMutation');
  });
});

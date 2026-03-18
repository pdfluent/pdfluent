// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
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

// Locate the floating zoom control block for scoped assertions
const floatStart = viewerAppSource.indexOf('Floating zoom controls');
const floatEnd = viewerAppSource.indexOf('</div>\n          )}', floatStart);
const floatBlock = viewerAppSource.slice(floatStart, floatEnd);

// ---------------------------------------------------------------------------
// Reset button presence
// ---------------------------------------------------------------------------

describe('ViewerApp — zoom reset button: element type', () => {
  it('zoom percentage is rendered as a button (not a span)', () => {
    // Must have a button with the reset testid
    expect(floatBlock).toContain('data-testid="zoom-reset-btn"');
  });

  it('the reset element is a <button> tag', () => {
    const btnIdx = floatBlock.indexOf('zoom-reset-btn');
    // Walk back to find the opening tag
    const tagStart = floatBlock.lastIndexOf('<button', btnIdx);
    expect(tagStart).toBeGreaterThan(-1);
  });
});

// ---------------------------------------------------------------------------
// Reset action
// ---------------------------------------------------------------------------

describe('ViewerApp — zoom reset button: action', () => {
  it('toggles the zoom presets popover on click', () => {
    expect(floatBlock).toContain('setZoomPresetsOpen');
  });

  it('onClick toggles zoomPresetsOpen on the zoom-reset-btn', () => {
    const btnIdx = floatBlock.indexOf('zoom-reset-btn');
    const tagStart = floatBlock.lastIndexOf('<button', btnIdx);
    const tagEnd = floatBlock.indexOf('</button>', btnIdx);
    const btnElement = floatBlock.slice(tagStart, tagEnd);
    expect(btnElement).toContain('onClick');
    expect(btnElement).toContain('setZoomPresetsOpen(o => !o)');
  });
});

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

describe('ViewerApp — zoom reset button: display', () => {
  it('still renders Math.round(zoom * 100)% as the label', () => {
    expect(floatBlock).toContain('Math.round(zoom * 100)}%');
  });

  it('has a title attribute for discoverability', () => {
    expect(floatBlock).toContain('title="Zoomniveau kiezen"');
  });

  it('has an aria-label', () => {
    expect(floatBlock).toContain('aria-label="Zoomniveau kiezen"');
  });

  it('uses tabular-nums for stable width', () => {
    expect(floatBlock).toContain('tabular-nums');
  });
});

// ---------------------------------------------------------------------------
// Surrounding controls unchanged
// ---------------------------------------------------------------------------

describe('ViewerApp — zoom reset button: surrounding controls unchanged', () => {
  it('zoom-out (−) button is still present', () => {
    expect(floatBlock).toContain('Zoom out');
    expect(floatBlock).toContain('Math.max(0.25,');
  });

  it('zoom-in (+) button is still present', () => {
    expect(floatBlock).toContain('Zoom in');
    expect(floatBlock).toContain('Math.min(4,');
  });

  it('zoom-out is disabled at minimum zoom', () => {
    expect(floatBlock).toContain('zoom <= 0.25');
  });

  it('zoom-in is disabled at maximum zoom', () => {
    expect(floatBlock).toContain('zoom >= 4');
  });

  it('floating control is only shown when document is loaded', () => {
    expect(floatBlock).toContain('pdfDoc && !docLoading');
  });
});

// ---------------------------------------------------------------------------
// No regressions with keyboard zoom shortcuts
// ---------------------------------------------------------------------------

describe('ViewerApp — zoom reset button: keyboard shortcuts still present', () => {
  it('⌘= zoom in shortcut still present', () => {
    expect(viewerAppSource).toContain('handleZoomKey');
    expect(viewerAppSource).toContain("e.key === '='");
  });

  it('⌘0 reset shortcut still present', () => {
    expect(viewerAppSource).toContain("e.key === '0'");
  });
});

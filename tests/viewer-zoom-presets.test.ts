// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const popoverSource = readFileSync(
  new URL('../src/viewer/components/ZoomPresetsPopover.tsx', import.meta.url),
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

// Locate the floating zoom control block for scoped ViewerApp assertions
const floatStart = viewerAppSource.indexOf('Floating zoom controls');
const floatEnd   = viewerAppSource.indexOf('</div>\n          )}', floatStart);
const floatBlock = viewerAppSource.slice(floatStart, floatEnd);

// ---------------------------------------------------------------------------
// ZoomPresetsPopover — close behavior
// ---------------------------------------------------------------------------

describe('ZoomPresetsPopover — close behavior', () => {
  it('renders nothing when isOpen is false', () => {
    expect(popoverSource).toContain('if (!isOpen) return null');
  });

  it('closes on Escape key', () => {
    expect(popoverSource).toContain("e.key === 'Escape'");
    expect(popoverSource).toContain('onCloseRef.current()');
  });

  it('registers keydown listener only when open', () => {
    expect(popoverSource).toContain('if (!isOpen) return');
    expect(popoverSource).toContain("window.addEventListener('keydown', handleKey)");
    expect(popoverSource).toContain("window.removeEventListener('keydown', handleKey)");
  });

  it('useEffect for Escape depends on [isOpen]', () => {
    expect(popoverSource).toContain('}, [isOpen])');
  });

  it('closes on outside/backdrop click', () => {
    expect(popoverSource).toContain('onClick={onClose}');
    expect(popoverSource).toContain('aria-hidden="true"');
  });

  it('uses stable-ref pattern for onClose', () => {
    expect(popoverSource).toContain('onCloseRef');
    expect(popoverSource).toContain('useEffect(() => { onCloseRef.current = onClose; })');
  });
});

// ---------------------------------------------------------------------------
// ZoomPresetsPopover — preset list
// ---------------------------------------------------------------------------

describe('ZoomPresetsPopover — preset list', () => {
  it('exports ZOOM_PRESETS as a readonly array', () => {
    expect(popoverSource).toContain('ZOOM_PRESETS');
    expect(popoverSource).toContain('ReadonlyArray');
  });

  it('includes 50% preset', () => {
    expect(popoverSource).toContain("label: '50%'");
    expect(popoverSource).toContain('value: 0.5');
  });

  it('includes 75% preset', () => {
    expect(popoverSource).toContain("label: '75%'");
    expect(popoverSource).toContain('value: 0.75');
  });

  it('includes 100% preset', () => {
    expect(popoverSource).toContain("label: '100%'");
    expect(popoverSource).toContain('value: 1.0');
  });

  it('includes 125% preset', () => {
    expect(popoverSource).toContain("label: '125%'");
    expect(popoverSource).toContain('value: 1.25');
  });

  it('includes 150% preset', () => {
    expect(popoverSource).toContain("label: '150%'");
    expect(popoverSource).toContain('value: 1.5');
  });

  it('includes 200% preset', () => {
    expect(popoverSource).toContain("label: '200%'");
    expect(popoverSource).toContain('value: 2.0');
  });

  it('has exactly 6 preset entries', () => {
    // Slice just the array literal (from '[' to '];') to skip the type annotation
    const presetsStart = popoverSource.indexOf('export const ZOOM_PRESETS');
    const arrayStart   = popoverSource.indexOf('[', presetsStart);
    const presetsEnd   = popoverSource.indexOf('];', presetsStart) + 2;
    const presetsBody  = popoverSource.slice(arrayStart, presetsEnd);
    const matches = presetsBody.match(/label:/g) ?? [];
    expect(matches).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// ZoomPresetsPopover — selecting a preset
// ---------------------------------------------------------------------------

describe('ZoomPresetsPopover — preset selection', () => {
  it('each preset button calls onZoomChange with the preset value', () => {
    expect(popoverSource).toContain('onZoomChange(preset.value)');
  });

  it('selecting a preset also calls onClose', () => {
    expect(popoverSource).toContain('onZoomChange(preset.value); onClose()');
  });

  it('selection is handled by an onClick on the preset button', () => {
    expect(popoverSource).toContain('onClick={() => { onZoomChange(preset.value); onClose(); }}');
  });
});

// ---------------------------------------------------------------------------
// ZoomPresetsPopover — structure and accessibility
// ---------------------------------------------------------------------------

describe('ZoomPresetsPopover — structure', () => {
  it('renders with data-testid="zoom-presets-popover"', () => {
    expect(popoverSource).toContain('data-testid="zoom-presets-popover"');
  });

  it('renders preset buttons with data-testid="zoom-preset-option"', () => {
    expect(popoverSource).toContain('data-testid="zoom-preset-option"');
  });

  it('uses role="menu" on the popover container', () => {
    expect(popoverSource).toContain('role="menu"');
  });

  it('uses role="menuitem" on each preset button', () => {
    expect(popoverSource).toContain('role="menuitem"');
  });

  it('is positioned above the floating zoom control (bottom-20)', () => {
    expect(popoverSource).toContain('bottom-20');
  });

  it('uses z-50 so it renders above the backdrop', () => {
    expect(popoverSource).toContain('z-50');
  });

  it('backdrop uses z-40 (below popover, above page)', () => {
    expect(popoverSource).toContain('z-40');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — popover wiring
// ---------------------------------------------------------------------------

describe('ViewerApp — zoom presets: wiring', () => {
  it('imports ZoomPresetsPopover', () => {
    expect(viewerAppSource).toContain("import { ZoomPresetsPopover } from './components/ZoomPresetsPopover'");
  });

  it('tracks zoomPresetsOpen state', () => {
    expect(viewerAppSource).toContain('zoomPresetsOpen');
    expect(viewerAppSource).toContain('setZoomPresetsOpen');
  });

  it('zoom-reset-btn toggles zoomPresetsOpen on click', () => {
    expect(floatBlock).toContain('setZoomPresetsOpen(o => !o)');
  });

  it('mounts ZoomPresetsPopover with isOpen', () => {
    expect(viewerAppSource).toContain('<ZoomPresetsPopover');
    expect(viewerAppSource).toContain('isOpen={zoomPresetsOpen}');
  });

  it('onClose resets zoomPresetsOpen to false', () => {
    expect(viewerAppSource).toContain('onClose={() => { setZoomPresetsOpen(false); }}');
  });

  it('onZoomChange wires to setZoom', () => {
    expect(viewerAppSource).toContain('onZoomChange={(z) => { setZoom(z); }}');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — no regressions to existing zoom controls
// ---------------------------------------------------------------------------

describe('ViewerApp — zoom presets: no regressions', () => {
  it('zoom-out (−) button still present', () => {
    expect(floatBlock).toContain('Math.max(0.25,');
  });

  it('zoom-in (+) button still present', () => {
    expect(floatBlock).toContain('Math.min(4,');
  });

  it('zoom-reset-btn testid still present', () => {
    expect(floatBlock).toContain('data-testid="zoom-reset-btn"');
  });

  it('⌘= zoom-in shortcut still present', () => {
    expect(viewerAppSource).toContain('handleZoomKey');
    expect(viewerAppSource).toContain("e.key === '='");
  });

  it('⌘0 zoom-reset shortcut still calls setZoom(1.0)', () => {
    // The keyboard shortcut for ⌘0 still resets to 100%
    const zoomKeyStart = viewerAppSource.indexOf('handleZoomKey');
    const zoomKeyEnd   = viewerAppSource.indexOf('}, [pageCount])', zoomKeyStart) + 15;
    const zoomKeyBody  = viewerAppSource.slice(zoomKeyStart, zoomKeyEnd);
    expect(zoomKeyBody).toContain('setZoom(1.0)');
  });

  it('scroll-to-zoom still present', () => {
    expect(viewerAppSource).toContain('handleWheel');
    expect(viewerAppSource).toContain('{ passive: false }');
  });

  it('zoom percentage still shown as Math.round(zoom * 100)%', () => {
    expect(floatBlock).toContain('Math.round(zoom * 100)}%');
  });
});

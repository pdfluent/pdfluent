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
const floatEnd   = viewerAppSource.indexOf('</div>\n          )}', floatStart);
const floatBlock = viewerAppSource.slice(floatStart, floatEnd);

// ---------------------------------------------------------------------------
// Presence
// ---------------------------------------------------------------------------

describe('floating page indicator — presence', () => {
  it('renders a floating-page-indicator button inside the floating strip', () => {
    expect(floatBlock).toContain('data-testid="floating-page-indicator"');
  });

  it('the indicator element is a <button>', () => {
    const idx      = floatBlock.indexOf('floating-page-indicator');
    const tagStart = floatBlock.lastIndexOf('<button', idx);
    expect(tagStart).toBeGreaterThan(-1);
  });
});

// ---------------------------------------------------------------------------
// Display format
// ---------------------------------------------------------------------------

describe('floating page indicator — display', () => {
  it('shows the current page as pageIndex + 1', () => {
    expect(floatBlock).toContain('{pageIndex + 1}');
  });

  it('shows the total page count', () => {
    expect(floatBlock).toContain('{pageCount}');
  });

  it('uses "current / total" format', () => {
    expect(floatBlock).toContain('{pageIndex + 1} / {pageCount}');
  });

  it('uses tabular-nums for stable width', () => {
    const idx      = floatBlock.indexOf('floating-page-indicator');
    const btnStart = floatBlock.lastIndexOf('<button', idx);
    const btnEnd   = floatBlock.indexOf('</button>', idx);
    const btn      = floatBlock.slice(btnStart, btnEnd);
    expect(btn).toContain('tabular-nums');
  });
});

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

describe('floating page indicator — accessibility', () => {
  it('has title="Ga naar pagina"', () => {
    const idx      = floatBlock.indexOf('floating-page-indicator');
    const btnStart = floatBlock.lastIndexOf('<button', idx);
    const btnEnd   = floatBlock.indexOf('</button>', idx);
    const btn      = floatBlock.slice(btnStart, btnEnd);
    expect(btn).toContain('title="Ga naar pagina"');
  });

  it('has aria-label="Ga naar pagina"', () => {
    const idx      = floatBlock.indexOf('floating-page-indicator');
    const btnStart = floatBlock.lastIndexOf('<button', idx);
    const btnEnd   = floatBlock.indexOf('</button>', idx);
    const btn      = floatBlock.slice(btnStart, btnEnd);
    expect(btn).toContain('aria-label="Ga naar pagina"');
  });
});

// ---------------------------------------------------------------------------
// Click behavior
// ---------------------------------------------------------------------------

describe('floating page indicator — click behavior', () => {
  it('onClick calls setGoToPageOpen(true)', () => {
    const idx      = floatBlock.indexOf('floating-page-indicator');
    const btnStart = floatBlock.lastIndexOf('<button', idx);
    const btnEnd   = floatBlock.indexOf('</button>', idx);
    const btn      = floatBlock.slice(btnStart, btnEnd);
    expect(btn).toContain('setGoToPageOpen(true)');
  });

  it('onClick is the handler on the indicator button', () => {
    const idx      = floatBlock.indexOf('floating-page-indicator');
    const btnStart = floatBlock.lastIndexOf('<button', idx);
    const btnEnd   = floatBlock.indexOf('</button>', idx);
    const btn      = floatBlock.slice(btnStart, btnEnd);
    expect(btn).toContain('onClick');
    expect(btn).toContain('setGoToPageOpen(true)');
  });
});

// ---------------------------------------------------------------------------
// Separator between zoom controls and page indicator
// ---------------------------------------------------------------------------

describe('floating page indicator — separator', () => {
  it('has a thin vertical separator (w-px h-4 bg-border)', () => {
    expect(floatBlock).toContain('w-px h-4 bg-border');
  });

  it('separator carries aria-hidden="true"', () => {
    expect(floatBlock).toContain('aria-hidden="true"');
  });
});

// ---------------------------------------------------------------------------
// No regressions to zoom controls
// ---------------------------------------------------------------------------

describe('floating page indicator — zoom control regressions', () => {
  it('zoom-out (−) button still present', () => {
    expect(floatBlock).toContain('Math.max(0.25,');
  });

  it('zoom-in (+) button still present', () => {
    expect(floatBlock).toContain('Math.min(4,');
  });

  it('zoom-reset-btn (percentage) still present', () => {
    expect(floatBlock).toContain('data-testid="zoom-reset-btn"');
  });

  it('zoom presets popover toggle still on percentage button', () => {
    expect(floatBlock).toContain('setZoomPresetsOpen(o => !o)');
  });

  it('zoom percentage label still rendered', () => {
    expect(floatBlock).toContain('Math.round(zoom * 100)}%');
  });

  it('zoom-out disabled at minimum zoom', () => {
    expect(floatBlock).toContain('zoom <= 0.25');
  });

  it('zoom-in disabled at maximum zoom', () => {
    expect(floatBlock).toContain('zoom >= 4');
  });

  it('floating strip only shown when document is loaded', () => {
    expect(floatBlock).toContain('pdfDoc && !docLoading');
  });
});

// ---------------------------------------------------------------------------
// No regressions to GoToPageDialog wiring
// ---------------------------------------------------------------------------

describe('floating page indicator — GoToPageDialog wiring regressions', () => {
  it('GoToPageDialog is still mounted in ViewerApp', () => {
    expect(viewerAppSource).toContain('<GoToPageDialog');
  });

  it('goToPageOpen state still declared', () => {
    expect(viewerAppSource).toContain('goToPageOpen');
    expect(viewerAppSource).toContain('setGoToPageOpen');
  });

  it('GoToPageDialog onClose still resets state to false', () => {
    expect(viewerAppSource).toContain('onClose={() => { setGoToPageOpen(false); }}');
  });

  it('⌘G keyboard shortcut still opens the dialog', () => {
    expect(viewerAppSource).toContain('handleGoToPage');
    expect(viewerAppSource).toContain("e.key !== 'g'");
  });
});

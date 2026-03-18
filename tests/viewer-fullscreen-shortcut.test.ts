// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

// Locate the fullscreen shortcut effect for scoped assertions
const effectStart = viewerAppSource.indexOf('Fullscreen keyboard shortcut');
const effectEnd = viewerAppSource.indexOf('// Export dialog keyboard shortcut', effectStart);
const effectBody = viewerAppSource.slice(effectStart, effectEnd);

// ---------------------------------------------------------------------------
// Key mappings
// ---------------------------------------------------------------------------

describe('ViewerApp — fullscreen shortcut: key mappings', () => {
  it('handles the F11 key', () => {
    expect(effectBody).toContain("e.key === 'F11'");
  });

  it('handles ⌘Shift+F / Ctrl+Shift+F', () => {
    expect(effectBody).toContain('e.metaKey || e.ctrlKey');
    expect(effectBody).toContain('e.shiftKey');
    expect(effectBody).toContain("e.key === 'F'");
  });

  it('returns early when neither F11 nor ⌘Shift+F is pressed', () => {
    expect(effectBody).toContain('if (!isF11 && !isShiftF) return');
  });
});

// ---------------------------------------------------------------------------
// pageCount guard
// ---------------------------------------------------------------------------

describe('ViewerApp — fullscreen shortcut: no-document guard', () => {
  it('bails when pageCount is 0', () => {
    expect(effectBody).toContain('if (pageCount === 0) return');
  });
});

// ---------------------------------------------------------------------------
// preventDefault
// ---------------------------------------------------------------------------

describe('ViewerApp — fullscreen shortcut: preventDefault', () => {
  it('calls e.preventDefault()', () => {
    expect(effectBody).toContain('e.preventDefault()');
  });
});

// ---------------------------------------------------------------------------
// Toggle logic
// ---------------------------------------------------------------------------

describe('ViewerApp — fullscreen shortcut: toggle logic', () => {
  it('checks document.fullscreenElement to decide enter vs exit', () => {
    expect(effectBody).toContain('document.fullscreenElement');
  });

  it('calls exitFullscreen when already in fullscreen', () => {
    expect(effectBody).toContain('document.exitFullscreen()');
  });

  it('calls requestFullscreen to enter fullscreen', () => {
    expect(effectBody).toContain('document.documentElement.requestFullscreen()');
  });

  it('exit branch runs when fullscreenElement is set', () => {
    const guardIdx = effectBody.indexOf('if (document.fullscreenElement)');
    const exitIdx = effectBody.indexOf('document.exitFullscreen()', guardIdx);
    expect(guardIdx).toBeGreaterThan(-1);
    expect(exitIdx).toBeGreaterThan(guardIdx);
  });
});

// ---------------------------------------------------------------------------
// Listener lifecycle
// ---------------------------------------------------------------------------

describe('ViewerApp — fullscreen shortcut: listener lifecycle', () => {
  it('registers a keydown listener', () => {
    expect(effectBody).toContain("window.addEventListener('keydown', handleFullscreenKey)");
  });

  it('removes the listener on cleanup', () => {
    expect(effectBody).toContain("window.removeEventListener('keydown', handleFullscreenKey)");
  });

  it('useEffect depends on pageCount', () => {
    expect(effectBody).toContain('}, [pageCount])');
  });
});

// ---------------------------------------------------------------------------
// No regressions
// ---------------------------------------------------------------------------

describe('ViewerApp — fullscreen shortcut: no regressions', () => {
  it('toolbar fullscreen toggle still present in ModeToolbar', () => {
    const toolbarSource = readFileSync(
      new URL('../src/viewer/components/ModeToolbar.tsx', import.meta.url),
      'utf8'
    );
    expect(toolbarSource).toContain("case 'Volledig scherm'");
    expect(toolbarSource).toContain('document.documentElement.requestFullscreen()');
  });

  it('⌘E export shortcut still present', () => {
    expect(viewerAppSource).toContain('handleExportKey');
  });

  it('⌘K command palette shortcut still present', () => {
    expect(viewerAppSource).toContain('setCommandPaletteOpen');
  });

  it('zoom shortcuts still present', () => {
    expect(viewerAppSource).toContain('handleZoomKey');
  });
});

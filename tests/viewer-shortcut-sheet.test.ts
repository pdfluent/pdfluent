// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const sheetSource = readFileSync(
  new URL('../src/viewer/components/ShortcutSheet.tsx', import.meta.url),
  'utf8'
);

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// Helpers — collect all key labels and descriptions from SHORTCUT_GROUPS
// ---------------------------------------------------------------------------

// Pull out the SHORTCUT_GROUPS constant body for assertion
const groupsStart = sheetSource.indexOf('export const SHORTCUT_GROUPS');
const groupsEnd   = sheetSource.indexOf('];', groupsStart) + 2;
const groupsBody  = sheetSource.slice(groupsStart, groupsEnd);

// ---------------------------------------------------------------------------
// Trigger wiring (ViewerApp)
// ---------------------------------------------------------------------------

describe('ViewerApp — shortcut sheet: trigger wiring', () => {
  it('imports ShortcutSheet', () => {
    expect(viewerAppSource).toContain("import { ShortcutSheet } from './components/ShortcutSheet'");
  });

  it('tracks shortcutSheetOpen state', () => {
    expect(viewerAppSource).toContain('shortcutSheetOpen');
    expect(viewerAppSource).toContain('setShortcutSheetOpen');
  });

  it('registers a keydown listener for ⌘? / Ctrl+?', () => {
    expect(viewerAppSource).toContain('handleShortcutSheetKey');
    expect(viewerAppSource).toContain("e.key !== '?'");
    expect(viewerAppSource).toContain('e.metaKey || e.ctrlKey');
  });

  it('calls preventDefault on ⌘?', () => {
    const listenerStart = viewerAppSource.indexOf('handleShortcutSheetKey');
    const listenerEnd   = viewerAppSource.indexOf('}, []);', listenerStart) + 7;
    const listenerBody  = viewerAppSource.slice(listenerStart, listenerEnd);
    expect(listenerBody).toContain('e.preventDefault()');
  });

  it('toggles the sheet on ⌘?', () => {
    expect(viewerAppSource).toContain('setShortcutSheetOpen(o => !o)');
  });

  it('mounts ShortcutSheet with isOpen and onClose', () => {
    expect(viewerAppSource).toContain('<ShortcutSheet');
    expect(viewerAppSource).toContain('isOpen={shortcutSheetOpen}');
    expect(viewerAppSource).toContain('onClose={() => { setShortcutSheetOpen(false); }}');
  });

  it('the listener has empty dependency array (registered once)', () => {
    const listenerIdx = viewerAppSource.indexOf('handleShortcutSheetKey');
    const depsIdx = viewerAppSource.indexOf('}, []);', listenerIdx);
    expect(depsIdx).toBeGreaterThan(listenerIdx);
  });
});

// ---------------------------------------------------------------------------
// Close behavior (ShortcutSheet component)
// ---------------------------------------------------------------------------

describe('ShortcutSheet — close behavior', () => {
  it('renders nothing when isOpen is false', () => {
    expect(sheetSource).toContain('if (!isOpen) return null');
  });

  it('closes on Escape key', () => {
    expect(sheetSource).toContain("e.key === 'Escape'");
    expect(sheetSource).toContain('onCloseRef.current()');
  });

  it('registers keydown listener only when open', () => {
    expect(sheetSource).toContain('if (!isOpen) return');
    expect(sheetSource).toContain("window.addEventListener('keydown', handleKey)");
    expect(sheetSource).toContain("window.removeEventListener('keydown', handleKey)");
  });

  it('closes on backdrop click', () => {
    expect(sheetSource).toContain('onClick={onClose}');
    expect(sheetSource).toContain('aria-hidden="true"');
  });

  it('renders a close button with data-testid="shortcut-sheet-close"', () => {
    expect(sheetSource).toContain('data-testid="shortcut-sheet-close"');
  });

  it('uses the stable-ref pattern for onClose', () => {
    expect(sheetSource).toContain('onCloseRef');
    expect(sheetSource).toContain('useEffect(() => { onCloseRef.current = onClose; })');
  });

  it('useEffect for Escape depends on [isOpen]', () => {
    expect(sheetSource).toContain('}, [isOpen])');
  });
});

// ---------------------------------------------------------------------------
// Visible shortcut entries — only implemented shortcuts
// ---------------------------------------------------------------------------

describe('ShortcutSheet — implemented shortcuts present', () => {
  it('lists ⌘K / Ctrl+K → command palette', () => {
    expect(groupsBody).toContain('⌘K / Ctrl+K');
    expect(groupsBody).toContain('Opdrachtenpalette');
  });

  it('lists ⌘S / Ctrl+S → save', () => {
    expect(groupsBody).toContain('⌘S / Ctrl+S');
    expect(groupsBody).toContain('Opslaan');
  });

  it('lists ⌘E / Ctrl+E → export', () => {
    expect(groupsBody).toContain('⌘E / Ctrl+E');
    expect(groupsBody).toContain('Exporteren');
  });

  it('lists ⌘G / Ctrl+G → go to page', () => {
    expect(groupsBody).toContain('⌘G / Ctrl+G');
    expect(groupsBody).toContain('Ga naar pagina');
  });

  it('lists ⌘= / Ctrl+= → zoom in', () => {
    expect(groupsBody).toContain('⌘= / Ctrl+=');
    expect(groupsBody).toContain('Inzoomen');
  });

  it('lists ⌘- / Ctrl+- → zoom out', () => {
    expect(groupsBody).toContain('⌘− / Ctrl+−');
    expect(groupsBody).toContain('Uitzoomen');
  });

  it('lists ⌘0 / Ctrl+0 → zoom reset', () => {
    expect(groupsBody).toContain('⌘0 / Ctrl+0');
    expect(groupsBody).toContain('Zoom 100%');
  });

  it('lists scroll-to-zoom', () => {
    expect(groupsBody).toContain('⌘/Ctrl + Scroll');
    expect(groupsBody).toContain('Zoom aanpassen');
  });

  it('lists arrow / page keys for navigation', () => {
    expect(groupsBody).toContain('← / →');
    expect(groupsBody).toContain('PageUp / PageDown');
    expect(groupsBody).toContain('Home / End');
  });

  it('lists F11 / ⌘⇧F → fullscreen', () => {
    expect(groupsBody).toContain('F11 / ⌘⇧F');
    expect(groupsBody).toContain('Volledig scherm aan/uit');
  });

  it('lists 1–7 → mode switching', () => {
    expect(groupsBody).toContain('1 – 7');
    expect(groupsBody).toContain('Modus wisselen');
  });

  it('lists Escape → close dialog', () => {
    expect(groupsBody).toContain('Escape');
    expect(groupsBody).toContain('Dialoog sluiten');
  });

  it('lists ⌘? / Ctrl+? → this sheet', () => {
    expect(groupsBody).toContain('⌘? / Ctrl+?');
    expect(groupsBody).toContain('Dit overzicht');
  });
});

describe('ShortcutSheet — unimplemented shortcuts absent', () => {
  it('does not list undo (⌘Z) — not yet implemented', () => {
    expect(groupsBody).not.toContain('⌘Z');
  });

  it('does not list redo (⌘⇧Z) — not yet implemented', () => {
    expect(groupsBody).not.toContain('⌘⇧Z');
  });

  it('does not list search-in-document (⌘F) — not yet implemented', () => {
    expect(groupsBody).not.toContain('⌘F');
  });
});

// ---------------------------------------------------------------------------
// Sheet structure
// ---------------------------------------------------------------------------

describe('ShortcutSheet — structure', () => {
  it('renders with data-testid="shortcut-sheet"', () => {
    expect(sheetSource).toContain('data-testid="shortcut-sheet"');
  });

  it('renders rows with data-testid="shortcut-row"', () => {
    expect(sheetSource).toContain('data-testid="shortcut-row"');
  });

  it('uses role="dialog" for accessibility', () => {
    expect(sheetSource).toContain('role="dialog"');
  });

  it('has a labelled heading for accessibility', () => {
    expect(sheetSource).toContain('aria-labelledby="shortcut-sheet-title"');
    expect(sheetSource).toContain('id="shortcut-sheet-title"');
  });

  it('renders shortcut keys in <kbd> elements', () => {
    expect(sheetSource).toContain('<kbd');
  });
});

// ---------------------------------------------------------------------------
// No regressions to existing keyboard handlers
// ---------------------------------------------------------------------------

describe('ViewerApp — shortcut sheet: no regressions', () => {
  it('fullscreen shortcut still present', () => {
    expect(viewerAppSource).toContain('handleFullscreenKey');
  });

  it('export shortcut still present', () => {
    expect(viewerAppSource).toContain('handleExportKey');
  });

  it('command palette shortcut still present', () => {
    expect(viewerAppSource).toContain('setCommandPaletteOpen');
  });

  it('arrow page nav still present', () => {
    expect(viewerAppSource).toContain('handlePageNav');
  });

  it('unsaved-changes guard still present', () => {
    expect(viewerAppSource).toContain('handleBeforeUnload');
  });
});

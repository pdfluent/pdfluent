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

// Slice just the commands array body for scoped assertions
const commandsStart = viewerAppSource.indexOf('const commands: Command[] = [');
const commandsEnd   = viewerAppSource.indexOf('];', commandsStart) + 2;
const commandsBody  = viewerAppSource.slice(commandsStart, commandsEnd);

// ---------------------------------------------------------------------------
// Navigation commands — first / last page (new)
// ---------------------------------------------------------------------------

describe('CommandPalette — navigation commands', () => {
  it('includes prev-page command', () => {
    expect(commandsBody).toContain("id: 'prev-page'");
    expect(commandsBody).toContain("label: t('commands.prevPage')");
  });

  it('includes next-page command', () => {
    expect(commandsBody).toContain("id: 'next-page'");
    expect(commandsBody).toContain("label: t('commands.nextPage')");
  });

  it('includes first-page command', () => {
    expect(commandsBody).toContain("id: 'first-page'");
    expect(commandsBody).toContain("label: t('commands.firstPage')");
  });

  it('first-page sets pageIndex to 0', () => {
    expect(commandsBody).toContain("setPageIndex(0)");
  });

  it('includes last-page command', () => {
    expect(commandsBody).toContain("id: 'last-page'");
    expect(commandsBody).toContain("label: t('commands.lastPage')");
  });

  it('last-page sets pageIndex to pageCount - 1', () => {
    expect(commandsBody).toContain('setPageIndex(pageCount - 1)');
  });

  it('first-page keywords include home', () => {
    expect(commandsBody).toContain("'home'");
  });

  it('last-page keywords include end', () => {
    expect(commandsBody).toContain("'end'");
  });
});

// ---------------------------------------------------------------------------
// Document action commands (new)
// ---------------------------------------------------------------------------

describe('CommandPalette — document action commands', () => {
  it('includes export command', () => {
    expect(commandsBody).toContain("id: 'export'");
    expect(commandsBody).toContain("label: t('commands.export')");
  });

  it('export action opens the export dialog', () => {
    expect(commandsBody).toContain('setExportOpen(true)');
  });

  it('includes fullscreen command', () => {
    expect(commandsBody).toContain("id: 'fullscreen'");
    expect(commandsBody).toContain("label: t('commands.fullscreen')");
  });

  it('fullscreen command has pageCount === 0 guard', () => {
    expect(commandsBody).toContain('if (pageCount === 0) return;');
  });

  it('fullscreen command toggles fullscreen element', () => {
    expect(commandsBody).toContain('document.fullscreenElement');
    expect(commandsBody).toContain('document.exitFullscreen()');
    expect(commandsBody).toContain('document.documentElement.requestFullscreen()');
  });

  it('includes shortcut-sheet command', () => {
    expect(commandsBody).toContain("id: 'shortcut-sheet'");
    expect(commandsBody).toContain("label: t('commands.shortcuts')");
  });

  it('shortcut-sheet action opens the shortcut sheet', () => {
    expect(commandsBody).toContain('setShortcutSheetOpen(true)');
  });

  it('includes close-document command', () => {
    expect(commandsBody).toContain("id: 'close-document'");
    expect(commandsBody).toContain("label: t('commands.closeDocument')");
  });

  it('close-document has isDirty dialog guard', () => {
    expect(commandsBody).toContain('if (isDirty)');
    expect(commandsBody).toContain('setUnsavedDialogOpen(true)');
  });

  it('close-document calls closeDocument and clears path on confirm', () => {
    expect(commandsBody).toContain('closeDocument()');
    expect(commandsBody).toContain('setCurrentFilePath(null)');
  });
});

// ---------------------------------------------------------------------------
// Recent files — dynamic commands
// ---------------------------------------------------------------------------

describe('CommandPalette — recent files commands', () => {
  it('maps recentFiles to commands with id recent-${i}', () => {
    expect(commandsBody).toContain('recentFiles.map((path, i)');
    expect(commandsBody).toContain('`recent-${i}`');
  });

  it('recent file label is Open: <filename>', () => {
    expect(commandsBody).toContain("t('commands.openRecent', { name })");
  });

  it('recent file extracts filename from path', () => {
    expect(commandsBody).toContain("path.split(/[/\\\\]/).pop()");
  });

  it('recent file keywords include "recent" and "open"', () => {
    expect(commandsBody).toContain("'recent'");
    expect(commandsBody).toContain("'open'");
  });

  it('recent file action calls handleLoadDocument with path', () => {
    expect(commandsBody).toContain('handleLoadDocument(path)');
  });
});

// ---------------------------------------------------------------------------
// Zoom commands — no regressions
// ---------------------------------------------------------------------------

describe('CommandPalette — zoom commands (no regressions)', () => {
  it('zoom-in still present', () => {
    expect(commandsBody).toContain("id: 'zoom-in'");
    expect(commandsBody).toContain("label: t('commands.zoomIn')");
  });

  it('zoom-out still present', () => {
    expect(commandsBody).toContain("id: 'zoom-out'");
    expect(commandsBody).toContain("label: t('commands.zoomOut')");
  });

  it('zoom-100 still present', () => {
    expect(commandsBody).toContain("id: 'zoom-100'");
    expect(commandsBody).toContain("label: t('commands.zoom100')");
  });

  it('zoom-200 still present', () => {
    expect(commandsBody).toContain("id: 'zoom-200'");
    expect(commandsBody).toContain("label: t('commands.zoom200')");
  });
});

// ---------------------------------------------------------------------------
// Mode commands — no regressions
// ---------------------------------------------------------------------------

describe('CommandPalette — mode commands (no regressions)', () => {
  it('mode-read still present', () => {
    expect(commandsBody).toContain("id: 'mode-read'");
    expect(commandsBody).toContain("label: t('commands.modeRead')");
  });

  it('mode-review still present', () => {
    expect(commandsBody).toContain("id: 'mode-review'");
  });

  it('mode-edit still present', () => {
    expect(commandsBody).toContain("id: 'mode-edit'");
  });

  it('mode-organize still present', () => {
    expect(commandsBody).toContain("id: 'mode-organize'");
  });

  it('mode-forms still present', () => {
    expect(commandsBody).toContain("id: 'mode-forms'");
  });

  it('mode-protect still present', () => {
    expect(commandsBody).toContain("id: 'mode-protect'");
  });

  it('mode-convert still present', () => {
    expect(commandsBody).toContain("id: 'mode-convert'");
  });
});

// ---------------------------------------------------------------------------
// Section ordering — navigation before zoom, zoom before document actions,
// document actions before modes, modes before recent files
// ---------------------------------------------------------------------------

describe('CommandPalette — section ordering', () => {
  it('first-page appears before zoom-in', () => {
    expect(commandsBody.indexOf("'first-page'")).toBeLessThan(commandsBody.indexOf("'zoom-in'"));
  });

  it('zoom-in appears before export', () => {
    expect(commandsBody.indexOf("'zoom-in'")).toBeLessThan(commandsBody.indexOf("'export'"));
  });

  it('export appears before mode-read', () => {
    expect(commandsBody.indexOf("'export'")).toBeLessThan(commandsBody.indexOf("'mode-read'"));
  });

  it('mode-read appears before recentFiles.map', () => {
    expect(commandsBody.indexOf("'mode-read'")).toBeLessThan(commandsBody.indexOf('recentFiles.map'));
  });
});

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

const topBarSource = readFileSync(
  new URL('../src/viewer/components/TopBar.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// Locate handleSaveAs body in ViewerApp for scoped assertions
// ---------------------------------------------------------------------------

const saveAsFnStart = viewerAppSource.indexOf('handleSaveAs = useCallback');
const saveAsFnEnd   = viewerAppSource.indexOf('}, [pageCount, clearDirty, addRecentFile]);', saveAsFnStart) + 42;
const saveAsFnBody  = viewerAppSource.slice(saveAsFnStart, saveAsFnEnd);

// Locate the ⌘⇧S effect
const saveAsKeyStart = viewerAppSource.indexOf('handleSaveAsKey');
const saveAsKeyEnd   = viewerAppSource.indexOf('}, [pageCount, handleSaveAs]);', saveAsKeyStart) + 28;
const saveAsKeyBody  = viewerAppSource.slice(saveAsKeyStart, saveAsKeyEnd);

// Locate the command palette entry
const commandsStart = viewerAppSource.indexOf('const commands: Command[] = [');
const commandsEnd   = viewerAppSource.indexOf('];', commandsStart) + 2;
const commandsBody  = viewerAppSource.slice(commandsStart, commandsEnd);

// ---------------------------------------------------------------------------
// ViewerApp — handleSaveAs
// ---------------------------------------------------------------------------

describe('ViewerApp — save-as: handleSaveAs', () => {
  it('defines handleSaveAs with useCallback', () => {
    expect(viewerAppSource).toContain('handleSaveAs = useCallback');
  });

  it('guards on isTauri and pageCount', () => {
    expect(saveAsFnBody).toContain('if (!isTauri || pageCount === 0) return');
  });

  it('opens the Tauri save dialog', () => {
    expect(saveAsFnBody).toContain("import('@tauri-apps/plugin-dialog')");
    expect(saveAsFnBody).toContain('await save(');
    expect(saveAsFnBody).toContain("extensions: ['pdf']");
  });

  it('returns early when user cancels the dialog (path is null/empty)', () => {
    expect(saveAsFnBody).toContain('if (!path) return');
  });

  it('invokes save_pdf with the chosen path', () => {
    expect(saveAsFnBody).toContain("invoke('save_pdf', { path })");
  });

  it('updates currentFilePath to the new path after success', () => {
    expect(saveAsFnBody).toContain('setCurrentFilePath(path)');
  });

  it('calls clearDirty after successful save', () => {
    expect(saveAsFnBody).toContain('clearDirty()');
  });

  it('adds the new path to recent files', () => {
    expect(saveAsFnBody).toContain('addRecentFile(path)');
  });

  it('depends on [pageCount, clearDirty, addRecentFile]', () => {
    expect(saveAsFnBody).toContain('[pageCount, clearDirty, addRecentFile]');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — ⌘⇧S keyboard shortcut
// ---------------------------------------------------------------------------

describe('ViewerApp — save-as: keyboard shortcut', () => {
  it('defines handleSaveAsKey effect', () => {
    expect(viewerAppSource).toContain('handleSaveAsKey');
  });

  it('requires metaKey or ctrlKey AND shiftKey', () => {
    expect(saveAsKeyBody).toContain('e.metaKey || e.ctrlKey');
    expect(saveAsKeyBody).toContain('e.shiftKey');
  });

  it('triggers on key S (capital, as shiftKey is held)', () => {
    expect(saveAsKeyBody).toContain("e.key !== 'S'");
  });

  it('bails when pageCount is 0', () => {
    expect(saveAsKeyBody).toContain('if (pageCount === 0) return');
  });

  it('calls void handleSaveAs()', () => {
    expect(saveAsKeyBody).toContain('void handleSaveAs()');
  });

  it('registers and unregisters the listener', () => {
    expect(saveAsKeyBody).toContain("window.addEventListener('keydown', handleSaveAsKey)");
    expect(saveAsKeyBody).toContain("window.removeEventListener('keydown', handleSaveAsKey)");
  });

  it('depends on [pageCount, handleSaveAs]', () => {
    expect(saveAsKeyBody).toContain('[pageCount, handleSaveAs]');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — command palette entry
// ---------------------------------------------------------------------------

describe('ViewerApp — save-as: command palette', () => {
  it('includes save-as command', () => {
    expect(commandsBody).toContain("id: 'save-as'");
    expect(commandsBody).toContain("label: t('commands.saveAs')");
  });

  it('save-as command action calls handleSaveAs', () => {
    expect(commandsBody).toContain('void handleSaveAs()');
  });

  it('save-as command has relevant keywords', () => {
    const saveAsIdx = commandsBody.indexOf("id: 'save-as'");
    const saveAsEntry = commandsBody.slice(saveAsIdx, commandsBody.indexOf('},', saveAsIdx) + 2);
    expect(saveAsEntry).toContain("'save'");
    expect(saveAsEntry).toContain("'as'");
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — TopBar wiring
// ---------------------------------------------------------------------------

describe('ViewerApp — save-as: TopBar wiring', () => {
  it('passes onSaveAs={handleSaveAs} to TopBar', () => {
    const topBarBlock = viewerAppSource.slice(
      viewerAppSource.indexOf('<TopBar'),
      viewerAppSource.indexOf('/>', viewerAppSource.indexOf('<TopBar')) + 2
    );
    expect(topBarBlock).toContain('onSaveAs={handleSaveAs}');
  });
});

// ---------------------------------------------------------------------------
// TopBar — save-as button
// ---------------------------------------------------------------------------

describe('TopBar — save-as: button', () => {
  it('declares onSaveAs prop', () => {
    expect(topBarSource).toContain('onSaveAs: () => Promise<void>');
  });

  it('renders save-as-btn testid', () => {
    expect(topBarSource).toContain('data-testid="save-as-btn"');
  });

  it('button onClick calls void onSaveAs()', () => {
    const btnIdx   = topBarSource.indexOf('save-as-btn');
    const btnStart = topBarSource.lastIndexOf('<button', btnIdx);
    const btnEnd   = topBarSource.indexOf('</button>', btnIdx) + 9;
    const btn      = topBarSource.slice(btnStart, btnEnd);
    expect(btn).toContain('void onSaveAs()');
  });

  it('button is disabled when no document is open (pageCount === 0)', () => {
    const btnIdx   = topBarSource.indexOf('save-as-btn');
    const btnStart = topBarSource.lastIndexOf('<button', btnIdx);
    const btnEnd   = topBarSource.indexOf('</button>', btnIdx) + 9;
    const btn      = topBarSource.slice(btnStart, btnEnd);
    expect(btn).toContain('pageCount === 0');
  });

  it('button is disabled outside Tauri (browser mode)', () => {
    const btnIdx   = topBarSource.indexOf('save-as-btn');
    const btnStart = topBarSource.lastIndexOf('<button', btnIdx);
    const btnEnd   = topBarSource.indexOf('</button>', btnIdx) + 9;
    const btn      = topBarSource.slice(btnStart, btnEnd);
    expect(btn).toContain('!isTauri');
  });

  it('button shows "Opslaan als…" label', () => {
    expect(topBarSource).toContain("t('common.saveAs'");
  });

  it('button title mentions ⌘⇧S shortcut', () => {
    const btnIdx   = topBarSource.indexOf('save-as-btn');
    const btnStart = topBarSource.lastIndexOf('<button', btnIdx);
    const btnEnd   = topBarSource.indexOf('</button>', btnIdx) + 9;
    const btn      = topBarSource.slice(btnStart, btnEnd);
    expect(btn).toContain("t('topbar.saveAsTooltip'");
  });
});

// ---------------------------------------------------------------------------
// No regressions
// ---------------------------------------------------------------------------

describe('ViewerApp — save-as: no regressions', () => {
  it('existing save (⌘S) handler still present in TopBar', () => {
    expect(topBarSource).toContain('handleSave');
    expect(topBarSource).toContain("e.key === 's'");
  });

  it('Opslaan button still present in TopBar', () => {
    expect(topBarSource).toContain("t('common.save'");
    expect(topBarSource).toContain('canSave');
  });

  it('handleBeforeUnload unsaved guard still in ViewerApp', () => {
    expect(viewerAppSource).toContain('handleBeforeUnload');
  });

  it('UnsavedChangesDialog still mounted', () => {
    expect(viewerAppSource).toContain('<UnsavedChangesDialog');
  });

  it('command palette still has save-as after export', () => {
    const saveAsIdx = commandsBody.indexOf("'save-as'");
    const exportIdx = commandsBody.indexOf("'export'");
    expect(saveAsIdx).toBeGreaterThan(-1);
    expect(exportIdx).toBeGreaterThan(-1);
    // save-as appears before export in the palette
    expect(saveAsIdx).toBeLessThan(exportIdx);
  });
});

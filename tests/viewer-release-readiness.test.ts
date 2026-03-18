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

const settingsSource = readFileSync(
  new URL('../src/viewer/state/appSettings.ts', import.meta.url),
  'utf8'
);

const autosaveSource = readFileSync(
  new URL('../src/viewer/state/autosaveManager.ts', import.meta.url),
  'utf8'
);

const errorSource = readFileSync(
  new URL('../src/viewer/state/errorCenter.ts', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// Keyboard shortcut consistency
// ---------------------------------------------------------------------------

describe('Release Readiness — keyboard shortcut completeness', () => {
  it('⌘K / Ctrl+K opens command palette', () => {
    expect(viewerAppSource).toContain("e.key === 'k'");
    expect(viewerAppSource).toContain('commandPaletteOpen');
  });

  it('⌘F / Ctrl+F opens search panel', () => {
    expect(viewerAppSource).toContain("e.key !== 'f'");
    expect(viewerAppSource).toContain('setIsSearchOpen');
  });

  it('⌘B / Ctrl+B toggles left rail', () => {
    expect(viewerAppSource).toContain("e.key !== 'b'");
    expect(viewerAppSource).toContain('setLeftRailOpen');
  });

  it('⌘G / Ctrl+G opens go-to-page dialog', () => {
    expect(viewerAppSource).toContain("e.key !== 'g'");
    expect(viewerAppSource).toContain('setGoToPageOpen');
  });

  it('⌘E / Ctrl+E opens export dialog', () => {
    expect(viewerAppSource).toContain("e.key !== 'e'");
    expect(viewerAppSource).toContain('setExportOpen');
  });

  it('⌘⇧S / Ctrl+Shift+S triggers save-as', () => {
    expect(viewerAppSource).toContain("e.key !== 'S'");
    expect(viewerAppSource).toContain('handleSaveAs');
  });

  it('⌘? / Ctrl+? opens shortcut sheet', () => {
    expect(viewerAppSource).toContain("e.key !== '?'");
    expect(viewerAppSource).toContain('setShortcutSheetOpen');
  });

  it('⌘P / Ctrl+P triggers print', () => {
    expect(viewerAppSource).toContain("e.key !== 'p'");
    expect(viewerAppSource).toContain('window.print()');
  });

  it('F11 / ⌘⇧F triggers fullscreen', () => {
    expect(viewerAppSource).toContain("e.key === 'F11'");
    expect(viewerAppSource).toContain('requestFullscreen');
  });

  it('keyboard shortcuts guard against text input focus', () => {
    // All major shortcuts check for INPUT/TEXTAREA/SELECT to avoid interfering with typing
    const tagGuardCount = (viewerAppSource.match(/tag === 'INPUT'/g) ?? []).length;
    expect(tagGuardCount).toBeGreaterThanOrEqual(2);
  });

  it('page nav shortcuts guard isSavingRef to prevent navigation during save', () => {
    expect(viewerAppSource).toContain('isSavingRef.current');
  });
});

// ---------------------------------------------------------------------------
// Mode switching
// ---------------------------------------------------------------------------

describe('Release Readiness — mode switching completeness', () => {
  it('keys 1-7 map to all 7 viewer modes', () => {
    const modeKeysIdx = viewerAppSource.indexOf('MODE_KEYS');
    const block = viewerAppSource.slice(modeKeysIdx, modeKeysIdx + 400);
    expect(block).toContain("'1'");
    expect(block).toContain("'7'");
  });

  it('all 7 viewer modes are present in the MODE_KEYS map', () => {
    const modeKeysIdx = viewerAppSource.indexOf('MODE_KEYS');
    const block = viewerAppSource.slice(modeKeysIdx, modeKeysIdx + 400);
    expect(block).toContain("'read'");
    expect(block).toContain("'review'");
    expect(block).toContain("'edit'");
    expect(block).toContain("'organize'");
    expect(block).toContain("'forms'");
    expect(block).toContain("'protect'");
    expect(block).toContain("'convert'");
  });
});

// ---------------------------------------------------------------------------
// Command palette grouping
// ---------------------------------------------------------------------------

describe('Release Readiness — command palette groups', () => {
  it('page navigation commands are present (prev-page, next-page, first-page, last-page)', () => {
    expect(viewerAppSource).toContain("id: 'prev-page'");
    expect(viewerAppSource).toContain("id: 'next-page'");
    expect(viewerAppSource).toContain("id: 'first-page'");
    expect(viewerAppSource).toContain("id: 'last-page'");
  });

  it('zoom commands are present (zoom-in, zoom-out, zoom-100)', () => {
    expect(viewerAppSource).toContain("id: 'zoom-in'");
    expect(viewerAppSource).toContain("id: 'zoom-out'");
    expect(viewerAppSource).toContain("id: 'zoom-100'");
  });

  it('document action commands are present (save-as, export, close-document)', () => {
    expect(viewerAppSource).toContain("id: 'save-as'");
    expect(viewerAppSource).toContain("id: 'export'");
    expect(viewerAppSource).toContain("id: 'close-document'");
  });

  it('viewer mode commands are present (mode-read through mode-protect)', () => {
    expect(viewerAppSource).toContain("id: 'mode-read'");
    expect(viewerAppSource).toContain("id: 'mode-review'");
    expect(viewerAppSource).toContain("id: 'mode-edit'");
    expect(viewerAppSource).toContain("id: 'mode-organize'");
    expect(viewerAppSource).toContain("id: 'mode-forms'");
    expect(viewerAppSource).toContain("id: 'mode-protect'");
  });
});

// ---------------------------------------------------------------------------
// Settings system is complete and coherent
// ---------------------------------------------------------------------------

describe('Release Readiness — settings system completeness', () => {
  it('all five settings fields are declared', () => {
    expect(settingsSource).toContain('defaultReviewerName');
    expect(settingsSource).toContain('defaultExportFormat');
    expect(settingsSource).toContain('autosaveEnabled');
    expect(settingsSource).toContain('themePreference');
    expect(settingsSource).toContain('ocrDefaultLanguage');
  });

  it('SETTINGS_STORAGE_KEY is used consistently by load/save', () => {
    const loadCount = (settingsSource.match(/SETTINGS_STORAGE_KEY/g) ?? []).length;
    expect(loadCount).toBeGreaterThanOrEqual(3); // export + getItem + setItem
  });

  it('resetAppSettings restores all defaults', () => {
    const fnStart = settingsSource.indexOf('export function resetAppSettings');
    const body = settingsSource.slice(fnStart, fnStart + 200);
    expect(body).toContain('DEFAULT_APP_SETTINGS');
    expect(body).toContain('saveAppSettings(');
  });
});

// ---------------------------------------------------------------------------
// Autosave system is safe by design
// ---------------------------------------------------------------------------

describe('Release Readiness — autosave safety', () => {
  it('makeRecoveryPath never overwrites the original file', () => {
    const fnStart = autosaveSource.indexOf('export function makeRecoveryPath');
    const fnEnd = autosaveSource.indexOf('\nexport function ', fnStart + 1);
    const body = autosaveSource.slice(fnStart, fnEnd);
    expect(body).toContain('.autosave.pdf');
    // Must not return the original path unchanged
    expect(body).not.toContain('return originalPath');
  });

  it('shouldTriggerAutosave requires BOTH enabled AND isDirty', () => {
    const fnStart = autosaveSource.indexOf('export function shouldTriggerAutosave');
    const fnEnd = autosaveSource.indexOf('\nexport function ', fnStart + 1);
    const body = autosaveSource.slice(fnStart, fnEnd);
    expect(body).toContain('!config.enabled');
    expect(body).toContain('!isDirty');
  });
});

// ---------------------------------------------------------------------------
// Error center covers all critical failure sources
// ---------------------------------------------------------------------------

describe('Release Readiness — error center coverage', () => {
  it('OCR failure factory exists', () => {
    expect(errorSource).toContain('makeOcrError');
  });

  it('export failure factory exists', () => {
    expect(errorSource).toContain('makeExportError');
  });

  it('redaction failure factory exists', () => {
    expect(errorSource).toContain('makeRedactionError');
  });

  it('document load failure factory exists', () => {
    expect(errorSource).toContain('makeDocumentLoadError');
  });

  it('clearAllErrors resets the error list', () => {
    const fnStart = errorSource.indexOf('export function clearAllErrors');
    const body = errorSource.slice(fnStart, fnStart + 100);
    expect(body).toContain('return []');
  });
});

// ---------------------------------------------------------------------------
// Document title reflects dirty state
// ---------------------------------------------------------------------------

describe('Release Readiness — document title reflects state', () => {
  it('window title prefixes with * when document is dirty', () => {
    expect(viewerAppSource).toContain('`${isDirty ? \'* \' : \'\'}${fileName} — PDFluent`');
  });
});

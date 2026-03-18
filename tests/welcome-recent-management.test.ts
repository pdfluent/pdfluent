// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const hookSource = readFileSync(
  new URL('../src/viewer/hooks/useRecentFiles.ts', import.meta.url),
  'utf8'
);

const welcomeSource = readFileSync(
  new URL('../src/viewer/components/WelcomeScreen.tsx', import.meta.url),
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

// ---------------------------------------------------------------------------
// useRecentFiles — removeRecentFile
// ---------------------------------------------------------------------------

describe('useRecentFiles — removeRecentFile', () => {
  it('removeRecentFile is declared in UseRecentFilesResult', () => {
    const ifaceStart = hookSource.indexOf('interface UseRecentFilesResult');
    const ifaceEnd = hookSource.indexOf('\n}', ifaceStart) + 2;
    const iface = hookSource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('removeRecentFile: (path: string) => void');
  });

  it('removeRecentFile is defined as a useCallback', () => {
    expect(hookSource).toContain('const removeRecentFile = useCallback(');
  });

  it('removeRecentFile filters out the given path', () => {
    const fnStart = hookSource.indexOf('const removeRecentFile = useCallback(');
    const fnEnd = hookSource.indexOf('}, [])', fnStart) + 6;
    const fnBody = hookSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('prev.filter(p => p !== path)');
  });

  it('removeRecentFile persists the updated list to localStorage', () => {
    const fnStart = hookSource.indexOf('const removeRecentFile = useCallback(');
    const fnEnd = hookSource.indexOf('}, [])', fnStart) + 6;
    const fnBody = hookSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('localStorage.setItem(RECENT_FILES_KEY');
  });

  it('removeRecentFile is returned from useRecentFiles', () => {
    expect(hookSource).toContain('return { recentFiles, addRecentFile, removeRecentFile, clearRecentFiles }');
  });
});

// ---------------------------------------------------------------------------
// useRecentFiles — clearRecentFiles
// ---------------------------------------------------------------------------

describe('useRecentFiles — clearRecentFiles', () => {
  it('clearRecentFiles is declared in UseRecentFilesResult', () => {
    const ifaceStart = hookSource.indexOf('interface UseRecentFilesResult');
    const ifaceEnd = hookSource.indexOf('\n}', ifaceStart) + 2;
    const iface = hookSource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('clearRecentFiles: () => void');
  });

  it('clearRecentFiles is defined as a useCallback', () => {
    expect(hookSource).toContain('const clearRecentFiles = useCallback(');
  });

  it('clearRecentFiles sets state to empty array', () => {
    const fnStart = hookSource.indexOf('const clearRecentFiles = useCallback(');
    const fnEnd = hookSource.indexOf('}, [])', fnStart) + 6;
    const fnBody = hookSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('setRecentFiles([])');
  });

  it('clearRecentFiles removes the key from localStorage', () => {
    const fnStart = hookSource.indexOf('const clearRecentFiles = useCallback(');
    const fnEnd = hookSource.indexOf('}, [])', fnStart) + 6;
    const fnBody = hookSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('localStorage.removeItem(RECENT_FILES_KEY)');
  });
});

// ---------------------------------------------------------------------------
// WelcomeScreen — new props
// ---------------------------------------------------------------------------

describe('WelcomeScreen — onRemoveRecent and onClearRecent props', () => {
  it('onRemoveRecent is in WelcomeScreenProps', () => {
    const ifaceStart = welcomeSource.indexOf('interface WelcomeScreenProps');
    const ifaceEnd = welcomeSource.indexOf('\n}', ifaceStart) + 2;
    const iface = welcomeSource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('onRemoveRecent: (path: string) => void');
  });

  it('onClearRecent is in WelcomeScreenProps', () => {
    const ifaceStart = welcomeSource.indexOf('interface WelcomeScreenProps');
    const ifaceEnd = welcomeSource.indexOf('\n}', ifaceStart) + 2;
    const iface = welcomeSource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('onClearRecent: () => void');
  });

  it('onRemoveRecent is destructured in WelcomeScreen function', () => {
    const fnStart = welcomeSource.indexOf('export function WelcomeScreen(');
    const fnEnd = welcomeSource.indexOf('}: WelcomeScreenProps)', fnStart) + 25;
    const sig = welcomeSource.slice(fnStart, fnEnd);
    expect(sig).toContain('onRemoveRecent');
  });

  it('onClearRecent is destructured in WelcomeScreen function', () => {
    const fnStart = welcomeSource.indexOf('export function WelcomeScreen(');
    const fnEnd = welcomeSource.indexOf('}: WelcomeScreenProps)', fnStart) + 25;
    const sig = welcomeSource.slice(fnStart, fnEnd);
    expect(sig).toContain('onClearRecent');
  });
});

// ---------------------------------------------------------------------------
// WelcomeScreen — clear all button
// ---------------------------------------------------------------------------

describe('WelcomeScreen — welcome-clear-recent-btn', () => {
  it('renders welcome-clear-recent-btn', () => {
    expect(welcomeSource).toContain('data-testid="welcome-clear-recent-btn"');
  });

  it('clear button calls onClearRecent on click', () => {
    const btnPos = welcomeSource.indexOf('data-testid="welcome-clear-recent-btn"');
    const btnEnd = welcomeSource.indexOf('</button>', btnPos) + 9;
    const btnBlock = welcomeSource.slice(btnPos, btnEnd);
    expect(btnBlock).toContain('onClick={onClearRecent}');
  });

  it('clear button label is "Wis alles"', () => {
    const btnPos = welcomeSource.indexOf('data-testid="welcome-clear-recent-btn"');
    const btnEnd = welcomeSource.indexOf('</button>', btnPos) + 9;
    const btnBlock = welcomeSource.slice(btnPos, btnEnd);
    expect(btnBlock).toContain("t('welcome.clearAll'");
  });

  it('clear button only appears when recentFiles is non-empty', () => {
    // The clear button is inside the recentFiles.length > 0 branch
    const clearBtnPos = welcomeSource.indexOf('data-testid="welcome-clear-recent-btn"');
    const lengthCheckPos = welcomeSource.lastIndexOf('recentFiles.length > 0', clearBtnPos);
    expect(lengthCheckPos).toBeGreaterThan(-1);
    expect(clearBtnPos - lengthCheckPos).toBeLessThan(500);
  });
});

// ---------------------------------------------------------------------------
// WelcomeScreen — per-item remove button
// ---------------------------------------------------------------------------

describe('WelcomeScreen — recent-file-remove-btn', () => {
  it('renders recent-file-remove-btn', () => {
    expect(welcomeSource).toContain('data-testid="recent-file-remove-btn"');
  });

  it('remove button calls onRemoveRecent with the path', () => {
    const btnPos = welcomeSource.indexOf('data-testid="recent-file-remove-btn"');
    const btnEnd = welcomeSource.indexOf('</button>', btnPos) + 9;
    const btnBlock = welcomeSource.slice(btnPos, btnEnd);
    expect(btnBlock).toContain('onRemoveRecent(path)');
  });

  it('remove button stops click propagation to avoid opening the file', () => {
    const btnPos = welcomeSource.indexOf('data-testid="recent-file-remove-btn"');
    const btnEnd = welcomeSource.indexOf('</button>', btnPos) + 9;
    const btnBlock = welcomeSource.slice(btnPos, btnEnd);
    expect(btnBlock).toContain('e.stopPropagation()');
  });

  it('remove button has an accessible aria-label', () => {
    const btnPos = welcomeSource.indexOf('data-testid="recent-file-remove-btn"');
    const btnEnd = welcomeSource.indexOf('</button>', btnPos) + 9;
    const btnBlock = welcomeSource.slice(btnPos, btnEnd);
    expect(btnBlock).toContain('aria-label=');
  });

  it('open button is inside the recent-file-item container', () => {
    expect(welcomeSource).toContain('data-testid="recent-file-open-btn"');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — wires removeRecentFile and clearRecentFiles
// ---------------------------------------------------------------------------

describe('ViewerApp — wires recent file management', () => {
  it('destructures removeRecentFile from useRecentFiles', () => {
    expect(viewerAppSource).toContain('removeRecentFile');
  });

  it('destructures clearRecentFiles from useRecentFiles', () => {
    expect(viewerAppSource).toContain('clearRecentFiles');
  });

  it('passes onRemoveRecent={removeRecentFile} to WelcomeScreen', () => {
    expect(viewerAppSource).toContain('onRemoveRecent={removeRecentFile}');
  });

  it('passes onClearRecent={clearRecentFiles} to WelcomeScreen', () => {
    expect(viewerAppSource).toContain('onClearRecent={clearRecentFiles}');
  });
});

// ---------------------------------------------------------------------------
// No regressions — existing WelcomeScreen features intact
// ---------------------------------------------------------------------------

describe('WelcomeScreen — no regressions', () => {
  it('welcome-screen testid still present', () => {
    expect(welcomeSource).toContain('data-testid="welcome-screen"');
  });

  it('welcome-open-btn testid still present', () => {
    expect(welcomeSource).toContain('data-testid="welcome-open-btn"');
  });

  it('recent-file-item testid still present', () => {
    expect(welcomeSource).toContain('data-testid="recent-file-item"');
  });

  it('welcome-empty-state testid still present', () => {
    expect(welcomeSource).toContain('data-testid="welcome-empty-state"');
  });

  it('onOpenRecent still wired per item', () => {
    expect(welcomeSource).toContain('onOpenRecent(path)');
  });

  it('addRecentFile still in useRecentFiles return', () => {
    expect(hookSource).toContain('addRecentFile');
  });
});

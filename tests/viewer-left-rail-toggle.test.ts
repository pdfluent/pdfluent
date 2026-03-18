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

// Locate the lazy initializer block for leftRailOpen
const initStart  = viewerAppSource.indexOf('const [leftRailOpen');
const initEnd    = viewerAppSource.indexOf('});', initStart) + 3;
const initBlock  = viewerAppSource.slice(initStart, initEnd);

// Locate the persist effect block
const persistStart = viewerAppSource.indexOf('Persist left rail visibility');
const persistEnd   = viewerAppSource.indexOf('}, [leftRailOpen])') + '}, [leftRailOpen])'.length;
const persistBlock = viewerAppSource.slice(persistStart, persistEnd);

// Locate the keyboard shortcut handler block
const railKeyStart = viewerAppSource.indexOf('Left rail toggle');
const railKeyEnd   = viewerAppSource.indexOf('}, []);', railKeyStart) + '}, []);'.length;
const railKeyBlock = viewerAppSource.slice(railKeyStart, railKeyEnd);

// ---------------------------------------------------------------------------
// State declaration
// ---------------------------------------------------------------------------

describe('left rail toggle — state', () => {
  it('declares leftRailOpen state', () => {
    expect(viewerAppSource).toContain('leftRailOpen');
    expect(viewerAppSource).toContain('setLeftRailOpen');
  });

  it('uses a lazy useState initializer (function form)', () => {
    expect(initBlock).toContain('useState(() =>');
  });
});

// ---------------------------------------------------------------------------
// localStorage — restore on mount
// ---------------------------------------------------------------------------

describe('left rail toggle — restore on mount', () => {
  it('reads from localStorage on init', () => {
    expect(initBlock).toContain('localStorage.getItem');
    expect(initBlock).toContain("'pdfluent.viewer.rail'");
  });

  it("defaults to open when stored value is not 'false'", () => {
    expect(initBlock).toContain("!== 'false'");
  });

  it('falls back to true when localStorage is unavailable', () => {
    expect(initBlock).toContain('return true');
  });

  it('wraps localStorage access in try/catch', () => {
    expect(initBlock).toContain('try {');
    expect(initBlock).toContain('} catch {');
  });
});

// ---------------------------------------------------------------------------
// localStorage — persist on change
// ---------------------------------------------------------------------------

describe('left rail toggle — persist on change', () => {
  it('writes to localStorage when leftRailOpen changes', () => {
    expect(persistBlock).toContain('localStorage.setItem');
    expect(persistBlock).toContain("'pdfluent.viewer.rail'");
  });

  it('stores the value as a string', () => {
    expect(persistBlock).toContain('String(leftRailOpen)');
  });

  it('useEffect depends on [leftRailOpen]', () => {
    expect(persistBlock).toContain('}, [leftRailOpen])');
  });

  it('wraps write in try/catch', () => {
    expect(persistBlock).toContain('try {');
    expect(persistBlock).toContain('} catch {');
  });
});

// ---------------------------------------------------------------------------
// Keyboard shortcut — ⌘B / Ctrl+B
// ---------------------------------------------------------------------------

describe('left rail toggle — keyboard shortcut', () => {
  it('registers a handleRailKey listener', () => {
    expect(railKeyBlock).toContain('handleRailKey');
  });

  it('requires metaKey or ctrlKey', () => {
    expect(railKeyBlock).toContain('e.metaKey || e.ctrlKey');
  });

  it("triggers on key 'b'", () => {
    expect(railKeyBlock).toContain("e.key !== 'b'");
  });

  it('calls preventDefault', () => {
    expect(railKeyBlock).toContain('e.preventDefault()');
  });

  it('toggles leftRailOpen', () => {
    expect(railKeyBlock).toContain('setLeftRailOpen(o => !o)');
  });

  it('adds and removes the keydown listener', () => {
    expect(railKeyBlock).toContain("window.addEventListener('keydown', handleRailKey)");
    expect(railKeyBlock).toContain("window.removeEventListener('keydown', handleRailKey)");
  });

  it('effect has no dependencies (always active)', () => {
    expect(railKeyBlock).toContain('}, [])');
  });
});

// ---------------------------------------------------------------------------
// Conditional render
// ---------------------------------------------------------------------------

describe('left rail toggle — conditional render', () => {
  it('conditionally renders LeftNavRail based on leftRailOpen', () => {
    expect(viewerAppSource).toContain('{leftRailOpen && (');
  });

  it('LeftNavRail is inside the conditional', () => {
    const condStart = viewerAppSource.indexOf('{leftRailOpen && (');
    const condEnd   = viewerAppSource.indexOf(')}', condStart);
    const condBlock = viewerAppSource.slice(condStart, condEnd);
    expect(condBlock).toContain('<LeftNavRail');
  });
});

// ---------------------------------------------------------------------------
// Command palette entry
// ---------------------------------------------------------------------------

describe('left rail toggle — command palette', () => {
  it("has a 'toggle-rail' command", () => {
    expect(viewerAppSource).toContain("id: 'toggle-rail'");
  });

  it('toggle-rail label is in Dutch', () => {
    expect(viewerAppSource).toContain("label: t('commands.togglePanel')");
  });

  it('toggle-rail action toggles leftRailOpen', () => {
    // Locate the command entry to scope the assertion
    const cmdStart = viewerAppSource.indexOf("id: 'toggle-rail'");
    const cmdEnd   = viewerAppSource.indexOf('},', cmdStart) + 2;
    const cmdBlock = viewerAppSource.slice(cmdStart, cmdEnd);
    expect(cmdBlock).toContain('setLeftRailOpen(o => !o)');
  });
});

// ---------------------------------------------------------------------------
// No regressions
// ---------------------------------------------------------------------------

describe('left rail toggle — no regressions', () => {
  it('LeftNavRail component is still imported', () => {
    expect(viewerAppSource).toContain("import { LeftNavRail }");
  });

  it('zoom controls still present', () => {
    expect(viewerAppSource).toContain('zoom-reset-btn');
    expect(viewerAppSource).toContain('setZoomPresetsOpen');
  });

  it('GoToPageDialog still mounted', () => {
    expect(viewerAppSource).toContain('<GoToPageDialog');
  });

  it('floating page indicator still present', () => {
    expect(viewerAppSource).toContain('floating-page-indicator');
  });

  it('ZoomPresetsPopover still mounted', () => {
    expect(viewerAppSource).toContain('<ZoomPresetsPopover');
  });

  it('pdfluent.viewer.zoom key unchanged', () => {
    expect(viewerAppSource).toContain("'pdfluent.viewer.zoom'");
  });
});

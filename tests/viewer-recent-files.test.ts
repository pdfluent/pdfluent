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
// Persistence key and storage format
// ---------------------------------------------------------------------------

describe('useRecentFiles — persistence key and storage format', () => {
  it('uses the stable localStorage key pdfluent.recent-files', () => {
    expect(hookSource).toContain("'pdfluent.recent-files'");
    expect(hookSource).toContain('RECENT_FILES_KEY');
  });

  it('stores the list as a JSON array', () => {
    expect(hookSource).toContain('JSON.stringify(updated)');
    expect(hookSource).toContain('localStorage.setItem(RECENT_FILES_KEY');
  });

  it('reads back with JSON.parse and validates array type', () => {
    expect(hookSource).toContain('JSON.parse(raw)');
    expect(hookSource).toContain('Array.isArray(parsed)');
  });

  it('filters to string entries only (guards against corrupt data)', () => {
    expect(hookSource).toContain("typeof v === 'string'");
  });

  it('initializes from localStorage via lazy useState', () => {
    expect(hookSource).toContain('useState<string[]>(() => readFromStorage())');
  });
});

// ---------------------------------------------------------------------------
// Deduplication and recency ordering
// ---------------------------------------------------------------------------

describe('useRecentFiles — deduplication and ordering', () => {
  it('removes the existing occurrence before prepending (dedup)', () => {
    expect(hookSource).toContain('prev.filter(p => p !== path)');
  });

  it('prepends the new path so most recent comes first', () => {
    expect(hookSource).toContain('[path, ...deduped]');
  });
});

// ---------------------------------------------------------------------------
// Max length
// ---------------------------------------------------------------------------

describe('useRecentFiles — max length', () => {
  it('caps the list at MAX_RECENT_FILES entries', () => {
    expect(hookSource).toContain('slice(0, MAX_RECENT_FILES)');
  });

  it('MAX_RECENT_FILES is 8', () => {
    expect(hookSource).toContain('MAX_RECENT_FILES = 8');
  });
});

// ---------------------------------------------------------------------------
// Tauri file-path loads included / ArrayBuffer loads excluded
// ---------------------------------------------------------------------------

describe('ViewerApp — recent files: load tracking', () => {
  it('uses a ref to track the last recorded doc ID', () => {
    expect(viewerAppSource).toContain('lastDocIdRef');
    expect(viewerAppSource).toContain("useRef<string | null>(null)");
  });

  it('calls addRecentFile only when pdfDoc.id changes (successful load)', () => {
    expect(viewerAppSource).toContain('pdfDoc.id === lastDocIdRef.current');
    expect(viewerAppSource).toContain('addRecentFile(currentFilePath)');
  });

  it('guards against null currentFilePath (excludes ArrayBuffer/browser loads)', () => {
    // The effect bails if currentFilePath is null — ArrayBuffer sources set it to null
    const effectStart = viewerAppSource.indexOf('lastDocIdRef.current = null; return');
    const addIdx      = viewerAppSource.indexOf('addRecentFile(currentFilePath)', effectStart);
    const nullGuardIdx = viewerAppSource.indexOf('if (!currentFilePath) return', effectStart);
    expect(nullGuardIdx).toBeGreaterThan(-1);
    expect(nullGuardIdx).toBeLessThan(addIdx);
  });

  it('resets lastDocIdRef to null when document is closed', () => {
    expect(viewerAppSource).toContain('lastDocIdRef.current = null');
  });

  it('depends on pdfDoc?.id and currentFilePath', () => {
    expect(viewerAppSource).toContain("[pdfDoc?.id, currentFilePath, addRecentFile]");
  });
});

// ---------------------------------------------------------------------------
// Empty-state rendering
// ---------------------------------------------------------------------------

describe('ViewerApp — recent files: empty-state rendering', () => {
  it('renders the recent-files-list container with correct testid', () => {
    expect(viewerAppSource).toContain('data-testid="recent-files-list"');
  });

  it('renders individual entries with data-testid="recent-file-entry"', () => {
    expect(viewerAppSource).toContain('data-testid="recent-file-entry"');
  });

  it('only renders the list when recentFiles.length > 0', () => {
    expect(viewerAppSource).toContain('recentFiles.length > 0');
  });

  it('derives the file name from the path using split', () => {
    expect(viewerAppSource).toContain("path.split(/[/\\\\]/).pop()");
  });

  it('shows the full path as title for tooltip on hover', () => {
    expect(viewerAppSource).toContain('title={path}');
  });

  it('shows a "Recent geopend" heading above the list', () => {
    expect(viewerAppSource).toContain("t('welcome.recentFiles')");
  });
});

// ---------------------------------------------------------------------------
// Click-to-reopen wiring
// ---------------------------------------------------------------------------

describe('ViewerApp — recent files: click-to-reopen', () => {
  it('each entry calls handleLoadDocument with the stored path on click', () => {
    expect(viewerAppSource).toContain('onClick={() => { void handleLoadDocument(path); }}');
  });

  it('the unsaved-changes guard in handleLoadDocument protects reopens too', () => {
    // handleLoadDocument checks isDirty and opens the dialog — no special case needed
    expect(viewerAppSource).toContain('if (isDirty)');
    expect(viewerAppSource).toContain('setUnsavedDialogOpen(true)');
  });
});

// ---------------------------------------------------------------------------
// Graceful handling of stale/invalid entries
// ---------------------------------------------------------------------------

describe('useRecentFiles — stale-path resilience', () => {
  it('readFromStorage returns empty array on JSON parse error', () => {
    // catch block returns []
    const catchIdx = hookSource.indexOf('} catch {', hookSource.indexOf('readFromStorage'));
    expect(catchIdx).toBeGreaterThan(-1);
    const catchBody = hookSource.slice(catchIdx, catchIdx + 50);
    expect(catchBody).toContain('return []');
  });

  it('readFromStorage returns empty array when localStorage item is null', () => {
    expect(hookSource).toContain('if (!raw) return []');
  });

  it('addRecentFile swallows localStorage write errors silently', () => {
    const writeSection = hookSource.indexOf('localStorage.setItem(RECENT_FILES_KEY');
    const catchAfter = hookSource.indexOf('} catch {', writeSection);
    expect(catchAfter).toBeGreaterThan(writeSection);
  });
});

// ---------------------------------------------------------------------------
// No regressions
// ---------------------------------------------------------------------------

describe('ViewerApp — recent files: no regressions', () => {
  it('useRecentFiles is imported', () => {
    expect(viewerAppSource).toContain("import { useRecentFiles } from './hooks/useRecentFiles'");
  });

  it('empty state still has viewer-empty-state testid', () => {
    expect(viewerAppSource).toContain('data-testid="viewer-empty-state"');
  });

  it('unsaved-changes guard still present', () => {
    expect(viewerAppSource).toContain('handleBeforeUnload');
  });

  it('organize grid still present', () => {
    expect(viewerAppSource).toContain('<OrganizeGrid');
  });

  it('arrow page nav still present', () => {
    expect(viewerAppSource).toContain('handlePageNav');
  });
});

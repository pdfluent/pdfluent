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

// ---------------------------------------------------------------------------
// SearchResult interface
// ---------------------------------------------------------------------------

describe('ViewerApp — SearchResult interface', () => {
  it('exports SearchResult interface', () => {
    expect(viewerAppSource).toContain('export interface SearchResult');
  });

  it('SearchResult has pageIndex: number', () => {
    const ifaceStart = viewerAppSource.indexOf('export interface SearchResult');
    const ifaceEnd = viewerAppSource.indexOf('\n}', ifaceStart) + 2;
    const iface = viewerAppSource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('pageIndex: number');
  });

  it('SearchResult has rect with x, y, width, height', () => {
    const ifaceStart = viewerAppSource.indexOf('export interface SearchResult');
    const ifaceEnd = viewerAppSource.indexOf('\n}', ifaceStart) + 2;
    const iface = viewerAppSource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('rect:');
    expect(iface).toContain('x: number');
    expect(iface).toContain('y: number');
    expect(iface).toContain('width: number');
    expect(iface).toContain('height: number');
  });

  it('SearchResult has text: string', () => {
    const ifaceStart = viewerAppSource.indexOf('export interface SearchResult');
    const ifaceEnd = viewerAppSource.indexOf('\n}', ifaceStart) + 2;
    const iface = viewerAppSource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('text: string');
  });

  it('SearchResult has spanIndex: number', () => {
    const ifaceStart = viewerAppSource.indexOf('export interface SearchResult');
    const ifaceEnd = viewerAppSource.indexOf('\n}', ifaceStart) + 2;
    const iface = viewerAppSource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('spanIndex: number');
  });
});

// ---------------------------------------------------------------------------
// Search state declarations
// ---------------------------------------------------------------------------

describe('ViewerApp — search state', () => {
  it('declares isSearchOpen state initialized to false', () => {
    expect(viewerAppSource).toContain('[isSearchOpen, setIsSearchOpen] = useState(false)');
  });

  it('declares searchQuery state initialized to empty string', () => {
    expect(viewerAppSource).toContain("[searchQuery, setSearchQuery] = useState('')");
  });

  it('declares searchResults state initialized to empty array', () => {
    expect(viewerAppSource).toContain('searchResults, setSearchResults] = useState<SearchResult[]>([])');
  });

  it('declares activeSearchResultIdx state initialized to -1', () => {
    expect(viewerAppSource).toContain('[activeSearchResultIdx, setActiveSearchResultIdx] = useState(-1)');
  });
});

// ---------------------------------------------------------------------------
// clearSearch helper
// ---------------------------------------------------------------------------

describe('ViewerApp — clearSearch helper', () => {
  it('defines clearSearch with useCallback', () => {
    expect(viewerAppSource).toContain('clearSearch');
    expect(viewerAppSource).toContain('useCallback');
  });

  it('clearSearch resets searchQuery to empty string', () => {
    const fnStart = viewerAppSource.indexOf('clearSearch = useCallback');
    const fnEnd = viewerAppSource.indexOf('}, [])', fnStart) + 6;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("setSearchQuery('')");
  });

  it('clearSearch resets searchResults to empty array', () => {
    const fnStart = viewerAppSource.indexOf('clearSearch = useCallback');
    const fnEnd = viewerAppSource.indexOf('}, [])', fnStart) + 6;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('setSearchResults([])');
  });

  it('clearSearch resets activeSearchResultIdx to -1', () => {
    const fnStart = viewerAppSource.indexOf('clearSearch = useCallback');
    const fnEnd = viewerAppSource.indexOf('}, [])', fnStart) + 6;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('setActiveSearchResultIdx(-1)');
  });

  it('clearSearch has empty dependency array', () => {
    const fnStart = viewerAppSource.indexOf('clearSearch = useCallback');
    const closeIdx = viewerAppSource.indexOf('}, [])', fnStart);
    expect(closeIdx).toBeGreaterThan(fnStart);
  });
});

// ---------------------------------------------------------------------------
// No regressions
// ---------------------------------------------------------------------------

describe('ViewerApp — search state: no regressions', () => {
  it('textSpans state still present', () => {
    expect(viewerAppSource).toContain('[textSpans, setTextSpans] = useState<TextSpan[]>([])');
  });

  it('commandPaletteOpen state still present', () => {
    expect(viewerAppSource).toContain('[commandPaletteOpen, setCommandPaletteOpen]');
  });
});

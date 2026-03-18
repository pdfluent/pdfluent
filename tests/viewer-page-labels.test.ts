// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const engineSource = readFileSync(
  new URL('../src-tauri/src/pdf_engine.rs', import.meta.url),
  'utf8'
);

const libSource = readFileSync(
  new URL('../src-tauri/src/lib.rs', import.meta.url),
  'utf8'
);

const navRailSource = readFileSync(
  new URL('../src/viewer/components/LeftNavRail.tsx', import.meta.url),
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
// pdf_engine.rs — get_page_labels
// ---------------------------------------------------------------------------

describe('pdf_engine.rs — get_page_labels', () => {
  it('defines get_page_labels method', () => {
    expect(engineSource).toContain('pub fn get_page_labels(');
  });

  it('reads /PageLabels from the catalog', () => {
    const fnStart = engineSource.indexOf('pub fn get_page_labels(');
    const fnEnd = engineSource.indexOf('fn to_roman(', fnStart);
    const fnBody = engineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('PageLabels');
  });

  it('falls back to numeric labels when /PageLabels absent', () => {
    const fnStart = engineSource.indexOf('pub fn get_page_labels(');
    const fnEnd = engineSource.indexOf('fn to_roman(', fnStart);
    const fnBody = engineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('i.to_string()');
  });

  it('parses /Nums array from number tree', () => {
    const fnStart = engineSource.indexOf('pub fn get_page_labels(');
    const fnEnd = engineSource.indexOf('fn to_roman(', fnStart);
    const fnBody = engineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('Nums');
  });

  it('supports decimal style /D', () => {
    const fnStart = engineSource.indexOf('pub fn get_page_labels(');
    const fnEnd = engineSource.indexOf('fn to_roman(', fnStart);
    const fnBody = engineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("b'D'");
  });

  it('supports roman numeral styles /R and /r', () => {
    const fnStart = engineSource.indexOf('pub fn get_page_labels(');
    const fnEnd = engineSource.indexOf('fn to_roman(', fnStart);
    const fnBody = engineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("b'R'");
    expect(fnBody).toContain("b'r'");
  });

  it('supports alphabetic styles /A and /a', () => {
    const fnStart = engineSource.indexOf('pub fn get_page_labels(');
    const fnEnd = engineSource.indexOf('fn to_roman(', fnStart);
    const fnBody = engineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("b'A'");
    expect(fnBody).toContain("b'a'");
  });

  it('reads /St (start value) from label dict', () => {
    const fnStart = engineSource.indexOf('pub fn get_page_labels(');
    const fnEnd = engineSource.indexOf('fn to_roman(', fnStart);
    const fnBody = engineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('St');
  });

  it('reads /P (prefix) from label dict', () => {
    const fnStart = engineSource.indexOf('pub fn get_page_labels(');
    const fnEnd = engineSource.indexOf('fn to_roman(', fnStart);
    const fnBody = engineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('"P"');
  });

  it('defines to_roman helper', () => {
    expect(engineSource).toContain('fn to_roman(');
  });

  it('defines to_alpha helper', () => {
    expect(engineSource).toContain('fn to_alpha(');
  });
});

// ---------------------------------------------------------------------------
// lib.rs — get_page_labels Tauri command
// ---------------------------------------------------------------------------

describe('lib.rs — get_page_labels Tauri command', () => {
  it('declares get_page_labels as a tauri::command', () => {
    const fnIdx = libSource.indexOf('fn get_page_labels(');
    expect(libSource.slice(fnIdx - 40, fnIdx)).toContain('#[tauri::command]');
  });

  it('delegates to doc.get_page_labels()', () => {
    const fnIdx = libSource.indexOf('fn get_page_labels(');
    expect(libSource.slice(fnIdx, fnIdx + 200)).toContain('doc.get_page_labels()');
  });

  it('returns Vec<String>', () => {
    const fnIdx = libSource.indexOf('fn get_page_labels(');
    expect(libSource.slice(fnIdx, fnIdx + 200)).toContain('Vec<String>');
  });

  it('registered in invoke_handler', () => {
    expect(libSource).toContain('get_page_labels,');
  });
});

// ---------------------------------------------------------------------------
// LeftNavRail — pageLabels prop
// ---------------------------------------------------------------------------

describe('LeftNavRail — pageLabels prop', () => {
  it('declares pageLabels in LeftNavRailProps', () => {
    expect(navRailSource).toContain('pageLabels?: string[]');
  });

  it('ThumbnailPanel accepts pageLabels prop', () => {
    const fnStart = navRailSource.indexOf('function ThumbnailPanel(');
    const fnEnd = navRailSource.indexOf('function OutlineItem(', fnStart);
    const fnBody = navRailSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('pageLabels');
  });

  it('displays pageLabels label instead of numeric index in thumbnail', () => {
    const fnStart = navRailSource.indexOf('function ThumbnailPanel(');
    const fnEnd = navRailSource.indexOf('function OutlineItem(', fnStart);
    const fnBody = navRailSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('pageLabels?.[i]');
  });

  it('falls back to (i + 1) when label is absent', () => {
    const fnStart = navRailSource.indexOf('function ThumbnailPanel(');
    const fnEnd = navRailSource.indexOf('function OutlineItem(', fnStart);
    const fnBody = navRailSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('i + 1');
  });

  it('passes pageLabels from PanelContent to ThumbnailPanel', () => {
    expect(navRailSource).toContain('pageLabels={pageLabels}');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — pageLabels state and fetch
// ---------------------------------------------------------------------------

describe('ViewerApp — pageLabels state and fetch', () => {
  it('declares pageLabels state', () => {
    expect(viewerAppSource).toContain("useState<string[]>([])");
  });

  it('fetches page labels via get_page_labels Tauri command', () => {
    expect(viewerAppSource).toContain("'get_page_labels'");
  });

  it('calls setPageLabels with fetched labels', () => {
    expect(viewerAppSource).toContain('setPageLabels(labels)');
  });

  it('passes pageLabels to LeftNavRail', () => {
    expect(viewerAppSource).toContain('pageLabels={pageLabels}');
  });
});

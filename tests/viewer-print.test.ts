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

const cssSource = readFileSync(
  new URL('../src/styles/global.css', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// Print keyboard handler
// ---------------------------------------------------------------------------

describe('print — keyboard handler', () => {
  it('has handlePrintKey function', () => {
    expect(viewerAppSource).toContain('handlePrintKey');
  });

  it('calls window.print()', () => {
    expect(viewerAppSource).toContain('window.print()');
  });

  it('detects metaKey or ctrlKey with key p', () => {
    expect(viewerAppSource).toContain("e.key !== 'p'");
    expect(viewerAppSource).toContain('e.metaKey || e.ctrlKey');
  });

  it('calls e.preventDefault() before printing', () => {
    const printIdx = viewerAppSource.indexOf('handlePrintKey');
    const preventIdx = viewerAppSource.indexOf('e.preventDefault()', printIdx);
    expect(preventIdx).toBeGreaterThan(printIdx);
  });

  it('guards printing when pageCount === 0', () => {
    const printIdx = viewerAppSource.indexOf('handlePrintKey');
    const guardIdx = viewerAppSource.indexOf('pageCount === 0', printIdx);
    expect(guardIdx).toBeGreaterThan(printIdx);
  });

  it('registers keydown listener for print', () => {
    expect(viewerAppSource).toContain("window.addEventListener('keydown', handlePrintKey)");
  });

  it('removes keydown listener on cleanup', () => {
    expect(viewerAppSource).toContain("window.removeEventListener('keydown', handlePrintKey)");
  });
});

// ---------------------------------------------------------------------------
// Print command in palette
// ---------------------------------------------------------------------------

describe('print — command palette entry', () => {
  it('has a print command in the commands array', () => {
    expect(viewerAppSource).toContain("id: 'print'");
  });

  it('print command label is in Dutch', () => {
    expect(viewerAppSource).toContain("label: t('commands.print')");
  });

  it('print command calls window.print()', () => {
    const printCmdIdx = viewerAppSource.indexOf("id: 'print'");
    const printCallIdx = viewerAppSource.indexOf('window.print()', printCmdIdx);
    expect(printCallIdx).toBeGreaterThan(printCmdIdx);
  });
});

// ---------------------------------------------------------------------------
// data-print-region attribute
// ---------------------------------------------------------------------------

describe('print — data-print-region', () => {
  it('has data-print-region attribute in JSX', () => {
    expect(viewerAppSource).toContain('data-print-region');
  });
});

// ---------------------------------------------------------------------------
// CSS print styles
// ---------------------------------------------------------------------------

describe('print — CSS styles', () => {
  it('has @media print rule in global.css', () => {
    expect(cssSource).toContain('@media print');
  });

  it('hides body children in print mode', () => {
    expect(cssSource).toContain('display: none !important');
  });

  it('shows data-print-region element in print mode', () => {
    expect(cssSource).toContain('[data-print-region]');
    expect(cssSource).toContain('display: block !important');
  });
});

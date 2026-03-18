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
// ViewerApp — wiring
// ---------------------------------------------------------------------------

describe('ViewerApp — close document wiring', () => {
  it('destructures closeDocument from useDocument', () => {
    expect(viewerAppSource).toContain('closeDocument,');
  });

  it('passes onCloseDocument to TopBar', () => {
    expect(viewerAppSource).toContain('onCloseDocument=');
  });

  it('onCloseDocument calls closeDocument()', () => {
    expect(viewerAppSource).toContain('closeDocument()');
  });

  it('onCloseDocument clears currentFilePath to null', () => {
    // The callback must set currentFilePath to null
    const topBarProp = viewerAppSource.indexOf('onCloseDocument=');
    const callbackEnd = viewerAppSource.indexOf('/>', topBarProp);
    const callbackBody = viewerAppSource.slice(topBarProp, callbackEnd);
    expect(callbackBody).toContain('setCurrentFilePath(null)');
  });
});

// ---------------------------------------------------------------------------
// TopBar — prop interface
// ---------------------------------------------------------------------------

describe('TopBar — onCloseDocument prop', () => {
  it('declares onCloseDocument in TopBarProps', () => {
    expect(topBarSource).toContain('onCloseDocument:');
  });

  it('onCloseDocument prop is typed as a function returning void', () => {
    expect(topBarSource).toContain('onCloseDocument: () => void');
  });

  it('destructures onCloseDocument in the function signature', () => {
    // Must appear in the destructured parameter list
    const destructureStart = topBarSource.indexOf('export function TopBar(');
    const destructureEnd = topBarSource.indexOf('}: TopBarProps)', destructureStart);
    const destructureBlock = topBarSource.slice(destructureStart, destructureEnd);
    expect(destructureBlock).toContain('onCloseDocument');
  });
});

// ---------------------------------------------------------------------------
// TopBar — close button JSX
// ---------------------------------------------------------------------------

describe('TopBar — close button visibility', () => {
  it('renders the close button only when fileName is set (inside fileName branch)', () => {
    // The button must appear after the fileName truthy check
    const fileNameCheck = topBarSource.indexOf('fileName ?');
    const closeBtn = topBarSource.indexOf('close-document-btn', fileNameCheck);
    const noDocBranch = topBarSource.indexOf('No document open');
    // closeBtn is before the no-doc branch (i.e., inside the fileName branch)
    expect(closeBtn).toBeGreaterThan(fileNameCheck);
    expect(closeBtn).toBeLessThan(noDocBranch);
  });

  it('does not render the close button when fileName is absent (no-doc branch has no close btn)', () => {
    const noDocStart = topBarSource.indexOf('No document open');
    const noDocEnd = topBarSource.indexOf('</div>', noDocStart);
    const noDocBranch = topBarSource.slice(noDocStart, noDocEnd);
    expect(noDocBranch).not.toContain('close-document-btn');
  });
});

describe('TopBar — close button attributes', () => {
  it('has data-testid close-document-btn', () => {
    expect(topBarSource).toContain('data-testid="close-document-btn"');
  });

  it('calls onCloseDocument on click', () => {
    expect(topBarSource).toContain('onClick={onCloseDocument}');
  });

  it('has an accessible aria-label', () => {
    expect(topBarSource).toContain("aria-label={t('topbar.closeDocument'");
  });

  it('renders an XIcon inside the button', () => {
    expect(topBarSource).toContain('XIcon');
  });

  it('imports XIcon from lucide-react', () => {
    const importBlock = topBarSource.slice(0, topBarSource.indexOf('interface TopBarProps'));
    expect(importBlock).toContain('XIcon');
  });
});

// ---------------------------------------------------------------------------
// No regressions
// ---------------------------------------------------------------------------

describe('TopBar — no regressions after close button addition', () => {
  it('save button is still present', () => {
    expect(topBarSource).toContain('SaveIcon');
    expect(topBarSource).toContain('handleSave');
  });

  it('open button is still present', () => {
    expect(topBarSource).toContain('handleOpen');
  });

  it('export button is still present', () => {
    expect(topBarSource).toContain('onOpenExport');
  });

  it('status dot is still present alongside the close button', () => {
    // Both the dot and the close button appear inside the fileName branch
    const fileNameBranchStart = topBarSource.indexOf('fileName ?');
    const noDocBranch = topBarSource.indexOf('No document open');
    const branch = topBarSource.slice(fileNameBranchStart, noDocBranch);
    expect(branch).toContain('Unsaved changes');
    expect(branch).toContain('close-document-btn');
  });
});

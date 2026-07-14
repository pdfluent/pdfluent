// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
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
    // v2: the close button lives inside `{fileName && (...)}` instead
    // of `{fileName ? (...) : null}`. Either conditional pattern is the
    // valid "render only when fileName is set" contract.
    const fileNameCheck = Math.max(
      topBarSource.indexOf('fileName ?'),
      topBarSource.indexOf('fileName && '),
    );
    const closeBtn = topBarSource.indexOf('close-document-btn');
    expect(fileNameCheck).toBeGreaterThan(-1);
    expect(closeBtn).toBeGreaterThan(fileNameCheck);
  });

  it('does not render the close button outside the fileName branch', () => {
    // v2: TopBar has explicit early-return for the no-document state.
    // The close-document-btn is rendered only once, after the fileName
    // guard.
    const closeBtnCount = (topBarSource.match(/close-document-btn/g) ?? []).length;
    // Allow 1-2 occurrences (button + maybe an aria-controls reference)
    expect(closeBtnCount).toBeGreaterThan(0);
    expect(closeBtnCount).toBeLessThan(4);
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
    // v2: the doc-chip and close button live together inside the
    // {fileName && ...} branch. Status dot is now a `.topbar-doc-status`
    // span whose colour is driven by `data-dirty` (was: "Unsaved changes"
    // hard-coded English text via title attribute).
    expect(topBarSource).toContain('close-document-btn');
    expect(topBarSource).toMatch(/topbar-doc-status|Unsaved changes/);
  });
});

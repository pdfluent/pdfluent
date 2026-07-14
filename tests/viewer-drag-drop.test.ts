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

// ---------------------------------------------------------------------------
// Browser drag-and-drop wiring
// ---------------------------------------------------------------------------

describe('ViewerApp — browser drag-and-drop', () => {
  it('defines handleDragOver function', () => {
    expect(viewerAppSource).toContain('function handleDragOver');
  });

  it('defines handleDrop function', () => {
    expect(viewerAppSource).toContain('function handleDrop');
  });

  it('attaches onDragOver to the outer div', () => {
    expect(viewerAppSource).toContain('onDragOver={handleDragOver}');
  });

  it('attaches onDrop to the outer div', () => {
    expect(viewerAppSource).toContain('onDrop={handleDrop}');
  });

  it('reads the dropped file as ArrayBuffer', () => {
    expect(viewerAppSource).toContain('readAsArrayBuffer');
    expect(viewerAppSource).toContain('ArrayBuffer');
  });

  it('calls handleLoadDocument with the ArrayBuffer', () => {
    expect(viewerAppSource).toContain('void handleLoadDocument(buf)');
  });

  it('reads the file from dataTransfer.files', () => {
    expect(viewerAppSource).toContain('e.dataTransfer.files[0]');
  });

  it('calls e.preventDefault() in handleDragOver', () => {
    const dragOverStart = viewerAppSource.indexOf('function handleDragOver');
    const preventInDragOver = viewerAppSource.indexOf('e.preventDefault()', dragOverStart);
    expect(preventInDragOver).toBeGreaterThan(dragOverStart);
  });

  it('calls e.preventDefault() in handleDrop', () => {
    const dropStart = viewerAppSource.indexOf('function handleDrop');
    const preventInDrop = viewerAppSource.indexOf('e.preventDefault()', dropStart);
    expect(preventInDrop).toBeGreaterThan(dropStart);
  });
});

// ---------------------------------------------------------------------------
// Tauri drag-drop listener
// ---------------------------------------------------------------------------

describe('ViewerApp — Tauri drag-drop listener', () => {
  it('imports getCurrentWebviewWindow from @tauri-apps/api/webviewWindow', () => {
    expect(viewerAppSource).toContain('@tauri-apps/api/webviewWindow');
    expect(viewerAppSource).toContain('getCurrentWebviewWindow');
  });

  it('calls onDragDropEvent to register the listener', () => {
    expect(viewerAppSource).toContain('onDragDropEvent');
  });

  it('handles the over event type by setting isDragging true', () => {
    expect(viewerAppSource).toContain("payload.type === 'over'");
    const overBlock = viewerAppSource.indexOf("payload.type === 'over'");
    const setDraggingTrue = viewerAppSource.indexOf('setIsDragging(true)', overBlock);
    expect(setDraggingTrue).toBeGreaterThan(overBlock);
  });

  it('handles the leave event type by setting isDragging false', () => {
    expect(viewerAppSource).toContain("payload.type === 'leave'");
  });

  it('handles the drop event type and loads the PDF path', () => {
    expect(viewerAppSource).toContain("payload.type === 'drop'");
    expect(viewerAppSource).toContain('payload.paths');
  });

  it('calls handleLoadDocument with the dropped path', () => {
    const tauriDropBlock = viewerAppSource.indexOf("payload.type === 'drop'");
    const loadCall = viewerAppSource.indexOf('void handleLoadDocument(pdf)', tauriDropBlock);
    expect(loadCall).toBeGreaterThan(tauriDropBlock);
  });

  it('stores and calls the unlisten cleanup function', () => {
    expect(viewerAppSource).toContain('unlisten');
    expect(viewerAppSource).toContain('unlisten?.()');
  });

  it('Tauri useEffect depends on handleLoadDocument', () => {
    expect(viewerAppSource).toContain('}, [handleLoadDocument])');
  });
});

// ---------------------------------------------------------------------------
// PDF-only guard
// ---------------------------------------------------------------------------

describe('ViewerApp — drag-and-drop PDF-only guard', () => {
  it('checks .pdf extension in browser drop handler', () => {
    expect(viewerAppSource).toContain(".endsWith('.pdf')");
  });

  it('uses toLowerCase() before extension check', () => {
    expect(viewerAppSource).toContain('toLowerCase().endsWith');
  });

  it('returns early when file is not a PDF (browser)', () => {
    const dropStart = viewerAppSource.indexOf('function handleDrop');
    const earlyReturn = viewerAppSource.indexOf("endsWith('.pdf')) return", dropStart);
    expect(earlyReturn).toBeGreaterThan(dropStart);
  });

  it('checks .pdf extension in Tauri drop handler', () => {
    const tauriBlock = viewerAppSource.indexOf('onDragDropEvent');
    const pdfExtCheck = viewerAppSource.indexOf(".endsWith('.pdf')", tauriBlock);
    expect(pdfExtCheck).toBeGreaterThan(tauriBlock);
  });

  it('guards browser handlers against running in Tauri (isTauri check)', () => {
    const dragOver = viewerAppSource.indexOf('function handleDragOver');
    const tauriGuardInDragOver = viewerAppSource.indexOf('if (isTauri) return', dragOver);
    expect(tauriGuardInDragOver).toBeGreaterThan(dragOver);
  });
});

// ---------------------------------------------------------------------------
// Drag-active overlay state
// ---------------------------------------------------------------------------

describe('ViewerApp — drag-active overlay', () => {
  it('tracks isDragging state', () => {
    expect(viewerAppSource).toContain('isDragging');
    expect(viewerAppSource).toContain('setIsDragging');
  });

  it('initialises isDragging to false', () => {
    expect(viewerAppSource).toContain('useState(false)');
  });

  it('renders the overlay conditionally on isDragging', () => {
    expect(viewerAppSource).toContain('{isDragging && (');
  });

  it('overlay shows drop-pdf label via i18n', () => {
    // v2: literal "Drop PDF hier" replaced by i18n.t('welcome.dropPdfHere')
    expect(viewerAppSource).toMatch(/'Drop PDF hier'|welcome\.dropPdfHere/);
  });

  it('overlay uses fixed positioning to cover the full viewport', () => {
    expect(viewerAppSource).toContain('fixed inset-0');
  });

  it('overlay has high z-index (z-50)', () => {
    expect(viewerAppSource).toContain('z-50');
  });

  it('overlay clears isDragging on drag-leave', () => {
    // v2: dropPdfHere label now references the i18n key — anchor on either form
    const overlay = Math.max(
      viewerAppSource.indexOf('Drop PDF hier'),
      viewerAppSource.indexOf('welcome.dropPdfHere'),
    );
    const dragLeaveOnOverlay = viewerAppSource.lastIndexOf('setIsDragging(false)', overlay);
    expect(dragLeaveOnOverlay).toBeGreaterThan(0);
  });
});

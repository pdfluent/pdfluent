// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

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

  it('overlay shows "Drop PDF hier" label', () => {
    expect(viewerAppSource).toContain('Drop PDF hier');
  });

  it('overlay uses fixed positioning to cover the full viewport', () => {
    expect(viewerAppSource).toContain('fixed inset-0');
  });

  it('overlay has high z-index (z-50)', () => {
    expect(viewerAppSource).toContain('z-50');
  });

  it('overlay clears isDragging on drag-leave', () => {
    const overlay = viewerAppSource.indexOf('Drop PDF hier');
    const dragLeaveOnOverlay = viewerAppSource.lastIndexOf('setIsDragging(false)', overlay);
    expect(dragLeaveOnOverlay).toBeGreaterThan(0);
  });
});

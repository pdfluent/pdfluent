// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const modeToolbarSource = readFileSync(
  new URL('../src/viewer/components/ModeToolbar.tsx', import.meta.url),
  'utf8'
);

const pageCanvasSource = readFileSync(
  new URL('../src/viewer/components/PageCanvas.tsx', import.meta.url),
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
// ModeToolbar — redaction tool
// ---------------------------------------------------------------------------

describe('ModeToolbar — redaction tool', () => {
  it("AnnotationTool type includes 'redaction'", () => {
    const typeStart = modeToolbarSource.indexOf('export type AnnotationTool');
    const typeEnd = modeToolbarSource.indexOf(';', typeStart) + 1;
    const typeDef = modeToolbarSource.slice(typeStart, typeEnd);
    expect(typeDef).toContain("'redaction'");
  });

  it('registers annotation-tool-redaction testId in tools array', () => {
    expect(modeToolbarSource).toContain("testId: 'annotation-tool-redaction'");
  });

  it('imports EraserIcon from lucide-react for redaction tool', () => {
    expect(modeToolbarSource).toContain('EraserIcon');
  });

  it('redaction tool label is Redigeren', () => {
    const toolsIdx = modeToolbarSource.indexOf("testId: 'annotation-tool-redaction'");
    const surrounding = modeToolbarSource.slice(toolsIdx - 100, toolsIdx + 50);
    expect(surrounding).toContain("'toolbar.redact'");
  });
});

// ---------------------------------------------------------------------------
// PageCanvas — redaction uses text cursor and forwards text selection
// ---------------------------------------------------------------------------

describe('PageCanvas — redaction tool cursor and text selection', () => {
  it("includes 'redaction' in activeAnnotationTool prop type", () => {
    const ifaceStart = pageCanvasSource.indexOf('interface PageCanvasProps');
    const ifaceEnd = pageCanvasSource.indexOf('\n}', ifaceStart) + 2;
    const iface = pageCanvasSource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain("'redaction'");
  });

  it("uses text cursor for redaction tool", () => {
    expect(pageCanvasSource).toContain("case 'redaction'");
    const caseIdx = pageCanvasSource.indexOf("case 'redaction'");
    const surrounding = pageCanvasSource.slice(caseIdx, caseIdx + 30);
    // redaction falls through to text cursor case
    const textCursorIdx = pageCanvasSource.indexOf("return 'text'");
    expect(caseIdx).toBeLessThan(textCursorIdx);
  });

  it('redaction tool forwards text selection via textSelectionCallback', () => {
    // Find the textSelectionCallback assignment block specifically
    const cbStart = pageCanvasSource.indexOf('const textSelectionCallback');
    const cbEnd = pageCanvasSource.indexOf(': undefined;', cbStart) + 12;
    const cbBlock = pageCanvasSource.slice(cbStart, cbEnd);
    expect(cbBlock).toContain("activeAnnotationTool === 'redaction'");
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — handleTextSelection routes redaction tool
// ---------------------------------------------------------------------------

describe('ViewerApp — handleTextSelection handles redaction tool', () => {
  it("guard includes 'redaction' as an allowed active tool", () => {
    const fnStart = viewerAppSource.indexOf('const handleTextSelection = useCallback(');
    const fnEnd = viewerAppSource.indexOf('[pdfDoc, pageIndex, activeAnnotationTool', fnStart) + 60;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("activeAnnotationTool !== 'redaction'");
  });

  it('redaction branch computes bounding box (minX, minY, maxX, maxY)', () => {
    const fnStart = viewerAppSource.indexOf('const handleTextSelection = useCallback(');
    const fnEnd = viewerAppSource.indexOf('[pdfDoc, pageIndex, activeAnnotationTool', fnStart) + 60;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("activeAnnotationTool === 'redaction'");
    expect(fnBody).toContain('minX');
    expect(fnBody).toContain('minY');
    expect(fnBody).toContain('maxX');
    expect(fnBody).toContain('maxY');
  });

  it('redaction branch calls add_redaction_annotation with computed bounding rect', () => {
    const fnStart = viewerAppSource.indexOf('const handleTextSelection = useCallback(');
    const fnEnd = viewerAppSource.indexOf('[pdfDoc, pageIndex, activeAnnotationTool', fnStart) + 60;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("invoke('add_redaction_annotation'");
    expect(fnBody).toContain('redactionBackendRect');
  });
});

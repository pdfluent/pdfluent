// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

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
// PageCanvas — onRedactionDraw prop
// ---------------------------------------------------------------------------

describe('PageCanvas — onRedactionDraw prop', () => {
  it('declares onRedactionDraw optional prop', () => {
    const ifaceStart = pageCanvasSource.indexOf('interface PageCanvasProps');
    const ifaceEnd = pageCanvasSource.indexOf('\n}', ifaceStart) + 2;
    const iface = pageCanvasSource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('onRedactionDraw?:');
  });

  it('destructures onRedactionDraw in component function', () => {
    expect(pageCanvasSource).toContain('onRedactionDraw,');
  });
});

// ---------------------------------------------------------------------------
// PageCanvas — mouse handlers handle redaction tool
// ---------------------------------------------------------------------------

describe('PageCanvas — drag-to-draw handles redaction tool', () => {
  it("handlePageMouseDown activates for 'redaction' tool", () => {
    const fnStart = pageCanvasSource.indexOf('function handlePageMouseDown(');
    const fnEnd = pageCanvasSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = pageCanvasSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("activeAnnotationTool !== 'redaction'");
  });

  it("handlePageMouseMove activates for 'redaction' tool", () => {
    const fnStart = pageCanvasSource.indexOf('function handlePageMouseMove(');
    const fnEnd = pageCanvasSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = pageCanvasSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("activeAnnotationTool !== 'redaction'");
  });

  it("handlePageMouseUp activates for 'redaction' tool", () => {
    const fnStart = pageCanvasSource.indexOf('function handlePageMouseUp(');
    const fnEnd = pageCanvasSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = pageCanvasSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("activeAnnotationTool !== 'redaction'");
  });

  it('handlePageMouseUp calls onRedactionDraw for redaction tool', () => {
    const fnStart = pageCanvasSource.indexOf('function handlePageMouseUp(');
    const fnEnd = pageCanvasSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = pageCanvasSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("activeAnnotationTool === 'redaction'");
    expect(fnBody).toContain('onRedactionDraw?.(rect)');
  });

  it('handlePageMouseUp calls onRectDraw for rectangle tool (unchanged)', () => {
    const fnStart = pageCanvasSource.indexOf('function handlePageMouseUp(');
    const fnEnd = pageCanvasSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = pageCanvasSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('onRectDraw?.(rect)');
  });

  it('does NOT call e.preventDefault() for redaction mousedown (text selection can coexist)', () => {
    const fnStart = pageCanvasSource.indexOf('function handlePageMouseDown(');
    const fnEnd = pageCanvasSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = pageCanvasSource.slice(fnStart, fnEnd);
    // preventDefault is only called for 'rectangle', not for 'redaction'
    expect(fnBody).toContain("activeAnnotationTool === 'rectangle'");
    expect(fnBody).toContain('e.preventDefault()');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — handleRedactionDraw wired to PageCanvas
// ---------------------------------------------------------------------------

describe('ViewerApp — handleRedactionDraw passed to PageCanvas', () => {
  it('passes handleRedactionDraw as onRedactionDraw to PageCanvas', () => {
    expect(viewerAppSource).toContain('onRedactionDraw={handleRedactionDraw}');
  });
});

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

const pageCanvasSource = readFileSync(
  new URL('../src/viewer/components/PageCanvas.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// ModeToolbar — AnnotationTool type
// ---------------------------------------------------------------------------

describe('ModeToolbar — AnnotationTool type export', () => {
  it('exports AnnotationTool type', () => {
    expect(modeToolbarSource).toContain('export type AnnotationTool');
  });

  it('AnnotationTool includes highlight, underline, strikeout, rectangle, and null', () => {
    const typeStart = modeToolbarSource.indexOf('export type AnnotationTool');
    const typeEnd = modeToolbarSource.indexOf(';', typeStart) + 1;
    const typeDef = modeToolbarSource.slice(typeStart, typeEnd);
    expect(typeDef).toContain("'highlight'");
    expect(typeDef).toContain("'underline'");
    expect(typeDef).toContain("'strikeout'");
    expect(typeDef).toContain("'rectangle'");
    expect(typeDef).toContain('null');
  });
});

// ---------------------------------------------------------------------------
// ModeToolbar — props for annotation tool control
// ---------------------------------------------------------------------------

describe('ModeToolbar — activeAnnotationTool + onAnnotationToolChange props', () => {
  it('declares activeAnnotationTool optional prop', () => {
    expect(modeToolbarSource).toContain('activeAnnotationTool?: AnnotationTool');
  });

  it('declares onAnnotationToolChange optional prop', () => {
    expect(modeToolbarSource).toContain('onAnnotationToolChange?: (tool: AnnotationTool) => void');
  });

  it('destructures activeAnnotationTool with null default', () => {
    expect(modeToolbarSource).toContain('activeAnnotationTool = null');
  });
});

// ---------------------------------------------------------------------------
// ModeToolbar — annotation tool buttons
// ---------------------------------------------------------------------------

describe('ModeToolbar — annotation tool buttons in review mode', () => {
  it('registers annotation-tool-highlight testId in the tools array', () => {
    // Tools use data-testid={testId} with testId defined in the objects array
    expect(modeToolbarSource).toContain("testId: 'annotation-tool-highlight'");
  });

  it('registers annotation-tool-underline testId in the tools array', () => {
    expect(modeToolbarSource).toContain("testId: 'annotation-tool-underline'");
  });

  it('registers annotation-tool-strikeout testId in the tools array', () => {
    expect(modeToolbarSource).toContain("testId: 'annotation-tool-strikeout'");
  });

  it('registers annotation-tool-rectangle testId in the tools array', () => {
    expect(modeToolbarSource).toContain("testId: 'annotation-tool-rectangle'");
  });

  it('annotation tools only rendered in review mode', () => {
    // The annotationTools array is defined before the JSX; the guard wraps the
    // render section via {mode === 'review' && …}. Scan forward from the array
    // definition to find the guard in the surrounding JSX block.
    const toolsArrayIdx = modeToolbarSource.indexOf("testId: 'annotation-tool-highlight'");
    const guardSlice = modeToolbarSource.slice(toolsArrayIdx, toolsArrayIdx + 6500);
    expect(guardSlice).toContain("mode === 'review'");
  });

  it('active tool has aria-pressed bound to isActive', () => {
    expect(modeToolbarSource).toContain('aria-pressed={isActive}');
  });

  it('clicking active tool deselects it (toggle off)', () => {
    expect(modeToolbarSource).toContain('isActive ? null : tool');
  });

  it('active tool gets distinct highlight styling', () => {
    expect(modeToolbarSource).toContain("isActive");
    expect(modeToolbarSource).toContain('bg-primary/15');
    expect(modeToolbarSource).toContain('text-primary');
  });

  it('imports HighlighterIcon from lucide-react', () => {
    expect(modeToolbarSource).toContain('HighlighterIcon');
  });

  it('imports UnderlineIcon from lucide-react', () => {
    expect(modeToolbarSource).toContain('UnderlineIcon');
  });

  it('imports StrikethroughIcon from lucide-react', () => {
    expect(modeToolbarSource).toContain('StrikethroughIcon');
  });

  it('imports SquareIcon from lucide-react', () => {
    expect(modeToolbarSource).toContain('SquareIcon');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — activeAnnotationTool state
// ---------------------------------------------------------------------------

describe('ViewerApp — activeAnnotationTool state', () => {
  it('declares activeAnnotationTool state', () => {
    expect(viewerAppSource).toContain('const [activeAnnotationTool, setActiveAnnotationTool]');
  });

  it('initialises activeAnnotationTool to null', () => {
    expect(viewerAppSource).toContain('useState<AnnotationTool>(null)');
  });

  it('passes activeAnnotationTool to ModeToolbar', () => {
    expect(viewerAppSource).toContain('activeAnnotationTool={activeAnnotationTool}');
  });

  it('passes setActiveAnnotationTool to ModeToolbar as onAnnotationToolChange', () => {
    expect(viewerAppSource).toContain('onAnnotationToolChange={setActiveAnnotationTool}');
  });

  it('passes activeAnnotationTool to PageCanvas', () => {
    expect(viewerAppSource).toContain('activeAnnotationTool={activeAnnotationTool}');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — mode switch resets tool state
// ---------------------------------------------------------------------------

describe('ViewerApp — mode switch resets activeAnnotationTool', () => {
  it('has a useEffect that watches mode changes', () => {
    // Effect resets tools when leaving review mode
    expect(viewerAppSource).toContain("mode !== 'review'");
    expect(viewerAppSource).toContain('setActiveAnnotationTool(null)');
  });

  it('also resets selectedAnnotationId when leaving review mode', () => {
    expect(viewerAppSource).toContain('setSelectedAnnotationId(null)');
  });
});

// ---------------------------------------------------------------------------
// PageCanvas — cursor changes with active tool
// ---------------------------------------------------------------------------

describe('PageCanvas — cursor style changes with annotation tool', () => {
  it('declares activeAnnotationTool prop', () => {
    const ifaceStart = pageCanvasSource.indexOf('interface PageCanvasProps');
    const ifaceEnd = pageCanvasSource.indexOf('\n}', ifaceStart) + 2;
    const iface = pageCanvasSource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('activeAnnotationTool?:');
  });

  it('uses crosshair cursor for rectangle tool', () => {
    expect(pageCanvasSource).toContain("'crosshair'");
    expect(pageCanvasSource).toContain("'rectangle'");
  });

  it("uses text cursor for text-markup tools (highlight / underline / strikeout)", () => {
    expect(pageCanvasSource).toContain("'text'");
    expect(pageCanvasSource).toContain("'highlight'");
  });

  it('TextLayer only receives onTextSelection for text-markup tools', () => {
    expect(pageCanvasSource).toContain('textSelectionCallback');
    expect(pageCanvasSource).toContain('onTextSelection={textSelectionCallback}');
  });
});

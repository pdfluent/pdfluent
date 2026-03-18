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

const annotOverlaySource = readFileSync(
  new URL('../src/viewer/components/AnnotationOverlay.tsx', import.meta.url),
  'utf8'
);

const rustLibSource = readFileSync(
  new URL('../src-tauri/src/lib.rs', import.meta.url),
  'utf8'
);

const rustEngineSource = readFileSync(
  new URL('../src-tauri/src/pdf_engine.rs', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// ViewerApp — handleTextSelection dispatches underline
// ---------------------------------------------------------------------------

describe('ViewerApp — handleTextSelection dispatches underline annotation', () => {
  it('invokes add_underline_annotation when tool is underline', () => {
    const fnStart = viewerAppSource.indexOf('const handleTextSelection = useCallback(');
    const fnEnd = viewerAppSource.indexOf('[pdfDoc, pageIndex, activeAnnotationTool', fnStart) + 80;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("invoke('add_underline_annotation'");
  });

  it('only dispatches underline when activeAnnotationTool is underline', () => {
    const fnStart = viewerAppSource.indexOf('const handleTextSelection = useCallback(');
    const fnEnd = viewerAppSource.indexOf('[pdfDoc, pageIndex, activeAnnotationTool', fnStart) + 80;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("activeAnnotationTool === 'underline'");
  });

  it('restricts tool to highlight, underline, or strikeout only', () => {
    const fnStart = viewerAppSource.indexOf('const handleTextSelection = useCallback(');
    const fnEnd = viewerAppSource.indexOf('[pdfDoc, pageIndex, activeAnnotationTool', fnStart) + 80;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("'underline'");
    expect(fnBody).toContain("'strikeout'");
    expect(fnBody).toContain("'highlight'");
  });
});

// ---------------------------------------------------------------------------
// AnnotationOverlay — underline rendering
// ---------------------------------------------------------------------------

describe('AnnotationOverlay — underline type renders as line at bottom', () => {
  it("checks for t === 'underline' annotation type", () => {
    expect(annotOverlaySource).toContain("t === 'underline'");
  });

  it('renders underline as <line> element, not <rect>', () => {
    const underlineStart = annotOverlaySource.indexOf("t === 'underline'");
    const underlineEnd = annotOverlaySource.indexOf('return (', underlineStart);
    const returnEnd = annotOverlaySource.indexOf('/>', annotOverlaySource.indexOf('<line', underlineEnd)) + 2;
    const lineEl = annotOverlaySource.slice(underlineEnd, returnEnd);
    expect(lineEl).toContain('<line');
  });

  it('positions underline at the bottom edge (domY + domH)', () => {
    const underlineStart = annotOverlaySource.indexOf("t === 'underline'");
    const blockEnd = annotOverlaySource.indexOf("if (t === 'strikeout')", underlineStart);
    const block = annotOverlaySource.slice(underlineStart, blockEnd);
    expect(block).toContain('domY + domH');
  });

  it('uses mark.color for stroke on underline', () => {
    const underlineStart = annotOverlaySource.indexOf("t === 'underline'");
    const blockEnd = annotOverlaySource.indexOf("if (t === 'strikeout')", underlineStart);
    const block = annotOverlaySource.slice(underlineStart, blockEnd);
    expect(block).toContain('stroke={mark.color}');
  });

  it('underline marker has data-testid annotation-marker', () => {
    const underlineStart = annotOverlaySource.indexOf("t === 'underline'");
    const blockEnd = annotOverlaySource.indexOf("if (t === 'strikeout')", underlineStart);
    const block = annotOverlaySource.slice(underlineStart, blockEnd);
    expect(block).toContain('data-testid="annotation-marker"');
  });

  it('selected underline has thicker stroke width', () => {
    const underlineStart = annotOverlaySource.indexOf("t === 'underline'");
    const blockEnd = annotOverlaySource.indexOf("if (t === 'strikeout')", underlineStart);
    const block = annotOverlaySource.slice(underlineStart, blockEnd);
    expect(block).toContain('isSelected');
    expect(block).toContain('strokeWidth');
  });
});

// ---------------------------------------------------------------------------
// Rust — add_underline_annotation backend
// ---------------------------------------------------------------------------

describe('Rust — add_underline_annotation backend', () => {
  it('is defined in pdf_engine.rs', () => {
    expect(rustEngineSource).toContain('pub fn add_underline_annotation(');
  });

  it('uses AnnotationBuilder::underline', () => {
    expect(rustEngineSource).toContain('AnnotationBuilder::underline(');
  });

  it('calls sync_after_mutation', () => {
    const fnStart = rustEngineSource.indexOf('pub fn add_underline_annotation(');
    const fnEnd = rustEngineSource.indexOf('\n    }', fnStart) + 6;
    const fnBody = rustEngineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('sync_after_mutation()');
  });

  it('add_underline_annotation Tauri command is registered in lib.rs', () => {
    expect(rustLibSource).toContain('add_underline_annotation,');
  });

  it('Tauri command delegates to OpenDocument method', () => {
    const fnStart = rustLibSource.indexOf('fn add_underline_annotation(');
    const fnEnd = rustLibSource.indexOf('\n}', fnStart) + 2;
    const fnBody = rustLibSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('doc.add_underline_annotation(');
  });
});

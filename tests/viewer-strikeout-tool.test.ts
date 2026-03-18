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
// ViewerApp — handleTextSelection dispatches strikeout
// ---------------------------------------------------------------------------

describe('ViewerApp — handleTextSelection dispatches strikeout annotation', () => {
  it('invokes add_strikeout_annotation when tool is strikeout', () => {
    const fnStart = viewerAppSource.indexOf('const handleTextSelection = useCallback(');
    const fnEnd = viewerAppSource.indexOf('[pdfDoc, pageIndex, activeAnnotationTool', fnStart) + 80;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("invoke('add_strikeout_annotation'");
  });

  it('only dispatches strikeout when activeAnnotationTool is strikeout', () => {
    const fnStart = viewerAppSource.indexOf('const handleTextSelection = useCallback(');
    const fnEnd = viewerAppSource.indexOf('[pdfDoc, pageIndex, activeAnnotationTool', fnStart) + 80;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("activeAnnotationTool === 'strikeout'");
  });
});

// ---------------------------------------------------------------------------
// AnnotationOverlay — strikeout rendering
// ---------------------------------------------------------------------------

describe('AnnotationOverlay — strikeout type renders as line through middle', () => {
  it("checks for t === 'strikeout' annotation type", () => {
    expect(annotOverlaySource).toContain("t === 'strikeout'");
  });

  it('renders strikeout as <line> element', () => {
    const strikeStart = annotOverlaySource.indexOf("t === 'strikeout'");
    const returnStart = annotOverlaySource.indexOf('return (', strikeStart);
    const lineStart = annotOverlaySource.indexOf('<line', returnStart);
    expect(lineStart).toBeGreaterThan(-1);
    const lineEl = annotOverlaySource.slice(lineStart, annotOverlaySource.indexOf('/>', lineStart) + 2);
    expect(lineEl).toContain('<line');
  });

  it('positions strikeout at vertical midpoint (domY + domH / 2)', () => {
    const strikeStart = annotOverlaySource.indexOf("t === 'strikeout'");
    const nextType = annotOverlaySource.indexOf("if (t === 'square'", strikeStart);
    const block = annotOverlaySource.slice(strikeStart, nextType);
    expect(block).toContain('domH / 2');
  });

  it('uses mark.color for stroke on strikeout', () => {
    const strikeStart = annotOverlaySource.indexOf("t === 'strikeout'");
    const nextType = annotOverlaySource.indexOf("if (t === 'square'", strikeStart);
    const block = annotOverlaySource.slice(strikeStart, nextType);
    expect(block).toContain('stroke={mark.color}');
  });

  it('strikeout marker has data-testid annotation-marker', () => {
    const strikeStart = annotOverlaySource.indexOf("t === 'strikeout'");
    const nextType = annotOverlaySource.indexOf("if (t === 'square'", strikeStart);
    const block = annotOverlaySource.slice(strikeStart, nextType);
    expect(block).toContain('data-testid="annotation-marker"');
  });

  it('selected strikeout has thicker stroke', () => {
    const strikeStart = annotOverlaySource.indexOf("t === 'strikeout'");
    const nextType = annotOverlaySource.indexOf("if (t === 'square'", strikeStart);
    const block = annotOverlaySource.slice(strikeStart, nextType);
    expect(block).toContain('isSelected');
    expect(block).toContain('strokeWidth');
  });
});

// ---------------------------------------------------------------------------
// Rust — add_strikeout_annotation backend
// ---------------------------------------------------------------------------

describe('Rust — add_strikeout_annotation backend', () => {
  it('is defined in pdf_engine.rs', () => {
    expect(rustEngineSource).toContain('pub fn add_strikeout_annotation(');
  });

  it('uses AnnotationBuilder::strikeout', () => {
    expect(rustEngineSource).toContain('AnnotationBuilder::strikeout(');
  });

  it('accepts page_index, rects slice, and color', () => {
    const fnStart = rustEngineSource.indexOf('pub fn add_strikeout_annotation(');
    const fnEnd = rustEngineSource.indexOf('\n    }', fnStart) + 6;
    const fnBody = rustEngineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('page_index');
    expect(fnBody).toContain('rects');
    expect(fnBody).toContain('color');
  });

  it('generates QuadPoints from rects', () => {
    const fnStart = rustEngineSource.indexOf('pub fn add_strikeout_annotation(');
    const fnEnd = rustEngineSource.indexOf('\n    }', fnStart) + 6;
    const fnBody = rustEngineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('quad_points');
  });

  it('calls sync_after_mutation', () => {
    const fnStart = rustEngineSource.indexOf('pub fn add_strikeout_annotation(');
    const fnEnd = rustEngineSource.indexOf('\n    }', fnStart) + 6;
    const fnBody = rustEngineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('sync_after_mutation()');
  });

  it('add_strikeout_annotation Tauri command is registered in lib.rs', () => {
    expect(rustLibSource).toContain('add_strikeout_annotation,');
  });

  it('Tauri command delegates to OpenDocument method', () => {
    const fnStart = rustLibSource.indexOf('fn add_strikeout_annotation(');
    const fnEnd = rustLibSource.indexOf('\n}', fnStart) + 2;
    const fnBody = rustLibSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('doc.add_strikeout_annotation(');
  });
});

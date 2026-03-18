// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const modelSource = readFileSync(
  new URL('../src/core/document/model.ts', import.meta.url),
  'utf8'
);

const annotEngineSource = readFileSync(
  new URL('../src/platform/engine/tauri/TauriAnnotationEngine.ts', import.meta.url),
  'utf8'
);

const annotOverlaySource = readFileSync(
  new URL('../src/viewer/components/AnnotationOverlay.tsx', import.meta.url),
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

const pdfEngineSource = readFileSync(
  new URL('../src-tauri/src/pdf_engine.rs', import.meta.url),
  'utf8'
);

const libSource = readFileSync(
  new URL('../src-tauri/src/lib.rs', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// AnnotationType — redaction is a recognised type
// ---------------------------------------------------------------------------

describe('AnnotationType — includes redaction', () => {
  it("'redaction' is a member of the AnnotationType union", () => {
    expect(modelSource).toContain("| 'redaction'");
  });

  it('redaction is described as marking content for permanent removal', () => {
    const redactIdx = modelSource.indexOf("| 'redaction'");
    const line = modelSource.slice(redactIdx, redactIdx + 100);
    expect(line).toContain('permanent');
  });
});

// ---------------------------------------------------------------------------
// TauriAnnotationEngine — redaction in type lists
// ---------------------------------------------------------------------------

describe('TauriAnnotationEngine — redaction in type lists', () => {
  it("includes 'redaction' in SUPPORTED_TYPES", () => {
    const start = annotEngineSource.indexOf('const SUPPORTED_TYPES');
    const end = annotEngineSource.indexOf('];', start) + 2;
    const block = annotEngineSource.slice(start, end);
    expect(block).toContain("'redaction'");
  });

  it("includes 'redaction' in ALL_TYPES", () => {
    const start = annotEngineSource.indexOf('const ALL_TYPES');
    const end = annotEngineSource.indexOf('];', start) + 2;
    const block = annotEngineSource.slice(start, end);
    expect(block).toContain("'redaction'");
  });
});

// ---------------------------------------------------------------------------
// AnnotationOverlay — redaction renders as black rectangle
// ---------------------------------------------------------------------------

describe('AnnotationOverlay — redaction annotation rendering', () => {
  it("renders a redaction branch for t === 'redaction'", () => {
    expect(annotOverlaySource).toContain("t === 'redaction'");
  });

  it('redaction marker has data-redaction="true"', () => {
    expect(annotOverlaySource).toContain('data-redaction="true"');
  });

  it('redaction fill is black', () => {
    const redactIdx = annotOverlaySource.indexOf("t === 'redaction'");
    const block = annotOverlaySource.slice(redactIdx, redactIdx + 500);
    expect(block).toContain('fill="black"');
  });

  it('redaction fill opacity is 0.7 by default', () => {
    const redactIdx = annotOverlaySource.indexOf("t === 'redaction'");
    const block = annotOverlaySource.slice(redactIdx, redactIdx + 500);
    expect(block).toContain("'0.7'");
  });

  it('redaction fill opacity increases to 0.85 on hover', () => {
    const redactIdx = annotOverlaySource.indexOf("t === 'redaction'");
    const block = annotOverlaySource.slice(redactIdx, redactIdx + 500);
    expect(block).toContain("'0.85'");
  });

  it('redaction marker has dashed stroke when not selected', () => {
    const redactIdx = annotOverlaySource.indexOf("t === 'redaction'");
    const block = annotOverlaySource.slice(redactIdx, redactIdx + 700);
    expect(block).toContain('strokeDasharray');
  });

  it('redaction marker is placed before highlight branch in the source', () => {
    const redactIdx = annotOverlaySource.indexOf("t === 'redaction'");
    const highlightIdx = annotOverlaySource.indexOf("t === 'highlight'");
    expect(redactIdx).toBeLessThan(highlightIdx);
  });
});

// ---------------------------------------------------------------------------
// Rust backend — add_redaction_annotation
// ---------------------------------------------------------------------------

describe('Rust — add_redaction_annotation in pdf_engine.rs', () => {
  it('defines add_redaction_annotation method', () => {
    expect(pdfEngineSource).toContain('pub fn add_redaction_annotation(');
  });

  it('uses /Subtype /Redact annotation dictionary', () => {
    const fnStart = pdfEngineSource.indexOf('pub fn add_redaction_annotation(');
    const fnEnd = pdfEngineSource.indexOf('sync_after_mutation()', fnStart) + 25;
    const fnBody = pdfEngineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('"Redact"');
  });

  it('sets /IC to black (interior fill color for applied redaction)', () => {
    const fnStart = pdfEngineSource.indexOf('pub fn add_redaction_annotation(');
    const fnEnd = pdfEngineSource.indexOf('sync_after_mutation()', fnStart) + 25;
    const fnBody = pdfEngineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('"IC"');
    expect(fnBody).toContain('0.0f32');
  });

  it('sets /CA for semi-transparent preview opacity', () => {
    const fnStart = pdfEngineSource.indexOf('pub fn add_redaction_annotation(');
    const fnEnd = pdfEngineSource.indexOf('sync_after_mutation()', fnStart) + 25;
    const fnBody = pdfEngineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('"CA"');
    expect(fnBody).toContain('0.7f32');
  });

  it('calls add_annotation_to_page', () => {
    const fnStart = pdfEngineSource.indexOf('pub fn add_redaction_annotation(');
    const fnEnd = pdfEngineSource.indexOf('sync_after_mutation()', fnStart) + 25;
    const fnBody = pdfEngineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('add_annotation_to_page');
  });
});

// ---------------------------------------------------------------------------
// Rust backend — Tauri command registration
// ---------------------------------------------------------------------------

describe('Rust — add_redaction_annotation Tauri command', () => {
  it('registers add_redaction_annotation as a Tauri command', () => {
    expect(libSource).toContain('fn add_redaction_annotation(');
  });

  it('command is included in invoke_handler', () => {
    const handlerStart = libSource.indexOf('invoke_handler(');
    const handlerEnd = libSource.indexOf('])', handlerStart) + 2;
    const handler = libSource.slice(handlerStart, handlerEnd);
    expect(handler).toContain('add_redaction_annotation');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — handleRedactionDraw callback
// ---------------------------------------------------------------------------

describe('ViewerApp — handleRedactionDraw', () => {
  it('is defined as a useCallback', () => {
    expect(viewerAppSource).toContain('const handleRedactionDraw = useCallback(');
  });

  it('invokes add_redaction_annotation backend command', () => {
    const fnStart = viewerAppSource.indexOf('const handleRedactionDraw = useCallback(');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("invoke('add_redaction_annotation'");
  });

  it('passes backendRect as [x, y, x+width, y+height]', () => {
    const fnStart = viewerAppSource.indexOf('const handleRedactionDraw = useCallback(');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('rect.x + rect.width');
    expect(fnBody).toContain('rect.y + rect.height');
  });

  it('calls refetchComments after creating annotation', () => {
    const fnStart = viewerAppSource.indexOf('const handleRedactionDraw = useCallback(');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('refetchComments()');
  });

  it('calls markDirty after creating annotation', () => {
    const fnStart = viewerAppSource.indexOf('const handleRedactionDraw = useCallback(');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('markDirty()');
  });
});

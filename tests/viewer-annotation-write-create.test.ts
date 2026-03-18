// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const tauriAnnotSource = readFileSync(
  new URL('../src/platform/engine/tauri/TauriAnnotationEngine.ts', import.meta.url),
  'utf8'
);

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

const modeToolbarSource = readFileSync(
  new URL('../src/viewer/components/ModeToolbar.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// TauriAnnotationEngine — createAnnotation wired to add_comment_annotation
// ---------------------------------------------------------------------------

describe('TauriAnnotationEngine — createAnnotation', () => {
  it('no longer returns notImpl for createAnnotation', () => {
    const fnStart = tauriAnnotSource.indexOf('async createAnnotation(');
    const fnEnd = tauriAnnotSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = tauriAnnotSource.slice(fnStart, fnEnd);
    expect(fnBody).not.toContain("notImpl('createAnnotation");
  });

  it('guards against non-text types', () => {
    const fnStart = tauriAnnotSource.indexOf('async createAnnotation(');
    const fnEnd = tauriAnnotSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = tauriAnnotSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("type !== 'text'");
    expect(fnBody).toContain('notImpl(');
  });

  it('calls invoke add_comment_annotation', () => {
    const fnStart = tauriAnnotSource.indexOf('async createAnnotation(');
    const fnEnd = tauriAnnotSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = tauriAnnotSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("invoke('add_comment_annotation'");
  });

  it('passes pageIndex, x, y, text to add_comment_annotation', () => {
    const fnStart = tauriAnnotSource.indexOf('async createAnnotation(');
    const fnEnd = tauriAnnotSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = tauriAnnotSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('pageIndex');
    expect(fnBody).toContain('bounds.x');
    expect(fnBody).toContain('bounds.y');
    expect(fnBody).toContain('properties.contents');
  });

  it('returns a placeholder annotation with id pending-refetch', () => {
    const fnStart = tauriAnnotSource.indexOf('async createAnnotation(');
    const fnEnd = tauriAnnotSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = tauriAnnotSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('pending-refetch');
  });

  it('returns success: true on success', () => {
    const fnStart = tauriAnnotSource.indexOf('async createAnnotation(');
    const fnEnd = tauriAnnotSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = tauriAnnotSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('success: true');
  });

  it('returns internal-error on invoke failure', () => {
    const fnStart = tauriAnnotSource.indexOf('async createAnnotation(');
    const fnEnd = tauriAnnotSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = tauriAnnotSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("code: 'internal-error'");
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — handleAddComment wiring
// ---------------------------------------------------------------------------

describe('ViewerApp — handleAddComment', () => {
  it('declares handleAddComment callback', () => {
    expect(viewerAppSource).toContain('handleAddComment');
  });

  it('calls createAnnotation with type text', () => {
    const fnStart = viewerAppSource.indexOf('handleAddComment');
    const fnEnd = viewerAppSource.indexOf('[pdfDoc, engine, pageIndex]', fnStart) + 30;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("'text'");
  });

  it('uses page center as annotation position', () => {
    const fnStart = viewerAppSource.indexOf('handleAddComment');
    const fnEnd = viewerAppSource.indexOf('[pdfDoc, engine, pageIndex]', fnStart) + 30;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('page.size.width / 2');
    expect(fnBody).toContain('page.size.height / 2');
  });

  it('calls loadAnnotations after createAnnotation succeeds', () => {
    const fnStart = viewerAppSource.indexOf('handleAddComment');
    const fnEnd = viewerAppSource.indexOf('[pdfDoc, engine, pageIndex]', fnStart) + 30;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('result.success');
    expect(fnBody).toContain('loadAnnotations(pdfDoc)');
  });

  it('calls setAllAnnotations with the full re-fetched annotations list', () => {
    // Filtering to text-only happens in the comments useMemo, not in handleAddComment.
    const fnStart = viewerAppSource.indexOf('handleAddComment');
    const fnEnd = viewerAppSource.indexOf('[pdfDoc, engine, pageIndex]', fnStart) + 30;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('setAllAnnotations(annotResult.value)');
  });

  it('re-fetches all annotations (not just text) after creating a comment', () => {
    const fnStart = viewerAppSource.indexOf('handleAddComment');
    const fnEnd = viewerAppSource.indexOf('[pdfDoc, engine, pageIndex]', fnStart) + 30;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('setAllAnnotations(');
  });

  it('passes onAddComment to ModeToolbar', () => {
    expect(viewerAppSource).toContain('onAddComment={handleAddComment}');
  });
});

// ---------------------------------------------------------------------------
// ModeToolbar — add-comment button in review mode
// ---------------------------------------------------------------------------

describe('ModeToolbar — add-comment button', () => {
  it('accepts onAddComment prop in ModeToolbarProps', () => {
    expect(modeToolbarSource).toContain('onAddComment');
  });

  it('renders add-comment-btn testid in review mode', () => {
    expect(modeToolbarSource).toContain('data-testid="add-comment-btn"');
  });

  it('button calls onAddComment on click', () => {
    const btnIdx = modeToolbarSource.indexOf('data-testid="add-comment-btn"');
    const surroundingBlock = modeToolbarSource.slice(btnIdx - 100, btnIdx + 200);
    expect(surroundingBlock).toContain('onAddComment');
    expect(surroundingBlock).toContain('onClick');
  });

  it('button only renders when mode is review and pageCount > 0', () => {
    const reviewIdx = modeToolbarSource.indexOf('data-testid="add-comment-btn"');
    const guardSlice = modeToolbarSource.slice(reviewIdx - 200, reviewIdx);
    expect(guardSlice).toContain("mode === 'review'");
    expect(guardSlice).toContain('pageCount > 0');
  });

  it('button label is Opmerking', () => {
    expect(modeToolbarSource).toContain('Opmerking');
  });

  it('imports PlusIcon from lucide-react', () => {
    expect(modeToolbarSource).toContain('PlusIcon');
  });
});

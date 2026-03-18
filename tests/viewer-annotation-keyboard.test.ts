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
// ViewerApp — Delete key shortcut for selected annotation
// ---------------------------------------------------------------------------

describe('ViewerApp — Delete key shortcut deletes selected annotation', () => {
  it('has a useEffect with a Delete keydown handler', () => {
    expect(viewerAppSource).toContain("e.key !== 'Delete'");
  });

  it('also handles Backspace key', () => {
    expect(viewerAppSource).toContain("e.key !== 'Backspace'");
  });

  it('guards against INPUT, TEXTAREA and SELECT targets', () => {
    // Find the Delete key handler block
    const deleteKeyIdx = viewerAppSource.indexOf("e.key !== 'Delete'");
    const surrounding = viewerAppSource.slice(deleteKeyIdx, deleteKeyIdx + 300);
    expect(surrounding).toContain('INPUT');
    expect(surrounding).toContain('TEXTAREA');
    expect(surrounding).toContain('SELECT');
  });

  it('returns early when selectedAnnotationId is null', () => {
    const deleteKeyIdx = viewerAppSource.indexOf("e.key !== 'Delete'");
    const surrounding = viewerAppSource.slice(deleteKeyIdx, deleteKeyIdx + 300);
    expect(surrounding).toContain('selectedAnnotationId');
  });

  it('calls handleDeleteSelectedAnnotation with selectedAnnotationId', () => {
    const deleteKeyIdx = viewerAppSource.indexOf("e.key !== 'Delete'");
    const surrounding = viewerAppSource.slice(deleteKeyIdx, deleteKeyIdx + 400);
    expect(surrounding).toContain('handleDeleteSelectedAnnotation(selectedAnnotationId)');
  });

  it('adds and removes the keydown event listener', () => {
    const deleteKeyIdx = viewerAppSource.indexOf("e.key !== 'Delete'");
    const surrounding = viewerAppSource.slice(deleteKeyIdx - 200, deleteKeyIdx + 400);
    expect(surrounding).toContain("addEventListener('keydown'");
    expect(surrounding).toContain("removeEventListener('keydown'");
  });

  it('effect depends on selectedAnnotationId and handleDeleteSelectedAnnotation', () => {
    const deleteKeyIdx = viewerAppSource.indexOf("e.key !== 'Delete'");
    const surrounding = viewerAppSource.slice(deleteKeyIdx - 200, deleteKeyIdx + 500);
    expect(surrounding).toContain('[selectedAnnotationId, handleDeleteSelectedAnnotation]');
  });
});

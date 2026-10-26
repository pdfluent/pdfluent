// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// The text box, image, stamp and signature placements used to make React
// overlays that looked placed and were gone on save; this file kept them
// fenced off behind LOCAL_OVERLAY_CONTROLS_ENABLED. They now write into the
// PDF (src/viewer/v3/placement.ts, proven against the file by
// src-tauri/tests/annotations_persist.rs), so the fence is gone and what this
// file guards is that no overlay-only placement comes back.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const editorV3ShellSource = readFileSync(
  new URL('../src/viewer/v3/EditorV3Shell.tsx', import.meta.url),
  'utf8'
);

describe('EditorV3Shell — no overlay-only placement', () => {
  it('keeps no local overlay state that a save would drop', () => {
    expect(editorV3ShellSource).not.toContain('localOverlays');
    expect(editorV3ShellSource).not.toContain('LOCAL_OVERLAY_CONTROLS_ENABLED');
  });

  it('places through the backend', () => {
    const start = editorV3ShellSource.indexOf('// A click on the page with a placement armed writes it into the PDF.');
    const route = editorV3ShellSource.slice(start, editorV3ShellSource.indexOf('const commitTextOverlayDraft', start));
    expect(start).toBeGreaterThan(-1);
    expect(route).toContain('onPlaceAnnotation(placement, pageIdx, point, size)');
  });

  it('disarms every placement when the document id changes', () => {
    expect(editorV3ShellSource).toMatch(
      /setArmed\(null\);[\s\S]*setPendingSignature\(null\);[\s\S]*setTextOverlayDraft\(null\);[\s\S]*}, \[pdfDoc\?\.id\]\);/
    );
  });
});

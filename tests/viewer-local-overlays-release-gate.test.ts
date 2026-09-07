// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const editorV3ShellSource = readFileSync(
  new URL('../src/viewer/v3/EditorV3Shell.tsx', import.meta.url),
  'utf8'
);

describe('EditorV3Shell — no false overlay persistence', () => {
  it('keeps local-only placement controls disabled until native persistence exists', () => {
    expect(editorV3ShellSource).toContain('const LOCAL_OVERLAY_CONTROLS_ENABLED = false');
    expect(editorV3ShellSource).toMatch(
      /LOCAL_OVERLAY_CONTROLS_ENABLED && \(\s*<>[\s\S]*<div className="panel-section-label">\{t\('editorV3\.edit\.addContent'\)\}/
    );
    expect(editorV3ShellSource).toMatch(
      /LOCAL_OVERLAY_CONTROLS_ENABLED && \(\s*<>[\s\S]*<button className="btn-ghost" onClick=\{onOpenSignModal\}/
    );
  });

  it('clears every local overlay state value when the document id changes', () => {
    expect(editorV3ShellSource).toMatch(
      /setIsInsertingText\(false\);[\s\S]*setIsInsertingImage\(false\);[\s\S]*setPendingSignature\(null\);[\s\S]*setLocalOverlays\(\[\]\);[\s\S]*setTextOverlayDraft\(null\);[\s\S]*}, \[pdfDoc\?\.id\]\);/
    );
  });

  it('does not mark the PDF dirty for local-only overlay changes', () => {
    const overlayRouteStart = editorV3ShellSource.indexOf('// Click handler to place text, images, or signature on canvas');
    const overlayRouteEnd = editorV3ShellSource.indexOf('const [readPaused', overlayRouteStart);
    const overlayRoute = editorV3ShellSource.slice(overlayRouteStart, overlayRouteEnd);
    expect(overlayRoute).not.toContain('onDocumentMutated');
  });
});

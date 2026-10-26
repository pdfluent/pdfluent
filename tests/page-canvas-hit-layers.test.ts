// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-45 (Windows): a click on a picture landed on div.pdf-text-layer because
// the layers above the annotation markers were page-sized boxes that take the
// pointer. jsdom has no layout, so the real hit test is the coveredBy check in
// tests/journeys/J-45-page-images.e2e.ts (both OS journey jobs). This file
// pins the rule the fix rests on, so a refactor cannot drop it unseen.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const canvas = readFileSync(new URL('../src/viewer/components/PageCanvas.tsx', import.meta.url), 'utf8');
const textLayer = readFileSync(new URL('../src/viewer/components/TextLayer.tsx', import.meta.url), 'utf8');

/** The style object of the wrapper div that holds `child`. */
function wrapperOf(child: string): string {
  const at = canvas.indexOf(child);
  expect(at, `${child} is rendered by PageCanvas`).toBeGreaterThan(-1);
  const open = canvas.lastIndexOf('<div style={{', at);
  return canvas.slice(open, canvas.indexOf('}}>', open));
}

describe('layers above the annotation markers do not swallow clicks', () => {
  it('the OCR and text-interaction wrappers are transparent to the pointer', () => {
    expect(wrapperOf('<OcrOverlay')).toContain("pointerEvents: 'none'");
    expect(wrapperOf('<TextInteractionOverlay')).toContain("pointerEvents: 'none'");
  });

  it('in edit mode the text layer wrapper and the layer let clicks through', () => {
    expect(wrapperOf('<TextLayer')).toContain("pointerEvents: isEditMode ? 'none' : undefined");
    expect(canvas).toContain('passThrough={isEditMode}');
    expect(textLayer).toContain("pointerEvents: passThrough ? 'none' : 'auto'");
  });

  it('the words themselves keep the pointer, so text stays selectable', () => {
    const span = textLayer.slice(textLayer.indexOf('data-testid="text-span"'));
    expect(span.slice(0, 900)).toContain("pointerEvents: 'auto'");
  });
});

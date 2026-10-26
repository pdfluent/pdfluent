// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// Multi-line editing (J-42): the backend takes the first line of a paragraph as
// the one the reflow starts from and reads the rewrapped lines back from there
// downwards (replace_paragraph in src-tauri/src/pdf_engine.rs). The paragraph
// therefore has to list its lines top to bottom whatever order the spans came
// in. src-tauri/tests/paragraph_edit.rs proves what is written from that.

import { describe, it, expect } from 'vitest';
import { groupDigitalTextSpans } from '../textGrouping';
import type { TextSpan } from '../../../core/document';

function span(text: string, x: number, y: number): TextSpan {
  return { text, rect: { x, y, width: 160, height: 12 }, fontSize: 12, widthSource: 'Metric' } as TextSpan;
}

const TOP = span('The quick brown fox jumps over', 72, 700);
const MIDDLE = span('the lazy dog and keeps running', 72, 686);
const BOTTOM = span('until the end of the paragraph.', 72, 672);

describe('paragraph line order', () => {
  it.each([
    ['top to bottom', [TOP, MIDDLE, BOTTOM]],
    ['bottom to top', [BOTTOM, MIDDLE, TOP]],
    ['shuffled', [MIDDLE, BOTTOM, TOP]],
  ])('spans given %s become one paragraph listed top to bottom', (_name, spans) => {
    const { paragraphs } = groupDigitalTextSpans(spans, 0);
    expect(paragraphs).toHaveLength(1);
    const lines = paragraphs[0]!.lines.map(l => l.spans.map(s => s.text).join(' '));
    expect(lines).toEqual([TOP.text, MIDDLE.text, BOTTOM.text]);
  });
});

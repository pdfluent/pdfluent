// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// #640: paragraphs are grouped inside the extraction engine's blocks. Two
// lines the heuristics would join (same size, close, overlapping) stay apart
// when the engine says they are different blocks — a list item and the next,
// two table cells, a caption under a figure. src-tauri/tests/text_blocks.rs
// proves the blocks the backend sends.

import { describe, it, expect } from 'vitest';
import { groupDigitalTextSpans, engineBlockOf, type EngineTextBlock } from '../textGrouping';
import type { TextSpan } from '../../../core/document';

function span(text: string, x: number, y: number, w = 160, h = 12): TextSpan {
  return { text, rect: { x, y, width: w, height: h }, fontSize: 12, widthSource: 'Metric' } as TextSpan;
}

// Two lines 14 pt apart: one paragraph by the gap rule.
const LINES = [span('First item of the list', 72, 700), span('Second item of the list', 72, 686)];

describe('grouping with engine blocks', () => {
  it('without blocks the two close lines are one paragraph (the heuristic)', () => {
    expect(groupDigitalTextSpans(LINES, 0).paragraphs).toHaveLength(1);
  });

  it('two engine blocks keep them two paragraphs', () => {
    const blocks: EngineTextBlock[] = [
      { kind: 'other', bbox: [70, 698, 240, 713] },
      { kind: 'other', bbox: [70, 684, 240, 699] },
    ];
    expect(groupDigitalTextSpans(LINES, 0, blocks).paragraphs).toHaveLength(2);
  });

  it('one engine block around both keeps them one paragraph', () => {
    const blocks: EngineTextBlock[] = [{ kind: 'paragraph', bbox: [70, 684, 240, 713] }];
    expect(groupDigitalTextSpans(LINES, 0, blocks).paragraphs).toHaveLength(1);
  });

  it('a line outside every block leaves the decision to the heuristics', () => {
    const blocks: EngineTextBlock[] = [{ kind: 'paragraph', bbox: [70, 698, 240, 713] }];
    expect(groupDigitalTextSpans(LINES, 0, blocks).paragraphs).toHaveLength(1);
  });

  it('engineBlockOf finds the block holding a rect centre', () => {
    const blocks: EngineTextBlock[] = [{ kind: 'a', bbox: [0, 0, 10, 10] }, { kind: 'b', bbox: [20, 0, 30, 10] }];
    expect(engineBlockOf({ x: 21, y: 2, width: 4, height: 4 }, blocks)).toBe(1);
    expect(engineBlockOf({ x: 50, y: 50, width: 1, height: 1 }, blocks)).toBe(-1);
  });
});

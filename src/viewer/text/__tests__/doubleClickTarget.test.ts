// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-42: a double-click on a line of a multi-line paragraph opens the whole
// paragraph; a single line, or a line with several font runs, stays a line.

import { describe, expect, it } from 'vitest';
import { chooseDoubleClickTarget } from '../doubleClickTarget';
import type { TextParagraphTarget } from '../textInteractionModel';

const span = (id: string) => ({ id }) as never;
const line = (id: string, spans: number) => ({
  kind: 'line', id, source: 'digital', baselineY: 0, rect: { x: 0, y: 0, width: 1, height: 1 },
  spans: Array.from({ length: spans }, (_, i) => span(`${id}-${i}`)),
}) as never;
const para = (lines: unknown[]): TextParagraphTarget =>
  ({ kind: 'paragraph', id: 'p', source: 'digital', rect: { x: 0, y: 0, width: 1, height: 1 }, lines }) as unknown as TextParagraphTarget;
const lineLevel = para([line('only', 1)]);

describe('chooseDoubleClickTarget', () => {
  it('opens a paragraph of single-run lines as a whole', () => {
    const p = para([line('a', 1), line('b', 1), line('c', 1)]);
    expect(chooseDoubleClickTarget(p, () => lineLevel)).toBe(p);
  });

  it('keeps the line for a one-line paragraph', () => {
    expect(chooseDoubleClickTarget(para([line('a', 1)]), () => lineLevel)).toBe(lineLevel);
  });

  it('keeps the line when a line has several font runs', () => {
    expect(chooseDoubleClickTarget(para([line('a', 1), line('b', 2)]), () => lineLevel)).toBe(lineLevel);
  });

  it('keeps the line when no paragraph was hit', () => {
    expect(chooseDoubleClickTarget(null, () => lineLevel)).toBe(lineLevel);
  });
});

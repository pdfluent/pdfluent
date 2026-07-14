// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * Collapse a set of 0-based page indices into 1-based, inclusive range strings
 * for the backend `split_pdf` command (its `parse_page_range` accepts "3-7" or
 * a single "5"). Contiguous runs collapse into one range; input is deduped,
 * filtered to valid non-negative integers, and sorted ascending.
 *
 * Examples:
 *   [0, 1, 2, 5, 6] -> ["1-3", "6-7"]
 *   [3]             -> ["4"]
 *   [0, 2, 4]       -> ["1", "3", "5"]
 *   []              -> []
 */
export function pageIndicesToRanges(indices: number[]): string[] {
  const sorted = Array.from(new Set(indices))
    .filter((n) => Number.isInteger(n) && n >= 0)
    .sort((a, b) => a - b);

  const ranges: string[] = [];
  let start = -1;
  let prev = -1;

  const flush = () => {
    if (start === -1) return;
    ranges.push(start === prev ? `${start + 1}` : `${start + 1}-${prev + 1}`);
  };

  for (const idx of sorted) {
    if (start === -1) {
      start = idx;
      prev = idx;
    } else if (idx === prev + 1) {
      prev = idx;
    } else {
      flush();
      start = idx;
      prev = idx;
    }
  }
  flush();

  return ranges;
}

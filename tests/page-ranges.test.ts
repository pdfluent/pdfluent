// SPDX-License-Identifier: LicenseRef-PDFluent-Proprietary
// Copyright (c) 2026 PDFluent Contributors

import { describe, expect, it } from "vitest";
import { pageIndicesToRanges } from "../src/viewer/components/pageRanges";

describe("pageIndicesToRanges (split-by-range)", () => {
  it("collapses contiguous 0-based indices into 1-based inclusive ranges", () => {
    expect(pageIndicesToRanges([0, 1, 2, 5, 6])).toEqual(["1-3", "6-7"]);
  });

  it("emits single-page ranges as a bare 1-based number", () => {
    expect(pageIndicesToRanges([3])).toEqual(["4"]);
    expect(pageIndicesToRanges([0, 2, 4])).toEqual(["1", "3", "5"]);
  });

  it("sorts and dedupes unordered/duplicate input", () => {
    expect(pageIndicesToRanges([2, 0, 1])).toEqual(["1-3"]);
    expect(pageIndicesToRanges([0, 0, 1])).toEqual(["1-2"]);
  });

  it("drops invalid (negative / non-integer) indices", () => {
    expect(pageIndicesToRanges([-1, 0, 1.5, 2])).toEqual(["1", "3"]);
  });

  it("returns an empty array for an empty selection", () => {
    expect(pageIndicesToRanges([])).toEqual([]);
  });
});

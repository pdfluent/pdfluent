// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const viewerSource = readFileSync(
  new URL("../src/components/Viewer.tsx", import.meta.url),
  "utf8",
);
const cssSource = readFileSync(new URL("../src/styles/global.css", import.meta.url), "utf8");

describe("viewer search highlights", () => {
  it("accepts active and per-line search match props", () => {
    expect(viewerSource).toContain("searchLineIndexes: number[];");
    expect(viewerSource).toContain("activeSearchLineIndex: number | null;");
    expect(viewerSource).toContain("const searchLineIndexSet = useMemo(");
  });

  it("renders non-interactive search overlays", () => {
    expect(viewerSource).toContain("viewer-search-layer");
    expect(viewerSource).toContain("viewer-search-highlight-active");
    expect(viewerSource).toContain("searchLineIndexSet.has(line.lineIndex)");
    expect(cssSource).toContain(".viewer-search-layer");
    expect(cssSource).toContain(".viewer-search-highlight-active");
  });
});

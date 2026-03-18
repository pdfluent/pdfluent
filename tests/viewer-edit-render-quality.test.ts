// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getSinglePageRenderRatio,
  getSinglePageRenderScale,
} from "../src/components/Viewer";

const viewerSource = readFileSync(
  new URL("../src/components/Viewer.tsx", import.meta.url),
  "utf8",
);

describe("viewer edit render quality", () => {
  it("enables high-DPI ratio in edit mode only", () => {
    expect(getSinglePageRenderRatio("none", false, 2)).toBe(1);
    expect(getSinglePageRenderRatio("highlight", false, 2)).toBe(2);
    expect(getSinglePageRenderRatio("none", true, 2)).toBe(2);
    expect(getSinglePageRenderRatio("pen", false, 5)).toBe(3);
  });

  it("caps render scale to backend-safe limits", () => {
    expect(getSinglePageRenderScale(1.5, "none", false, 2)).toBe(1.5);
    expect(getSinglePageRenderScale(1.5, "pen", false, 2)).toBe(3);
    expect(getSinglePageRenderScale(5, "pen", false, 2)).toBe(8);
  });

  it("applies pixel budget for oversized pages", () => {
    const unclamped = getSinglePageRenderScale(1.5, "pen", false, 2);
    expect(unclamped).toBe(3);

    const clamped = getSinglePageRenderScale(
      1.5,
      "pen",
      false,
      2,
      3000,
      4000,
    );
    expect(clamped).toBeLessThan(3);
    expect(clamped).toBeGreaterThan(0.1);
  });

  it("renders single-page image at render scale but displays at UI scale", () => {
    expect(viewerSource).toContain("const singlePageRenderRatio = useMemo(");
    expect(viewerSource).toContain("const singlePageRenderScale = useMemo(");
    expect(viewerSource).toContain("renderPage(currentPage, singlePageRenderScale)");
    expect(viewerSource).toContain("const singlePageDisplayWidth = useMemo(() => {");
    expect(viewerSource).toContain("if (currentPageInfo) {");
    expect(viewerSource).toContain("currentPageInfo.width_pt * scale");
    expect(viewerSource).toContain("renderedPage.width / singlePageRenderRatio");
    expect(viewerSource).toContain("single_page_render_start");
    expect(viewerSource).toContain("single_page_render_success");
  });
});

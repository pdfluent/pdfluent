// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getContinuousLoadTargetPages,
  getContinuousTargetPages,
  getNativePdfViewFragment,
  shouldShowSelectableTextLayer,
  shouldUseNativeContinuousViewer,
} from "../src/components/Viewer";

const viewerSource = readFileSync(
  new URL("../src/components/Viewer.tsx", import.meta.url),
  "utf8",
);

describe("continuous viewer windowed rendering", () => {
  it("keeps native continuous viewer active for every continuous-mode state", () => {
    expect(
      shouldUseNativeContinuousViewer("continuous", "none", false),
    ).toBe(true);
    expect(
      shouldUseNativeContinuousViewer("single", "none", false),
    ).toBe(false);
    expect(
      shouldUseNativeContinuousViewer("continuous", "highlight", false),
    ).toBe(true);
    expect(
      shouldUseNativeContinuousViewer("continuous", "none", true),
    ).toBe(true);
  });

  it("formats native PDF fragment with page and zoom", () => {
    expect(getNativePdfViewFragment(0, 1)).toBe("#page=1&zoom=100");
    expect(getNativePdfViewFragment(8, 1.5)).toBe("#page=9&zoom=150");
    expect(getNativePdfViewFragment(8, 0.05)).toBe("#page=9&zoom=25");
  });

  it("shows selectable text layer in single mode regardless of tool/native state", () => {
    expect(shouldShowSelectableTextLayer("single", "none", false, 4)).toBe(true);
    expect(shouldShowSelectableTextLayer("single", "none", true, 4)).toBe(true);
    expect(shouldShowSelectableTextLayer("continuous", "none", false, 4)).toBe(false);
    expect(shouldShowSelectableTextLayer("single", "highlight", false, 4)).toBe(true);
    expect(shouldShowSelectableTextLayer("single", "none", false, 0)).toBe(false);
  });

  it("builds a stable target window around current page", () => {
    expect(getContinuousTargetPages(8, 33)).toEqual([
      0, 1, 2, 5, 6, 7, 8, 9, 10, 11,
    ]);
    expect(getContinuousTargetPages(0, 4)).toEqual([0, 1, 2, 3]);
  });

  it("merges current, viewport and visible windows without duplicates", () => {
    const targets = getContinuousLoadTargetPages(
      8,
      0,
      33,
      new Set([0, 1]),
    );
    expect(targets).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("expands targets with additional visible pages", () => {
    const targets = getContinuousLoadTargetPages(
      12,
      12,
      33,
      new Set([20]),
    );
    expect(targets).toEqual([
      0, 1, 2, 9, 10, 11, 12, 13, 14, 15, 17, 18, 19, 20, 21, 22, 23,
    ]);
  });

  it("limits render work to a sliding page window", () => {
    expect(viewerSource).toContain("const CONTINUOUS_PAGE_BUFFER = 3;");
    expect(viewerSource).toContain("const [continuousViewportPage, setContinuousViewportPage] = useState(0);");
    expect(viewerSource).toContain(
      "const [continuousVisiblePages, setContinuousVisiblePages] = useState<Set<number>>(",
    );
    expect(viewerSource).toContain(
      "const [nativePdfBaseUrl, setNativePdfBaseUrl] = useState<string | null>(null);",
    );
    expect(viewerSource).toContain("getContinuousTargetPages(currentPage, pageCount)");
    expect(viewerSource).toContain("getContinuousLoadTargetPages(");
    expect(viewerSource).toContain("continuousVisiblePages,");
    expect(viewerSource).toContain("native_pdf_source_prepare_start");
    expect(viewerSource).toContain("const sourceUrl = convertFileSrc(filePath);");
    expect(viewerSource).toContain("native_pdf_base_source_active");
    expect(viewerSource).toContain("if (isNativeContinuousViewer) {");
    expect(viewerSource).toContain("return nativePdfBaseUrl;");
    expect(viewerSource).toContain("if (isNativeContinuousViewer && nativePdfSrc) {");
    expect(viewerSource).toContain("native_pdf_iframe_loaded");
    expect(viewerSource).toContain("viewer-text-selection-layer");
    expect(viewerSource).toContain("single_page_text_layer_ready");
    expect(viewerSource).toContain("retainMapEntries");
    expect(viewerSource).toContain("retainSetEntries");
  });

  it("caps continuous render scale to avoid memory spikes", () => {
    expect(viewerSource).toContain("const CONTINUOUS_MAX_RENDER_SCALE = 1;");
    expect(viewerSource).toContain(
      "renderPage(index, Math.min(scale, CONTINUOUS_MAX_RENDER_SCALE))",
    );
  });

  it("forces initial continuous view sync to current page", () => {
    expect(viewerSource).toContain("const visiblePageRef = useRef(-1);");
    expect(viewerSource).toContain("const suppressScrollSyncRef = useRef(false);");
    expect(viewerSource).toContain("const container = containerRef.current;");
    expect(viewerSource).toContain("if (suppressScrollSyncRef.current) {");
    expect(viewerSource).toContain("if (!target) return;");
    expect(viewerSource).toContain(
      "container.scrollTo({ top: target.offsetTop, behavior: \"auto\" });",
    );
    expect(viewerSource).toContain("visiblePageRef.current = currentPage;");
    expect(viewerSource).toContain("rootMargin: \"220px 0px 220px 0px\",");
    expect(viewerSource).toContain("threshold: [0, 0.05, 0.1, 0.2, 0.35, 0.5, 0.75, 1],");
  });
});

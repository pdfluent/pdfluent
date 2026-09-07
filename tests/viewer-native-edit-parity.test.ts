// SPDX-License-Identifier: LicenseRef-PDFluent-Proprietary
// Copyright (c) 2026 Innovation Trigger B.V.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const viewerSource = readFileSync(
  new URL("../src/components/Viewer.tsx", import.meta.url),
  "utf8",
);

describe("viewer native edit parity", () => {
  it("falls back to raster single mode in edit/search tool states", () => {
    expect(viewerSource).toContain('viewMode === "single"');
    expect(viewerSource).toContain('annotationTool === "none"');
    expect(viewerSource).toContain("!textEditorEnabled");
    expect(viewerSource).toContain("!hasSearchHighlights");
    expect(viewerSource).toContain(
      "const prefersNativeSingleViewer = shouldUseNativeSingleViewer(",
    );
  });

  it("renders text/search/edit overlays in the raster page stage", () => {
    expect(viewerSource).toContain("{showNativeSinglePage && nativePdfSrc && (");
    expect(viewerSource).toContain("className=\"viewer-page-native-iframe\"");
    expect(viewerSource).toContain("const showNativeSinglePage = isNativeSingleViewer && Boolean(nativePdfSrc);");
    expect(viewerSource).toContain("const showRasterPageImage = renderedPage && !isNativeSingleViewer;");
    expect(viewerSource).toContain("{showSelectableTextLayer && (");
    expect(viewerSource).toContain("viewer-search-layer");
    expect(viewerSource).toContain("viewer-text-edit-layer");
    expect(viewerSource).toContain("viewer-annotation-layer");
  });
});

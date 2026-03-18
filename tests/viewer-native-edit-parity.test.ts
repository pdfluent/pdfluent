// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const viewerSource = readFileSync(
  new URL("../src/components/Viewer.tsx", import.meta.url),
  "utf8",
);

describe("viewer native edit parity", () => {
  it("keeps native single mode enabled in edit/search tool states", () => {
    expect(viewerSource).toContain("return viewMode === \"single\";");
    expect(viewerSource).toContain(
      "const prefersNativeSingleViewer = shouldUseNativeSingleViewer(",
    );
  });

  it("renders text/search/edit overlays in the same stage as native iframe", () => {
    expect(viewerSource).toContain("{showNativeSinglePage && nativePdfSrc && (");
    expect(viewerSource).toContain("className=\"viewer-page-native-iframe\"");
    expect(viewerSource).toContain("{showSelectableTextLayer && (");
    expect(viewerSource).toContain("viewer-search-layer");
    expect(viewerSource).toContain("viewer-text-edit-layer");
    expect(viewerSource).toContain("viewer-annotation-layer");
  });
});

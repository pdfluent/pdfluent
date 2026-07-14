// SPDX-License-Identifier: LicenseRef-PDFluent-Proprietary
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { shouldUseNativeSingleViewer } from "../src/components/Viewer";

const viewerSource = readFileSync(
  new URL("../src/components/Viewer.tsx", import.meta.url),
  "utf8",
);

describe("viewer native source lifecycle", () => {
  it("prepares native pdf source only when file changes", () => {
    expect(viewerSource).toContain("appendDebugLog(\"debug\", \"native_pdf_source_prepare_start\", {");
    expect(viewerSource).toContain("const sourceUrl = convertFileSrc(filePath);");
    expect(viewerSource).toContain("}, [filePath]);");
  });

  it("clears native source when the active file is cleared", () => {
    expect(viewerSource).toContain("if (!filePath) {");
    expect(viewerSource).toContain("setNativePdfBaseUrl(null);");
    expect(viewerSource).toContain("setNativeViewerUnavailable(false);");
  });

  it("keeps iframe mount stable across fragment navigation updates", () => {
    expect(viewerSource).toContain("key={nativePdfBaseUrl ?? \"native-pdf\"}");
    expect(viewerSource).not.toContain("key={nativePdfSrc}");
  });

  it("uses native single-view rendering only for pure reading", () => {
    expect(
      shouldUseNativeSingleViewer("single", "none", false, false),
    ).toBe(true);
    expect(
      shouldUseNativeSingleViewer("single", "highlight", false, false),
    ).toBe(false);
    expect(
      shouldUseNativeSingleViewer("single", "pen", false, false),
    ).toBe(false);
    expect(
      shouldUseNativeSingleViewer("single", "none", true, false),
    ).toBe(false);
    expect(
      shouldUseNativeSingleViewer("single", "none", false, true),
    ).toBe(false);
    expect(viewerSource).toContain("export function shouldUseNativeSingleViewer(");
    expect(viewerSource).toContain('viewMode === "single"');
    expect(viewerSource).toContain('annotationTool === "none"');
    expect(viewerSource).toContain("!textEditorEnabled");
    expect(viewerSource).toContain("!hasSearchHighlights");
    expect(viewerSource).toContain(
      "const prefersNativeSingleViewer = shouldUseNativeSingleViewer(",
    );
    expect(viewerSource).toContain(
      "prefersNativeSingleViewer && !nativeViewerUnavailable && NATIVE_PDF_SUPPORTED",
    );
    expect(viewerSource).toContain("const showRasterPageImage = renderedPage && !isNativeSingleViewer;");
    expect(viewerSource).toContain("className=\"viewer-page-native-iframe\"");
  });

  it("falls back to raster rendering when native iframe lifecycle fails", () => {
    expect(viewerSource).toContain("const [nativeViewerUnavailable, setNativeViewerUnavailable] = useState(false);");
    expect(viewerSource).toContain(
      "prefersNativeContinuousViewer && !nativeViewerUnavailable",
    );
    expect(viewerSource).toContain(
      "prefersNativeSingleViewer && !nativeViewerUnavailable",
    );
    expect(viewerSource).toContain("setNativeViewerUnavailable(true);");
    expect(viewerSource).toContain("setNativeViewerUnavailable(false);");
  });
});

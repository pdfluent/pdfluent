// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isNativeViewerErrorPageContent,
  shouldShowSelectableTextLayer,
  shouldUseNativeContinuousViewer,
} from "../src/components/Viewer";

const viewerSource = readFileSync(
  new URL("../src/components/Viewer.tsx", import.meta.url),
  "utf8",
);

describe("viewer text parity across modes", () => {
  it("keeps native continuous mode active regardless edit tool state", () => {
    expect(shouldUseNativeContinuousViewer("continuous", "none", false)).toBe(true);
    expect(shouldUseNativeContinuousViewer("continuous", "pen", false)).toBe(true);
    expect(shouldUseNativeContinuousViewer("continuous", "none", true)).toBe(true);
    expect(shouldUseNativeContinuousViewer("single", "none", false)).toBe(false);
  });

  it("detects native error-page content and ignores regular text", () => {
    expect(
      isNativeViewerErrorPageContent(
        "fs:allow-app-read, fs:allow-home-read permission denied for requested capability scope",
      ),
    ).toBe(true);
    expect(isNativeViewerErrorPageContent("PDF document")).toBe(false);
    expect(isNativeViewerErrorPageContent("")).toBe(false);
  });

  it("keeps selectable text layer available in single mode across tool states", () => {
    expect(shouldShowSelectableTextLayer("single", "none", false, 1)).toBe(true);
    expect(shouldShowSelectableTextLayer("single", "highlight", false, 1)).toBe(true);
    expect(shouldShowSelectableTextLayer("single", "none", true, 1)).toBe(true);
    expect(shouldShowSelectableTextLayer("single", "none", false, 0)).toBe(false);
    expect(shouldShowSelectableTextLayer("continuous", "none", false, 4)).toBe(false);
    expect(viewerSource).toContain("return viewMode === \"continuous\";");
    expect(viewerSource).toContain(
      "return viewMode === \"single\" && textLineCount > 0;",
    );
  });
});

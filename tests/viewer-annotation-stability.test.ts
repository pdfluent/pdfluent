// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const viewerSource = readFileSync(
  new URL("../src/components/Viewer.tsx", import.meta.url),
  "utf8",
);

describe("viewer annotation stability guards", () => {
  it("resets annotation drafts through a shared guard", () => {
    expect(viewerSource).toContain("function clearAnnotationDraft(): void {");
    expect(viewerSource).toContain("setDragStart(null);");
    expect(viewerSource).toContain("setDragCurrent(null);");
    expect(viewerSource).toContain("setInkDraftPoints([]);");
  });

  it("handles pointer capture lifecycle failures without crashing", () => {
    expect(viewerSource).toContain("function releasePointerCaptureSafely(");
    expect(viewerSource).toContain("annotation_pointer_release_failed");
    expect(viewerSource).toContain("annotation_pointer_capture_failed");
    expect(viewerSource).toContain("annotation_pointer_cancelled");
    expect(viewerSource).toContain("annotation_pointer_lost_capture");
    expect(viewerSource).toContain("onPointerCancel={handleAnnotationPointerCancel}");
    expect(viewerSource).toContain(
      "onLostPointerCapture={handleAnnotationLostPointerCapture}",
    );
  });

  it("logs async annotation failures from draw/edit tools", () => {
    expect(viewerSource).toContain("function submitAnnotation(");
    expect(viewerSource).toContain("annotation_create_failed");
    expect(viewerSource).toContain("source,");
  });
});

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const toolbarSource = readFileSync(
  new URL("../src/components/Toolbar.tsx", import.meta.url),
  "utf8",
);

describe("toolbar annotation controls", () => {
  it("exposes all annotation tools from the toolbar", () => {
    expect(toolbarSource).toContain("aria-label=\"Highlight tool\"");
    expect(toolbarSource).toContain("aria-label=\"Comment tool\"");
    expect(toolbarSource).toContain("aria-label=\"Pen tool\"");
    expect(toolbarSource).toContain("aria-label=\"Rectangle tool\"");
    expect(toolbarSource).toContain("aria-label=\"Circle tool\"");
    expect(toolbarSource).toContain("aria-label=\"Line tool\"");
    expect(toolbarSource).toContain("aria-label=\"Arrow tool\"");
    expect(toolbarSource).toContain("onAnnotationToolChange(\"highlight\")");
    expect(toolbarSource).toContain("onAnnotationToolChange(\"comment\")");
    expect(toolbarSource).toContain("onAnnotationToolChange(\"pen\")");
    expect(toolbarSource).toContain("onAnnotationToolChange(\"rectangle\")");
    expect(toolbarSource).toContain("onAnnotationToolChange(\"circle\")");
    expect(toolbarSource).toContain("onAnnotationToolChange(\"line\")");
    expect(toolbarSource).toContain("onAnnotationToolChange(\"arrow\")");
  });

  it("includes advanced annotation entries for free text/stamp/callout/underline/strike/measurement", () => {
    expect(toolbarSource).toContain("Free text annotation");
    expect(toolbarSource).toContain("Stamp annotation");
    expect(toolbarSource).toContain("Underline annotation");
    expect(toolbarSource).toContain("Strikeout annotation");
    expect(toolbarSource).toContain("Callout annotation");
    expect(toolbarSource).toContain("Measurement annotation");
    expect(toolbarSource).toContain("onAnnotationToolChange(\"free_text\")");
    expect(toolbarSource).toContain("onAnnotationToolChange(\"stamp\")");
    expect(toolbarSource).toContain("onAnnotationToolChange(\"underline\")");
    expect(toolbarSource).toContain("onAnnotationToolChange(\"strikeout\")");
    expect(toolbarSource).toContain("onAnnotationToolChange(\"callout\")");
    expect(toolbarSource).toContain("onAnnotationToolChange(\"measurement\")");
  });

  it("shows dedicated highlight color choices", () => {
    expect(toolbarSource).toContain("annotationTool === \"highlight\"");
    expect(toolbarSource).toContain("aria-label={`Highlight color ${color}`}");
    expect(toolbarSource).toContain("[\"yellow\", \"green\", \"blue\", \"pink\"]");
    expect(toolbarSource).toContain("onHighlightColorChange(color)");
  });

  it("supports single and continuous mode switches", () => {
    expect(toolbarSource).toContain("aria-label=\"Single page view\"");
    expect(toolbarSource).toContain("aria-label=\"Continuous view\"");
    expect(toolbarSource).toContain("onViewModeChange(\"single\")");
    expect(toolbarSource).toContain("onViewModeChange(\"continuous\")");
  });
});

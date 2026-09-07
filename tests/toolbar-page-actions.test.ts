// SPDX-License-Identifier: LicenseRef-PDFluent-Proprietary
// Copyright (c) 2026 Innovation Trigger B.V.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const toolbarSource = readFileSync(
  new URL("../src/components/Toolbar.tsx", import.meta.url),
  "utf8",
);

describe("toolbar page actions", () => {
  it("exposes core document action buttons", () => {
    expect(toolbarSource).toContain("Undo");
    expect(toolbarSource).toContain("Redo");
    expect(toolbarSource).toContain("Sign document");
    expect(toolbarSource).toContain("Rotate left");
    expect(toolbarSource).toContain("Rotate");
    expect(toolbarSource).toContain("Delete page");
    expect(toolbarSource).toContain("Duplicate page");
    expect(toolbarSource).toContain("Extract page");
    expect(toolbarSource).toContain("Print document");
    expect(toolbarSource).toContain("Merge PDFs");
  });

  it("wires actions to existing callbacks", () => {
    expect(toolbarSource).toContain("onUndo");
    expect(toolbarSource).toContain("onRedo");
    expect(toolbarSource).toContain("void onSignDocument();");
    expect(toolbarSource).toContain("onRotatePageCounterClockwise");
    expect(toolbarSource).toContain("onRotatePageClockwise");
    expect(toolbarSource).toContain("onDeletePage");
    expect(toolbarSource).toContain("onDuplicatePage");
    expect(toolbarSource).toContain("onExtractPage");
    expect(toolbarSource).toContain("onPrintDocument");
    expect(toolbarSource).toContain("onMergePdfs");
  });
});
